/**
 * D3b-2a · P2.2 — GET /admin/users/:id e /users/:id/timeline (spec 6). Blocos condicionais (motoboy,
 * lojas, carteira); dinheiro só com payout:view ou money:overview (sem elas, as chaves nem entram no
 * JSON); telefone com os 4 últimos dígitos; CPF e chave Pix fora da resposta; `can` pelas permissões.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createOpsOrder, createOpsStore, grantRolePermissions } from './helpers/d3b1Ops';
import { addAccountActions, cleanupAccountsFixtures, createDebt, createPerson, daysBefore, randomDigits } from './helpers/d3b2aRead';

const DOMAIN = '@d3b2ap22.test';
const MARK = 'd3b2ap22';
const PIX = 'segredo-pix-d3b2a@exemplo.com';
const COURIER_VERIFICATION = {
  email: { status: 'verified', verifiedAt: '2026-09-01T10:00:00.000Z' },
  document: { type: 'cpf', status: 'approved', reviewedAt: '2026-09-02T10:00:00.000Z' },
  facial: { status: 'approved' },
  courier: { status: 'approved', cnhNumber: '12345678901', plate: 'ABC1D23', reviewedAt: '2026-09-03T10:00:00.000Z' },
};
let ceo: TestUser;
let tag: string;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  tag = `p22${Date.now().toString(36)}${randomDigits(4)}`;
});
afterEach(async () => {
  await cleanupAccountsFixtures(DOMAIN, MARK);
});

const detail = (id: string, who: TestUser = ceo) =>
  request(app).get(`/api/admin/users/${id}`).set('Authorization', bearer(who));
const timeline = (id: string, query: Record<string, string> = {}, who: TestUser = ceo) =>
  request(app).get(`/api/admin/users/${id}/timeline`).query(query).set('Authorization', bearer(who));
const sorted = (ids: string[]) => [...ids].sort();

/**
 * Motoboy com 2 corridas entregues nos últimos 30 dias (R$ 8,50 de repasse na custódia, mais um repasse
 * cancelado de R$ 99 que não conta, e R$ 3,00 de Pix da loja no direto) e 1 corrida de 40 dias atrás.
 */
async function createMotoboyWithRides(now: Date) {
  const cpf = `9${randomDigits(10)}`;
  const id = await createPerson(DOMAIN, {
    name: `${tag} Motoboy`,
    roles: ['motoboy', 'cliente'],
    role: 'motoboy',
    activeRole: 'motoboy',
    cpf,
    telefone: '(11) 98765-4321',
    verification: COURIER_VERIFICATION,
    asaas: { pixKey: PIX, pixKeyType: 'email' },
  });
  const storeId = await createOpsStore(DOMAIN, { name: `${tag} Loja` });
  const customerId = await createPerson(DOMAIN, { name: `${tag} Cliente` });

  const r1 = await createOpsOrder({
    customerId, storeId, status: 'entregue',
    delivery: { status: 'delivered', motoboyId: id, deliveredAt: daysBefore(now, 5) },
  });
  await prisma.payout.create({ data: { recipientType: 'motoboy', recipientId: id, orderId: r1.orderId, deliveryId: r1.deliveryId, amount: 8.5 } });
  await prisma.payout.create({
    data: { recipientType: 'motoboy', recipientId: id, orderId: r1.orderId, deliveryId: r1.deliveryId, amount: 99, status: 'cancelled' },
  });

  const r2 = await createOpsOrder({
    customerId, storeId, status: 'entregue', paymentProvider: 'asaas_loja',
    delivery: { status: 'delivered', motoboyId: id, deliveredAt: daysBefore(now, 3) },
  });
  await prisma.motoboyTransfer.create({
    data: { deliveryId: r2.deliveryId as string, orderId: r2.orderId, storeId, motoboyId: id, amount: 3, pixKeyEncrypted: 'x', pixKeyType: 'email' },
  });

  const old = await createOpsOrder({
    customerId, storeId, status: 'entregue',
    delivery: { status: 'delivered', motoboyId: id, deliveredAt: daysBefore(now, 40) },
  });
  await prisma.payout.create({ data: { recipientType: 'motoboy', recipientId: id, orderId: old.orderId, deliveryId: old.deliveryId, amount: 100 } });

  await prisma.wallet.create({
    data: { owner: id, ownerType: 'motoboy', balance: 50, availableBalance: 40, blockedBalance: 10, pendingBalance: 0 },
  });
  return { id, cpf, storeId };
}

