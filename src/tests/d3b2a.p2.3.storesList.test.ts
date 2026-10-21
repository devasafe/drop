/**
 * D3b-2a · P2.3 — GET /admin/stores (spec 6): colunas (nota de 90 dias, cancelamento de 30 dias com
 * mínimo de 5 pedidos, recebimento, situação com a pausa do admin), atenção primeiro e depois o
 * nome, cursor composto estável, filtros e busca por nome ou CNPJ.
 */
import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createOpsOrder, createOpsStore, grantRolePermissions } from './helpers/d3b1Ops';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { DAY_MS, cleanupAccountsFixtures, createPerson, daysBefore, randomDigits } from './helpers/d3b2aRead';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';

const DOMAIN = '@d3b2ap23.test';
const MARK = 'd3b2ap23';
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
  await updatePlatformConfig({ settlementMode: 'custodia' }, 'd3b2a-p23');
  ceo = await createTestUser('ceo', DOMAIN);
  tag = `p23${Date.now().toString(36)}${randomDigits(4)}`;
  customerId = await createPerson(DOMAIN, { name: `${tag} Cliente` });
});
afterEach(async () => {
  await cleanupAccountsFixtures(DOMAIN, MARK);
});

const list = (query: Record<string, string>, who: TestUser = ceo) =>
  request(app).get('/api/admin/stores').query(query).set('Authorization', bearer(who));
const idsOf = (res: request.Response): string[] => {
  expect(res.body).toEqual(expect.objectContaining({ items: expect.any(Array) }));
  return res.body.items.map((s: { id: string }) => s.id);
};
const byId = (res: request.Response) => new Map(res.body.items.map((s: { id: string }) => [s.id, s]));
const store = (name: string) => createOpsStore(DOMAIN, { name: `${tag} ${name}` });

/** `n` pedidos criados `daysAgo` dias atrás; os `cancelled` primeiros ficam cancelados. */
async function ordersFor(storeId: string, n: number, opts: { cancelled?: number; daysAgo?: number } = {}) {
  for (let i = 0; i < n; i++) {
    await createOpsOrder({
      customerId,
      storeId,
      status: i < (opts.cancelled ?? 0) ? 'cancelado' : 'entregue',
      createdAt: daysBefore(new Date(), opts.daysAgo ?? 1),
    });
  }
}

describe('GET /admin/stores · colunas', () => {
  it('item com as colunas da spec', async () => {
    const id = await store('Loja A');
    const now = new Date();
    for (const [rating, days] of [[4, 10], [5, 20], [1, 100]]) {
      const { orderId } = await createOpsOrder({ customerId, storeId: id, status: 'entregue', createdAt: daysBefore(now, days) });
      await prisma.order.update({ where: { id: orderId }, data: { storeRating: rating } });
    }
    const res = await list({ q: `${tag} Loja A` });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({
      items: [{
        id,
        name: `${tag} Loja A`,
        ownerName: 'Dono de Loja (teste)',
        plan: 2,
        mode: 'custodia',
        rating90d: 4.5,
        cancelRate30d: null,
        receiving: 'na',
        situation: 'open',
        attention: false,
      }],
      nextCursor: null,
    });
  });

  it('o plano vem da StoreSubscription quando ela existe', async () => {
    const id = await store('Plano');
    await prisma.storeSubscription.create({ data: { storeId: id, storeName: 'Plano', currentPlan: 'plan3' } });
    expect((await list({ q: `${tag} Plano` })).body.items[0].plan).toBe(3);
  });

  it('situação: aberta, fechada, pausada pelo lojista e pausada pelo admin', async () => {
    const aberta = await store('s-aberta');
    const fechada = await store('s-fechada');
    await prisma.store.update({ where: { id: fechada }, data: { isOpen: false } });
    const pausada = await store('s-pausada');
    await prisma.store.update({ where: { id: pausada }, data: { pausedUntil: new Date(Date.now() + 3_600_000) } });
    const pelaDrop = await store('s-drop');
    await prisma.store.update({
      where: { id: pelaDrop },
      data: { adminPausedAt: new Date(), adminPausedBy: ceo.userId, adminPauseReason: 'Fraude' },
    });
    const by = byId(await list({ q: `${tag} s-` }));
    expect((by.get(aberta) as any).situation).toBe('open');
    expect((by.get(fechada) as any).situation).toBe('closed');
    expect((by.get(pausada) as any).situation).toBe('paused');
    expect((by.get(pelaDrop) as any)).toEqual(expect.objectContaining({ situation: 'admin_paused', attention: true }));
  });

  it('cancelRate30d: cancelados sobre pedidos dos últimos 30 dias, null com menos de 5', async () => {
    const vinte = await store('c-vinte');
    await ordersFor(vinte, 5, { cancelled: 1 });
    const dez = await store('c-dez');
    await ordersFor(dez, 10, { cancelled: 1 });
    const poucos = await store('c-poucos');
    await ordersFor(poucos, 4, { cancelled: 2 });
    const antigo = await store('c-antigo');
    await ordersFor(antigo, 5, { cancelled: 5, daysAgo: 40 });

    const by = byId(await list({ q: `${tag} c-` }));
    expect(by.get(vinte)).toEqual(expect.objectContaining({ cancelRate30d: 0.2, attention: true }));
    expect(by.get(dez)).toEqual(expect.objectContaining({ cancelRate30d: 0.1, attention: false }));
    expect(by.get(poucos)).toEqual(expect.objectContaining({ cancelRate30d: null, attention: false }));
    expect(by.get(antigo)).toEqual(expect.objectContaining({ cancelRate30d: null, attention: false }));
  });
});

