/**
 * Vários papéis por pessoa no admin: PUT /admin/users/:id/roles recebe a lista COMPLETA desejada.
 *  - `cliente` sempre entra; duplicados saem; lista inválida → 400 INVALID_ROLES;
 *  - não-CEO não mexe em papel administrativo nem em quem já tem um;
 *  - tirar lojista/motoboy com trabalho aberto → 409 ROLE_HAS_OPEN_WORK;
 *  - activeRole volta a cliente quando sai (ou é de equipe); `role` base cai na ordem ceo, lojista, motoboy, cliente;
 *  - PUT /admin/users/:id/role não existe mais.
 */
import request from 'supertest';
import bcrypt from 'bcryptjs';
import { Role } from '@prisma/client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import * as notifier from '../services/notifier';

const DOMAIN = '@papeis-multiplos.test';

// Override de RolePermissions é global: guardamos e restauramos o papel tocado.
let previousGerente: any = null;

beforeAll(async () => {
  previousGerente = await prisma.rolePermissions.findUnique({ where: { role: 'gerente_geral' } });
  const data = { permissions: ['user:manage_roles'], notificationTargets: [] as Role[], updatedBy: 'test-papeis-multiplos' };
  await prisma.rolePermissions.upsert({ where: { role: 'gerente_geral' }, create: { role: 'gerente_geral', ...data }, update: data });
});

afterAll(async () => {
  if (previousGerente) {
    const { permissions, notificationTargets, updatedBy } = previousGerente;
    await prisma.rolePermissions.update({ where: { role: 'gerente_geral' }, data: { permissions, notificationTargets, updatedBy } });
  } else {
    await prisma.rolePermissions.deleteMany({ where: { role: 'gerente_geral' } });
  }
});

afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function createAccount(roles: string[], activeRole: string, role: string) {
  return prisma.user.create({
    data: {
      name: 'Alvo',
      email: `alvo-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`,
      passwordHash: await bcrypt.hash('Senha123!', 4),
      role: role as Role,
      roles: roles as Role[],
      activeRole: activeRole as Role,
    },
  });
}

const putRoles = (actor: TestUser, id: string, roles: unknown) =>
  request(app).put(`/api/admin/users/${id}/roles`).set('Authorization', bearer(actor)).send({ roles });

const sorted = (r?: string[] | null) => [...(r || [])].sort();