describe('GET /admin/users/:id · CEO', () => {
  it('vê todos os blocos; telefone só com os 4 últimos; CPF e chave Pix não saem', async () => {
    const now = new Date();
    const { id, cpf, storeId } = await createMotoboyWithRides(now);
    const order = await createOpsOrder({ customerId: id, storeId, totalValue: 42, createdAt: daysBefore(now, 1) });
    const debtPending = await createDebt(id, 6);
    const debtCollected = await createDebt(id, 4, 'collected');
    await addAccountActions({ userId: id }, ceo.userId, 2);
    // Carteira de compras separada da de entregas: as duas aparecem, sem somar.
    await prisma.wallet.create({ data: { owner: id, ownerType: 'user', balance: 7, availableBalance: 7, blockedBalance: 0, pendingBalance: 0 } });

    const res = await detail(id);
    expect(res.status).toBe(200);
    const text = JSON.stringify(res.body);
    expect(text).not.toContain(cpf);
    expect(text).not.toContain(PIX);
    expect(text).not.toContain('98765');

    expect(res.body.profile).toEqual(expect.objectContaining({
      id,
      name: `${tag} Motoboy`,
      phoneLast4: '4321',
      activeRole: 'motoboy',
      status: 'active',
      block: null,
      lastSeenAt: null,
    }));
    expect(sorted(res.body.profile.roles)).toEqual(['cliente', 'motoboy']);
    expect(res.body.verification).toEqual([
      { kind: 'email', status: 'approved', reason: null, at: '2026-09-01T10:00:00.000Z' },
      { kind: 'document', status: 'approved', reason: null, at: '2026-09-02T10:00:00.000Z' },
      { kind: 'facial', status: 'approved', reason: null, at: null },
      { kind: 'courier', status: 'approved', reason: null, at: '2026-09-03T10:00:00.000Z' },
    ]);
    expect(res.body.motoboy).toEqual({
      cnh: '12345678901', plate: 'ABC1D23', courierStatus: 'approved', hasPixKey: true, deliveries30d: 2, earnings30d: 11.5,
    });
    expect(res.body.wallets).toEqual({
      cliente: { balance: 7, available: 7, pending: 0, blocked: 0 },
      motoboy: { balance: 50, available: 40, pending: 0, blocked: 10 },
    });
    expect(res.body.orders).toEqual([{
      id: order.orderId,
      shortId: order.orderId.slice(-6),
      status: 'pago',
      total: 42,
      store: { id: storeId, name: `${tag} Loja` },
      createdAt: expect.any(String),
    }]);
    expect(res.body.debts.map((d: { id: string; status: string }) => `${d.id}:${d.status}`).sort())
      .toEqual([`${debtCollected}:collected`, `${debtPending}:pending`].sort());
    expect(res.body.debts.find((d: { id: string }) => d.id === debtPending)).toEqual(expect.objectContaining({ amount: 6, forgivenAt: null }));
    expect(res.body.timeline.items).toHaveLength(2);
    expect(res.body.timeline.items[0].actor).toEqual(expect.objectContaining({ id: ceo.userId, name: 'User ceo' }));
    expect(res.body.can).toEqual({ block: true, unblock: false, disconnect: true, roles: true, forgiveDebt: true, note: true });
    expect(res.body).not.toHaveProperty('stores');
  });
});

