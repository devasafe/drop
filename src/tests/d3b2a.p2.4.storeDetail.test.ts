/**
 * D3b-2a · P2.4 — GET /admin/stores/:id e /stores/:id/timeline (spec 6): perfil com a pausa do admin,
 * números de 30 dias (cancelamento por culpa da loja), avaliações com comentário, recebimento, plano
 * (só leitura), pedidos, histórico e `can`. As rotas vizinhas /stores/saas-billing e /stores/asaas
 * continuam nos routers delas.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createOpsOrder, createOpsStore, grantRolePermissions } from './helpers/d3b1Ops';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { addAccountActions, cleanupAccountsFixtures, createPerson, daysBefore, randomDigits } from './helpers/d3b2aRead';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';

const DOMAIN = '@d3b2ap24.test';
const MARK = 'd3b2ap24';
const STORE_PIX = 'pix-secreto-loja-d3b2a@x.com';
const MIN_MS = 60_000;
let ceo: TestUser;
let tag: string;
let customerId: string;
let restoreConfig: () => Promise<void>;

beforeAll(async () => {
  restoreConfig = await snapshotPlatformConfig();
});
afterAll(async () => {
  await restoreConfig();
});
beforeEach(async () => {
  await updatePlatformConfig({ settlementMode: 'custodia' }, 'd3b2a-p24');
  ceo = await createTestUser('ceo', DOMAIN);
  tag = `p24${Date.now().toString(36)}${randomDigits(4)}`;
  customerId = await createPerson(DOMAIN, { name: `${tag} Cliente` });
});
afterEach(async () => {
  await cleanupAccountsFixtures(DOMAIN, MARK);
});

const detail = (id: string, who: TestUser = ceo) =>
  request(app).get(`/api/admin/stores/${id}`).set('Authorization', bearer(who));
const timeline = (id: string, query: Record<string, string> = {}, who: TestUser = ceo) =>
  request(app).get(`/api/admin/stores/${id}/timeline`).query(query).set('Authorization', bearer(who));

describe('GET /admin/stores/:id · CEO', () => {
  it('perfil com a pausa do admin, 30 dias, avaliações, recebimento, plano, pedidos, histórico e can', async () => {
    const now = new Date();
    const cnpj = `1${randomDigits(13)}`;
    const dono = await createPerson(DOMAIN, { name: `${tag} Dono`, roles: ['lojista', 'cliente'], role: 'lojista', activeRole: 'lojista' });
    const loja = await prisma.store.create({
      data: {
        ownerId: dono, name: `${tag} Loja`, cnpj, city: 'Campinas', plan: 2, isOpen: true,
        adminPausedAt: new Date('2026-10-10T12:00:00.000Z'), adminPausedBy: ceo.userId, adminPauseReason: 'Muitas reclamações',
        asaas: { status: 'active', pixKey: STORE_PIX, pixKeyType: 'email' },
      },
    });
    const trialEndsAt = new Date('2026-11-01T00:00:00.000Z');
    await prisma.storeSaasBilling.create({ data: { storeId: loja.id, status: 'trialing', trialEndsAt } });

    // 6 pedidos nos últimos 30 dias (o último é o mais novo).
    const recent: string[] = [];
    for (let i = 0; i < 6; i++) {
      const status = i >= 3 ? 'cancelado' : 'entregue';
      const { orderId } = await createOpsOrder({ customerId, storeId: loja.id, status, createdAt: new Date(daysBefore(now, 2).getTime() + i * MIN_MS) });
      recent.push(orderId);
    }
    await prisma.order.update({ where: { id: recent[0] }, data: { storeRating: 4, storeComment: 'Bom' } });
    await prisma.order.update({ where: { id: recent[1] }, data: { storeRating: 2, storeComment: 'Demorou', storeReply: 'Desculpe!' } });
    await prisma.order.update({ where: { id: recent[2] }, data: { storeRating: 5, storeComment: '' } });
    // Comentário sem nota não é avaliação (a P3 exige `rating` número).
    await prisma.order.update({ where: { id: recent[5] }, data: { storeComment: 'Sem nota' } });
    const cancel = (orderId: string, data: Record<string, unknown>) =>
      prisma.cancellation.create({ data: { orderId, reason: 'Teste', reasonCode: 'other', ...data } as any });
    await cancel(recent[3], { cancelledBy: 'store' });
    await cancel(recent[4], { cancelledBy: 'admin', faultParty: 'store', adminId: ceo.userId });
    await cancel(recent[5], { cancelledBy: 'customer' });

    // 19 pedidos de 40 dias atrás; 10 com comentário; 1 cancelado pela loja há 40 dias (não conta).
    for (let i = 0; i < 19; i++) {
      const { orderId } = await createOpsOrder({ customerId, storeId: loja.id, status: 'entregue', createdAt: new Date(daysBefore(now, 40).getTime() + i * MIN_MS) });
      if (i < 10) await prisma.order.update({ where: { id: orderId }, data: { storeRating: 3, storeComment: `Antigo ${i}` } });
      if (i === 18) await cancel(orderId, { cancelledBy: 'store', createdAt: daysBefore(now, 40) });
    }
    await addAccountActions({ storeId: loja.id }, ceo.userId, 3);

    const res = await detail(loja.id);
    expect(res.status).toBe(200);
    expect(JSON.stringify(res.body)).not.toContain(STORE_PIX);

    expect(res.body.profile).toEqual({
      id: loja.id,
      name: `${tag} Loja`,
      cnpj,
      owner: { id: dono, name: `${tag} Dono` },
      city: 'Campinas',
      situation: 'admin_paused',
      adminPause: { at: '2026-10-10T12:00:00.000Z', by: { id: ceo.userId, name: 'User ceo' }, reason: 'Muitas reclamações' },
    });
    expect(res.body.stats30d).toEqual({ orders: 6, cancelledByStore: 2, rating: 3.7 });
    expect(res.body.reviews).toHaveLength(10);
    expect(res.body.reviews[0]).toEqual({ orderId: recent[1], rating: 2, comment: 'Demorou', reply: 'Desculpe!', createdAt: expect.any(String) });
    expect(res.body.reviews[1]).toEqual(expect.objectContaining({ orderId: recent[0], comment: 'Bom', reply: null }));
    expect(res.body.reviews.map((r: { orderId: string }) => r.orderId)).not.toContain(recent[2]);
    expect(res.body.reviews.map((r: { orderId: string }) => r.orderId)).not.toContain(recent[5]);
    expect(res.body.receiving).toEqual({ status: 'na', detail: null });
    expect(res.body.plan).toEqual({ plan: 2, mode: 'custodia', saas: { status: 'trialing', trialEndsAt: trialEndsAt.toISOString(), paidUntil: null, cancelledAt: null, coveredUntil: expect.any(String) } });
    expect(res.body.orders).toHaveLength(20);
    expect(res.body.orders[0]).toEqual({
      id: recent[5], shortId: recent[5].slice(-6), status: 'cancelado', total: 30, customerName: `${tag} Cliente`, createdAt: expect.any(String),
    });
    expect(res.body.timeline.items).toHaveLength(3);
    // D3b-2b, onda final: na custódia não há mensalidade, então a ficha não oferece estender nem cancelar.
    expect(res.body.can).toEqual({ pause: false, unpause: true, note: true, extendTrial: false, cancelSaas: false });
  });
});

describe('GET /admin/stores/:id · can e 404', () => {
  it('store:edit libera pausar a loja que não está pausada; só store:view_all não libera nada', async () => {
    const id = await createOpsStore(DOMAIN, { name: `${tag} Livre` });
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restore = await grantRolePermissions('gerente_geral', ['store:view_all']);
    try {
      const semEdit = await detail(id, gerente);
      expect(semEdit.status).toBe(200);
      expect(semEdit.body.can).toEqual({ pause: false, unpause: false, note: true, extendTrial: false, cancelSaas: false });
      expect(semEdit.body.profile).toEqual(expect.objectContaining({ situation: 'open', adminPause: null }));
      await grantRolePermissions('gerente_geral', ['store:view_all', 'store:edit']);
      expect((await detail(id, gerente)).body.can).toEqual({ pause: true, unpause: false, note: true, extendTrial: false, cancelSaas: false });
    } finally {
      await restore();
    }
  });

  it('pausa feita pelo sistema: autor sem nome', async () => {
    const id = await createOpsStore(DOMAIN, { name: `${tag} Sistema` });
    await prisma.store.update({
      where: { id },
      data: { adminPausedAt: new Date(), adminPausedBy: 'system', adminPauseReason: 'Mensalidade cancelada' },
    });
    expect((await detail(id)).body.profile.adminPause).toEqual(expect.objectContaining({ by: { id: 'system', name: null }, reason: 'Mensalidade cancelada' }));
  });

  it('loja que não existe: 404 STORE_NOT_FOUND; sem store:view_all: 403', async () => {
    const res = await detail('nao-existe-d3b2a');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Loja não encontrada.', code: 'STORE_NOT_FOUND' });
    const cliente = await createTestUser('cliente', DOMAIN);
    const id = await createOpsStore(DOMAIN, { name: `${tag} Fechada` });
    expect((await detail(id, cliente)).status).toBe(403);
    expect((await timeline(id, {}, cliente)).status).toBe(403);
  });
});

describe('GET /admin/stores/:id · receiving.detail só para o CEO', () => {
  const ASAAS_ERROR = 'Asaas 400: invalid_walletId d3b2a-p24';

  it('gerente com store:view_all vê o status do recebimento, sem o texto do erro; o CEO vê o texto', async () => {
    const id = await createOpsStore(DOMAIN, { name: `${tag} Erro` });
    await prisma.store.update({ where: { id }, data: { asaas: { status: 'error', lastError: ASAAS_ERROR } } });
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restore = await grantRolePermissions('gerente_geral', ['store:view_all']);
    try {
      const res = await detail(id, gerente);
      expect(res.status).toBe(200);
      expect(res.body.receiving).toEqual({ status: 'na', detail: null });
      expect(JSON.stringify(res.body)).not.toContain(ASAAS_ERROR);
    } finally {
      await restore();
    }
    expect((await detail(id)).body.receiving).toEqual({ status: 'na', detail: ASAAS_ERROR });
  });
});

describe('GET /admin/stores/:id/timeline', () => {
  it('primeira página, mais nova primeiro; loja que não existe responde 404', async () => {
    const id = await createOpsStore(DOMAIN, { name: `${tag} Hist` });
    const created = await addAccountActions({ storeId: id }, ceo.userId, 3);
    const res = await timeline(id);
    expect(res.status).toBe(200);
    expect(res.body.items.map((i: { id: string }) => i.id)).toEqual([...created].reverse());
    expect(res.body.nextCursor).toBeNull();

    const missing = await timeline('nao-existe-d3b2a');
    expect(missing.status).toBe(404);
    expect(missing.body.code).toBe('STORE_NOT_FOUND');
  });
});

describe('rotas vizinhas em /admin/stores continuam nos routers delas', () => {
  it('GET /stores/saas-billing responde a lista da mensalidade', async () => {
    const res = await request(app).get('/api/admin/stores/saas-billing').set('Authorization', bearer(ceo));
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(Array.isArray(res.body.data)).toBe(true);
    expect(res.body).not.toHaveProperty('profile');
  });

  it('GET /stores/asaas e /stores/:id/asaas respondem pelo router do Asaas', async () => {
    const id = await createOpsStore(DOMAIN, { name: `${tag} Asaas` });
    const listAsaas = await request(app).get('/api/admin/stores/asaas').set('Authorization', bearer(ceo));
    expect(listAsaas.status).toBe(200);
    expect(listAsaas.body.success).toBe(true);
    expect(Array.isArray(listAsaas.body.data)).toBe(true);
    const one = await request(app).get(`/api/admin/stores/${id}/asaas`).set('Authorization', bearer(ceo));
    expect(one.status).toBe(200);
    expect(one.body.data.status).toBe('none');
  });

  it('quem tem store:view_all mas não settings:manage leva 403 em saas-billing, não a ficha nem 404', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restore = await grantRolePermissions('gerente_geral', ['store:view_all']);
    try {
      const res = await request(app).get('/api/admin/stores/saas-billing').set('Authorization', bearer(gerente));
      expect(res.status).toBe(403);
      expect(res.body.code).not.toBe('STORE_NOT_FOUND');
      expect(res.body).not.toHaveProperty('profile');
    } finally {
      await restore();
    }
  });
});