describe('PUT /admin/users/:id/roles — CEO', () => {
  it('adiciona motoboy + gerente_motoboys a um cliente', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createAccount(['cliente'], 'cliente', 'cliente');
    const res = await putRoles(ceo, alvo.id, ['cliente', 'motoboy', 'gerente_motoboys']);
    expect(res.status).toBe(200);
    expect(sorted(res.body.user.roles)).toEqual(['cliente', 'gerente_motoboys', 'motoboy']);
    expect(JSON.stringify(res.body)).not.toMatch(/passwordHash/);
    const u = await prisma.user.findUnique({ where: { id: alvo.id } });
    expect(sorted(u?.roles)).toEqual(['cliente', 'gerente_motoboys', 'motoboy']);
    expect(u?.activeRole).toBe('cliente');
    expect(u?.role).toBe('cliente');
  });

  it('tira motoboy (sem entrega aberta)', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createAccount(['cliente', 'motoboy', 'lojista'], 'lojista', 'lojista');
    const res = await putRoles(ceo, alvo.id, ['cliente', 'lojista']);
    expect(res.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: alvo.id } });
    expect(sorted(u?.roles)).toEqual(['cliente', 'lojista']);
    expect(u?.activeRole).toBe('lojista');
    expect(u?.role).toBe('lojista');
  });

  it('lojista + marketing: papel de equipe não vira papel ativo', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createAccount(['cliente'], 'cliente', 'cliente');
    const res = await putRoles(ceo, alvo.id, ['lojista', 'marketing']);
    expect(res.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: alvo.id } });
    expect(sorted(u?.roles)).toEqual(['cliente', 'lojista', 'marketing']);
    expect(u?.activeRole).toBe('cliente');
    expect(u?.role).toBe('cliente');
  });

  it('cliente sempre entra e duplicados saem', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createAccount(['cliente', 'lojista'], 'lojista', 'lojista');
    const res = await putRoles(ceo, alvo.id, ['motoboy', 'motoboy']);
    expect(res.status).toBe(200);
    const u = await prisma.user.findUnique({ where: { id: alvo.id } });
    expect(sorted(u?.roles)).toEqual(['cliente', 'motoboy']);
  });

  it('activeRole volta a cliente quando o papel ativo sai', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createAccount(['cliente', 'lojista', 'motoboy'], 'motoboy', 'lojista');
    const res = await putRoles(ceo, alvo.id, ['cliente', 'lojista']);
    expect(res.status).toBe(200);
    expect(res.body.user.activeRole).toBe('cliente');
    expect(res.body.user.role).toBe('lojista');
  });

  it('role base cai na ordem ceo, lojista, motoboy, cliente', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const a = await createAccount(['cliente', 'gerente_geral'], 'cliente', 'gerente_geral');
    const r1 = await putRoles(ceo, a.id, ['cliente', 'motoboy', 'lojista']);
    expect(r1.status).toBe(200);
    expect(r1.body.user.role).toBe('lojista');

    const b = await createAccount(['cliente', 'lojista'], 'lojista', 'lojista');
    const r2 = await putRoles(ceo, b.id, ['cliente', 'motoboy', 'ceo']);
    expect(r2.status).toBe(200);
    expect(r2.body.user.role).toBe('ceo');
    expect(r2.body.user.activeRole).toBe('cliente');

    const c = await createAccount(['cliente', 'motoboy'], 'motoboy', 'motoboy');
    const r3 = await putRoles(ceo, c.id, ['cliente']);
    expect(r3.status).toBe(200);
    expect(r3.body.user.role).toBe('cliente');
  });

  it.each([
    ['não é array', 'lojista'],
    ['papel desconhecido', ['cliente', 'dono']],
    ['item não-string', ['cliente', 3]],
    ['ausente', undefined],
  ])('lista inválida (%s) → 400 INVALID_ROLES', async (_caso, roles) => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createAccount(['cliente'], 'cliente', 'cliente');
    const res = await putRoles(ceo, alvo.id, roles);
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_ROLES');
    expect(typeof res.body.error).toBe('string');
  });

  it('autoalteração → 400', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await putRoles(ceo, ceo.userId, ['cliente']);
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('Voce nao pode alterar o proprio role. Peca para outro admin.');
  });

  it('usuário inexistente → 404', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await putRoles(ceo, '00000000-0000-0000-0000-000000000000', ['cliente']);
    expect(res.status).toBe(404);
  });

  it('activeRole ceo é preservado quando ceo continua na lista', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createAccount(['cliente', 'ceo'], 'ceo', 'ceo');
    const res = await putRoles(ceo, alvo.id, ['cliente', 'ceo', 'lojista']);
    expect(res.status).toBe(200);
    expect(res.body.user.activeRole).toBe('ceo');
    expect(res.body.user.role).toBe('ceo');
  });

  it('derruba o socket da pessoa ao salvar', async () => {
    const spy = jest.spyOn(notifier, 'disconnectUser').mockImplementation(() => undefined);
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createAccount(['cliente'], 'cliente', 'cliente');
    const res = await putRoles(ceo, alvo.id, ['cliente', 'motoboy']);
    expect(res.status).toBe(200);
    expect(spy).toHaveBeenCalledWith(alvo.id);
  });

  it('erro real do banco ao gravar → 500 (não 404)', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createAccount(['cliente'], 'cliente', 'cliente');
    jest.spyOn(prisma, '$transaction').mockRejectedValueOnce(new Error('db caiu'));
    const res = await putRoles(ceo, alvo.id, ['cliente', 'lojista']);
    expect(res.status).toBe(500);
  });

  it('PUT /admin/users/:id/role não existe mais (404)', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createAccount(['cliente'], 'cliente', 'cliente');
    const res = await request(app).put(`/api/admin/users/${alvo.id}/role`).set('Authorization', bearer(ceo)).send({ role: 'lojista' });
    expect(res.status).toBe(404);
    const u = await prisma.user.findUnique({ where: { id: alvo.id } });
    expect(u?.roles).toEqual(['cliente']);
  });
});