describe('GET /admin/stores · recebimento', () => {
  it('custódia com gateway Asaas: chave Pix e subconta = ok, erro na subconta = problema e atenção, só a chave ou nada = pendente', async () => {
    // O repasse (asaasGateway) exige a subconta (asaas.apiKeyEncrypted) e a chave Pix (asaas.pixKey).
    const ok = await store('r-ok');
    await prisma.store.update({
      where: { id: ok },
      data: { asaas: { status: 'active', apiKeyEncrypted: 'subconta-cifrada-d3b2a', pixKey: 'pix-da-loja-d3b2a@x.com', pixKeyType: 'email' } },
    });
    const soPix = await store('r-so-pix');
    await prisma.store.update({ where: { id: soPix }, data: { asaas: { status: 'active', pixKey: 'pix-sem-subconta-d3b2a@x.com', pixKeyType: 'email' } } });
    const erro = await store('r-erro');
    await prisma.store.update({ where: { id: erro }, data: { asaas: { status: 'error', lastError: 'Faltam dados p/ subconta' } } });
    const nada = await store('r-nada');

    const original = env.PAYMENT_GATEWAY;
    env.PAYMENT_GATEWAY = 'asaas';
    try {
      const res = await list({ q: `${tag} r-` });
      const by = byId(res);
      expect(by.get(ok)).toEqual(expect.objectContaining({ receiving: 'ok', attention: false }));
      expect(by.get(erro)).toEqual(expect.objectContaining({ receiving: 'problem', attention: true }));
      expect(by.get(soPix)).toEqual(expect.objectContaining({ receiving: 'pending', attention: false }));
      expect(by.get(nada)).toEqual(expect.objectContaining({ receiving: 'pending', attention: false }));
      expect(JSON.stringify(res.body)).not.toContain('pix-da-loja-d3b2a');
      expect(JSON.stringify(res.body)).not.toContain('pix-sem-subconta-d3b2a');
      expect(JSON.stringify(res.body)).not.toContain('subconta-cifrada-d3b2a');
    } finally {
      env.PAYMENT_GATEWAY = original;
    }
  });

  it('modo SaaS: conta da loja inválida = problema; válida com checklist = ok; sem checklist ou sem conta = pendente', async () => {
    await updatePlatformConfig({ settlementMode: 'direto' }, 'd3b2a-p23');
    const base = { apiKeyEncrypted: 'x', apiKeyLast4: '1234', environment: 'sandbox' };
    const invalida = await store('d-invalida');
    await prisma.storeAsaasAccount.create({ data: { ...base, storeId: invalida, status: 'invalid' } });
    const pronta = await store('d-pronta');
    await prisma.storeAsaasAccount.create({
      data: {
        ...base, storeId: pronta, status: 'valid', paymentWebhookId: 'wh-1',
        ipWhitelistConfirmedAt: new Date(), authWebhookConfirmedAt: new Date(),
      },
    });
    const metade = await store('d-metade');
    await prisma.storeAsaasAccount.create({ data: { ...base, storeId: metade, status: 'valid' } });
    const sem = await store('d-sem');

    const by = byId(await list({ q: `${tag} d-` }));
    expect(by.get(invalida)).toEqual(expect.objectContaining({ mode: 'saas', receiving: 'problem', attention: true }));
    expect(by.get(pronta)).toEqual(expect.objectContaining({ mode: 'saas', receiving: 'ok' }));
    expect(by.get(metade)).toEqual(expect.objectContaining({ mode: 'saas', receiving: 'pending' }));
    expect(by.get(sem)).toEqual(expect.objectContaining({ mode: 'saas', receiving: 'pending' }));
  });
});