describe('GET /admin/users/:id · dinheiro sensível', () => {
  it('sem payout:view nem money:overview, wallets e earnings30d nem entram no JSON; can.block é false', async () => {
    const { id } = await createMotoboyWithRides(new Date());
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restore = await grantRolePermissions('gerente_geral', ['user:view_all']);
    try {
      const res = await detail(id, gerente);
      expect(res.status).toBe(200);
      expect(res.body).not.toHaveProperty('wallets');
      expect(res.body.motoboy).not.toHaveProperty('earnings30d');
      const text = JSON.stringify(res.body);
      expect(text).not.toContain('"wallets"');
      expect(text).not.toContain('earnings30d');
      expect(text).not.toContain(PIX);
      expect(res.body.motoboy).toEqual({
        cnh: '12345678901', plate: 'ABC1D23', courierStatus: 'approved', hasPixKey: true, deliveries30d: 2,
      });
      expect(res.body.can).toEqual({ block: false, unblock: false, disconnect: false, roles: false, forgiveDebt: false, note: true });

      const put = await request(app)
        .put(`/api/admin/users/${id}/status`)
        .set('Authorization', bearer(gerente))
        .send({ status: 'blocked', reason: 'Tentativa sem permissão' });
      expect(put.status).toBe(403);
      expect((await prisma.user.findUniqueOrThrow({ where: { id } })).status).toBe('active');
    } finally {
      await restore();
    }
  });

  it.each(['payout:view', 'money:overview'])('com %s, wallets e earnings30d aparecem', async (permission) => {
    const { id } = await createMotoboyWithRides(new Date());
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restore = await grantRolePermissions('gerente_geral', ['user:view_all', permission]);
    try {
      const res = await detail(id, gerente);
      expect(res.status).toBe(200);
      expect(res.body.motoboy.earnings30d).toBe(11.5);
      expect(res.body.wallets).toEqual({ cliente: null, motoboy: { balance: 50, available: 40, pending: 0, blocked: 10 } });
    } finally {
      await restore();
    }
  });
});