describe('PUT /admin/users/:id/roles — trabalho aberto', () => {
  it('tirar lojista com pedido aberto → 409; depois de entregue → 200', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const comprador = await createTestUser('cliente', DOMAIN);
    const alvo = await createAccount(['cliente', 'lojista'], 'lojista', 'lojista');
    const store = await prisma.store.create({ data: { ownerId: alvo.id, name: 'Loja Papeis', isOpen: true } as any });
    const base = { customerId: comprador.userId, storeId: store.id, totalValue: 50, subtotal: 45, deliveryFee: 5, paymentMethod: 'pix' };
    const o1 = await prisma.order.create({ data: { ...base, status: 'pago' } as any });
    const o2 = await prisma.order.create({ data: { ...base, status: 'enviado' } as any });
    // PIX ainda pendente também é trabalho aberto: pode ser pago depois de a loja fechar.
    const o3 = await prisma.order.create({ data: { ...base, status: 'criado' } as any });
    await prisma.order.create({ data: { ...base, status: 'entregue' } as any });
    // Pedido aberto em loja de OUTRO dono não conta.
    const outroDono = await createTestUser('lojista', DOMAIN);
    const outraLoja = await prisma.store.create({ data: { ownerId: outroDono.userId, name: 'Loja Alheia', isOpen: true } as any });
    await prisma.order.create({ data: { ...base, storeId: outraLoja.id, status: 'pago' } as any });

    const res = await putRoles(ceo, alvo.id, ['cliente']);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'ROLE_HAS_OPEN_WORK', role: 'lojista', count: 3 });
    expect(typeof res.body.error).toBe('string');
    expect(sorted((await prisma.user.findUnique({ where: { id: alvo.id } }))?.roles)).toEqual(['cliente', 'lojista']);

    await prisma.order.updateMany({ where: { id: { in: [o1.id, o2.id, o3.id] } }, data: { status: 'entregue' } });
    const ok = await putRoles(ceo, alvo.id, ['cliente']);
    expect(ok.status).toBe(200);
    expect(ok.body.user.roles).toEqual(['cliente']);
  });

  it('conta antiga (lojista só no campo role) também cai no 409', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const comprador = await createTestUser('cliente', DOMAIN);
    const alvo = await createAccount(['cliente'], 'lojista', 'lojista');
    const store = await prisma.store.create({ data: { ownerId: alvo.id, name: 'Loja Legado', isOpen: true } as any });
    await prisma.order.create({
      data: { customerId: comprador.userId, storeId: store.id, totalValue: 50, subtotal: 45, deliveryFee: 5, paymentMethod: 'pix', status: 'aguardando_motoboy' } as any,
    });
    const res = await putRoles(ceo, alvo.id, ['cliente']);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'ROLE_HAS_OPEN_WORK', role: 'lojista', count: 1 });
  });

  it('tirar motoboy com entrega em andamento → 409; depois de entregue → 200', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const comprador = await createTestUser('cliente', DOMAIN);
    const dono = await createTestUser('lojista', DOMAIN);
    const alvo = await createAccount(['cliente', 'motoboy'], 'motoboy', 'motoboy');
    const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja Entrega', isOpen: true } as any });
    const order = await prisma.order.create({
      data: { customerId: comprador.userId, storeId: store.id, totalValue: 50, subtotal: 45, deliveryFee: 5, paymentMethod: 'pix', status: 'enviado' } as any,
    });
    const d = await prisma.delivery.create({ data: { orderId: order.id, status: 'picked', fee: 5, distance: 2, motoboyId: alvo.id } as any });

    const res = await putRoles(ceo, alvo.id, ['cliente']);
    expect(res.status).toBe(409);
    expect(res.body).toMatchObject({ code: 'ROLE_HAS_OPEN_WORK', role: 'motoboy', count: 1 });

    await prisma.delivery.update({ where: { id: d.id }, data: { status: 'delivered' } });
    const ok = await putRoles(ceo, alvo.id, ['cliente']);
    expect(ok.status).toBe(200);
    expect(ok.body.user.roles).toEqual(['cliente']);
  });
});