describe('GET /admin/stores · ordem, cursor, filtros e busca', () => {
  it('atenção primeiro e depois o nome; o cursor não repete nem pula, com nome repetido', async () => {
    const a = await store('o-A ok');
    const b = await store('o-B pausada');
    await prisma.store.update({ where: { id: b }, data: { adminPausedAt: new Date(), adminPausedBy: ceo.userId, adminPauseReason: 'Teste' } });
    const c = await store('o-C cancela');
    await ordersFor(c, 5, { cancelled: 3 });
    const d = await store('o-D ok');
    const e1 = await store('o-E igual');
    const e2 = await store('o-E igual');
    const expected = [b, c, a, d, ...[e1, e2].sort()];

    expect(idsOf(await list({ q: `${tag} o-` }))).toEqual(expected);

    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 10; page++) {
      const res = await list(cursor ? { q: `${tag} o-`, limit: '1', cursor } : { q: `${tag} o-`, limit: '1' });
      expect(res.status).toBe(200);
      seen.push(...idsOf(res));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual(expected);
  });

  it('filtros admin_paused, attention e trial', async () => {
    const pausada = await store('f-pausada');
    await prisma.store.update({ where: { id: pausada }, data: { adminPausedAt: new Date(), adminPausedBy: ceo.userId, adminPauseReason: 'Teste' } });
    const cancela = await store('f-cancela');
    await ordersFor(cancela, 5, { cancelled: 2 });
    const teste = await store('f-teste');
    await prisma.storeSaasBilling.create({ data: { storeId: teste, status: 'trialing', trialEndsAt: new Date(Date.now() + 7 * DAY_MS) } });
    const ativa = await store('f-ativa');
    await prisma.storeSaasBilling.create({ data: { storeId: ativa, status: 'active', trialEndsAt: new Date(Date.now() - DAY_MS) } });

    const q = `${tag} f-`;
    expect(idsOf(await list({ q, filter: 'admin_paused' }))).toEqual([pausada]);
    expect(idsOf(await list({ q, filter: 'attention' }))).toEqual([cancela, pausada]);
    expect(idsOf(await list({ q, filter: 'trial' }))).toEqual([teste]);
    expect(idsOf(await list({ q }))).toHaveLength(4);

    const invalid = await list({ filter: 'vip' });
    expect(invalid.status).toBe(400);
    expect(invalid.body).toEqual({ error: 'Filtro inválido', code: 'INVALID_FILTER' });
  });

  it('busca: nome parcial sem diferenciar maiúsculas, ou CNPJ exato com ou sem máscara', async () => {
    const cnpj = `1${randomDigits(13)}`;
    const id = await store('Mercado Bom');
    await prisma.store.update({ where: { id }, data: { cnpj } });
    const masked = `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}`;
    expect(idsOf(await list({ q: `${tag.toUpperCase()} MERCADO` }))).toEqual([id]);
    expect(idsOf(await list({ q: masked }))).toEqual([id]);
    expect(idsOf(await list({ q: cnpj }))).toEqual([id]);
    expect(idsOf(await list({ q: masked.slice(0, 10) }))).not.toContain(id);
  });

  it('cursor inválido responde 400 INVALID_CURSOR', async () => {
    const res = await list({ cursor: 'nao-e-cursor' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_CURSOR');
  });
});

describe('GET /admin/stores · permissão', () => {
  it('papel delegado: 403 sem store:view_all e 200 com ela', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restore = await grantRolePermissions('gerente_geral', ['user:view_all']);
    try {
      expect((await list({}, gerente)).status).toBe(403);
      await grantRolePermissions('gerente_geral', ['store:view_all']);
      const ok = await list({ q: tag }, gerente);
      expect(ok.status).toBe(200);
      expect(ok.body).toEqual({ items: [], nextCursor: null });
    } finally {
      await restore();
    }
  });
});

describe('GET /admin/stores · não captura as rotas vizinhas', () => {
  // /stores/saas-billing e /stores/asaas são servidos pelos routers montados em /api/admin/stores
  // antes do router de /api/admin (app.ts); a lista nova só responde em /stores, exato.
  it('/stores/saas-billing e /stores/asaas seguem respondendo no formato deles', async () => {
    const id = await store('Vizinha');
    const billing = await request(app).get('/api/admin/stores/saas-billing').set('Authorization', bearer(ceo));
    expect(billing.status).toBe(200);
    expect(billing.body).toEqual(expect.objectContaining({ success: true, data: expect.any(Array) }));
    expect(billing.body).not.toHaveProperty('items');
    expect(billing.body.data.map((s: { storeId: string }) => s.storeId)).toContain(id);

    const asaas = await request(app).get('/api/admin/stores/asaas').set('Authorization', bearer(ceo));
    expect(asaas.status).toBe(200);
    expect(asaas.body).not.toHaveProperty('items');
    expect(asaas.body).not.toHaveProperty('nextCursor');
  });
});