describe('GET /admin/users/:id · blocos e can', () => {
  it('lojista: bloco stores com a situação de cada loja; sem bloco motoboy', async () => {
    const dono = await createPerson(DOMAIN, { name: `${tag} Dono`, roles: ['lojista', 'cliente'], role: 'lojista', activeRole: 'lojista' });
    const aberta = await prisma.store.create({ data: { ownerId: dono, name: 'A aberta', isOpen: true } });
    const pausada = await prisma.store.create({
      data: { ownerId: dono, name: 'B pausada', isOpen: true, pausedUntil: new Date(Date.now() + 3_600_000) },
    });
    const fechada = await prisma.store.create({ data: { ownerId: dono, name: 'C fechada', isOpen: false } });
    const pelaDrop = await prisma.store.create({
      data: { ownerId: dono, name: 'D drop', isOpen: true, adminPausedAt: new Date(), adminPausedBy: ceo.userId, adminPauseReason: 'Muitas reclamações' },
    });

    const res = await detail(dono);
    expect(res.status).toBe(200);
    expect(res.body.stores).toEqual([
      { id: aberta.id, name: 'A aberta', situation: 'open' },
      { id: pausada.id, name: 'B pausada', situation: 'paused' },
      { id: fechada.id, name: 'C fechada', situation: 'closed' },
      { id: pelaDrop.id, name: 'D drop', situation: 'admin_paused' },
    ]);
    expect(res.body).not.toHaveProperty('motoboy');
  });

  it('cliente bloqueado: motivo, data e autor; telefone curto não vira número; só Desbloquear; sem motoboy nem lojas', async () => {
    const blockedAt = new Date('2026-10-01T12:00:00.000Z');
    const id = await createPerson(DOMAIN, {
      name: `${tag} Bruno`, status: 'blocked', blockReason: 'Fraude no cupom', blockedBy: ceo.userId, blockedAt, telefone: '123',
    });
    const res = await detail(id);
    expect(res.body.profile).toEqual(expect.objectContaining({
      status: 'blocked',
      block: { reason: 'Fraude no cupom', at: blockedAt.toISOString(), by: { id: ceo.userId, name: 'User ceo' } },
      phoneLast4: null,
    }));
    expect(res.body.can).toEqual({ block: false, unblock: true, disconnect: true, roles: true, forgiveDebt: true, note: true });
    expect(res.body).not.toHaveProperty('motoboy');
    expect(res.body).not.toHaveProperty('stores');
    expect(res.body.verification).toEqual([
      { kind: 'email', status: 'none', reason: null, at: null },
      { kind: 'document', status: 'none', reason: null, at: null },
    ]);
  });

  it('papéis: quem não é CEO não mexe em conta da equipe; ninguém age sobre a própria conta', async () => {
    const marketing = await createPerson(DOMAIN, { name: `${tag} Mia`, roles: ['cliente', 'marketing'] });
    const cliente = await createPerson(DOMAIN, { name: `${tag} Ana` });
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restore = await grantRolePermissions('gerente_geral', ['user:view_all', 'user:manage_roles', 'user:block', 'user:debt_forgive']);
    try {
      expect((await detail(marketing, gerente)).body.can)
        .toEqual({ block: true, unblock: false, disconnect: true, roles: false, forgiveDebt: true, note: true });
      expect((await detail(cliente, gerente)).body.can)
        .toEqual({ block: true, unblock: false, disconnect: true, roles: true, forgiveDebt: true, note: true });
      expect((await detail(gerente.userId, gerente)).body.can)
        .toEqual({ block: false, unblock: false, disconnect: false, roles: false, forgiveDebt: false, note: true });
    } finally {
      await restore();
    }
    expect((await detail(marketing)).body.can)
      .toEqual({ block: true, unblock: false, disconnect: true, roles: true, forgiveDebt: true, note: true });
  });

  it('pessoa que não existe: 404 USER_NOT_FOUND', async () => {
    const res = await detail('nao-existe-d3b2a');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Pessoa não encontrada.', code: 'USER_NOT_FOUND' });
  });

  it('sem user:view_all: 403 na ficha e no histórico', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    expect((await detail(cliente.userId, cliente)).status).toBe(403);
    expect((await timeline(cliente.userId, {}, cliente)).status).toBe(403);
  });
});

describe('GET /admin/users/:id/timeline', () => {
  it('a ficha traz as 50 mais novas; o cursor traz o resto sem repetir', async () => {
    const id = await createPerson(DOMAIN, { name: `${tag} Hist` });
    const created = await addAccountActions({ userId: id }, ceo.userId, 55);

    const first = await detail(id);
    expect(first.body.timeline.items).toHaveLength(50);
    expect(first.body.timeline.items[0].id).toBe(created[54]);
    expect(first.body.timeline.nextCursor).toEqual(expect.any(String));

    const rest = await timeline(id, { cursor: first.body.timeline.nextCursor });
    expect(rest.status).toBe(200);
    expect(rest.body.items).toHaveLength(5);
    expect(rest.body.nextCursor).toBeNull();

    const all = [...first.body.timeline.items, ...rest.body.items].map((i: { id: string }) => i.id);
    expect(new Set(all).size).toBe(55);
    expect(sorted(all)).toEqual(sorted(created));
  });

  it('sem cursor é a primeira página; pessoa que não existe responde 404', async () => {
    const id = await createPerson(DOMAIN, { name: `${tag} Hist2` });
    const created = await addAccountActions({ userId: id }, ceo.userId, 3);
    const res = await timeline(id);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([...created].reverse());
    expect(res.body.nextCursor).toBeNull();

    const missing = await timeline('nao-existe-d3b2a');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('USER_NOT_FOUND');
  });
});