describe('PUT /admin/users/:id/roles — quem não é CEO', () => {
  it('não adiciona papel de equipe', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const alvo = await createAccount(['cliente'], 'cliente', 'cliente');
    const res = await putRoles(gerente, alvo.id, ['cliente', 'marketing']);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Somente o CEO pode atribuir papéis administrativos');
    expect(res.body.code).toBe('STAFF_TARGET_FORBIDDEN');
    expect((await prisma.user.findUnique({ where: { id: alvo.id } }))?.roles).toEqual(['cliente']);
  });

  it('não mexe em quem já tem papel administrativo, nem em papel base', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const alvo = await createAccount(['cliente', 'gerente_motoboys'], 'cliente', 'gerente_motoboys');
    const res = await putRoles(gerente, alvo.id, ['cliente', 'gerente_motoboys', 'motoboy']);
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('Somente o CEO pode alterar o papel de um administrador');
    expect(res.body.code).toBe('STAFF_TARGET_FORBIDDEN');
  });

  it('papel base continua delegável', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const alvo = await createAccount(['cliente'], 'cliente', 'cliente');
    const res = await putRoles(gerente, alvo.id, ['cliente', 'lojista', 'motoboy']);
    expect(res.status).toBe(200);
    expect(sorted(res.body.user.roles)).toEqual(['cliente', 'lojista', 'motoboy']);
  });
});

describe('PUT /admin/users/:id/roles — loja ao tirar lojista', () => {
  it('fecha as lojas da pessoa (isOpen false), sem mexer em vitrine nem pausa; devolver o papel não reabre', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createAccount(['cliente', 'lojista'], 'lojista', 'lojista');
    const pausa = new Date(Date.now() + 3600_000);
    const s1 = await prisma.store.create({ data: { ownerId: alvo.id, name: 'Loja A', isOpen: true } as any });
    const s2 = await prisma.store.create({ data: { ownerId: alvo.id, name: 'Loja B', isOpen: true, showInMarketplace: false, pausedUntil: pausa } as any });
    const outroDono = await createTestUser('lojista', DOMAIN);
    const alheia = await prisma.store.create({ data: { ownerId: outroDono.userId, name: 'Loja Alheia', isOpen: true } as any });

    const res = await putRoles(ceo, alvo.id, ['cliente']);
    expect(res.status).toBe(200);
    expect(res.body.storesClosed).toBe(2);
    const a = await prisma.store.findUnique({ where: { id: s1.id } });
    const b = await prisma.store.findUnique({ where: { id: s2.id } });
    expect(a?.isOpen).toBe(false);
    expect(a?.showInMarketplace).toBe(true);
    expect(b?.isOpen).toBe(false);
    expect(b?.showInMarketplace).toBe(false);
    expect(b?.pausedUntil?.getTime()).toBe(pausa.getTime());
    expect((await prisma.store.findUnique({ where: { id: alheia.id } }))?.isOpen).toBe(true);

    const volta = await putRoles(ceo, alvo.id, ['cliente', 'lojista']);
    expect(volta.status).toBe(200);
    expect(volta.body.storesClosed).toBe(0);
    expect((await prisma.store.findUnique({ where: { id: s1.id } }))?.isOpen).toBe(false);
  });

  it('sem tirar lojista, a loja continua aberta e storesClosed é 0', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createAccount(['cliente', 'lojista'], 'lojista', 'lojista');
    const loja = await prisma.store.create({ data: { ownerId: alvo.id, name: 'Loja Fica', isOpen: true } as any });
    const res = await putRoles(ceo, alvo.id, ['cliente', 'lojista', 'motoboy']);
    expect(res.status).toBe(200);
    expect(res.body.storesClosed).toBe(0);
    expect((await prisma.store.findUnique({ where: { id: loja.id } }))?.isOpen).toBe(true);
  });

  it('409 com pedido aberto não fecha a loja', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const comprador = await createTestUser('cliente', DOMAIN);
    const alvo = await createAccount(['cliente', 'lojista'], 'lojista', 'lojista');
    const loja = await prisma.store.create({ data: { ownerId: alvo.id, name: 'Loja Ocupada', isOpen: true } as any });
    await prisma.order.create({
      data: { customerId: comprador.userId, storeId: loja.id, totalValue: 50, subtotal: 45, deliveryFee: 5, paymentMethod: 'pix', status: 'pago' } as any,
    });
    const res = await putRoles(ceo, alvo.id, ['cliente']);
    expect(res.status).toBe(409);
    expect((await prisma.store.findUnique({ where: { id: loja.id } }))?.isOpen).toBe(true);
  });
});
