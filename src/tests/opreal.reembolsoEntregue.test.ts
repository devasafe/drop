// src/tests/opreal.reembolsoEntregue.test.ts
/**
 * Caso B (DS v2, 25/10): o cliente recebeu e quer devolver. Fase 1: pedir → loja aprova/recusa →
 * cliente leva na loja → loja digita o PIN → estorno pela chave da loja. Nenhum dinheiro sai antes
 * do PIN. Valor: defeito/errado = tudo; arrependimento até 7 dias = tudo; depois = sem a entrega.
 */
jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: {
      ...actual.default,
      get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(),
      getAs: jest.fn(), postAs: jest.fn(), putAs: jest.fn(), deleteAs: jest.fn(),
    },
  };
});
jest.mock('../utils/cloudinary', () => {
  const actual = jest.requireActual('../utils/cloudinary');
  return { __esModule: true, ...actual, uploadToCloudinary: jest.fn(async (_b: Buffer, folder: string) => `https://res.cloudinary.com/demo/${folder}/foto.png`) };
});
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import { emitToRoom } from '../utils/socketEmitter';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@reembolsoentregue.test';
const STORE_KEY = '$aact_hmlg_LOJA_REEM';
const postAs = asaasClient.postAs as jest.Mock;
const emit = emitToRoom as jest.Mock;
const DAY = 24 * 60 * 60 * 1000;
// PNG 1×1 válido.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');

let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); await prisma.$disconnect(); });
beforeEach(async () => {
  jest.clearAllMocks();
  postAs.mockReset();
  postAs.mockResolvedValue({ id: 'ref_reem', status: 'REFUNDED' });
  await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const ids = stores.map((s) => s.id);
  await prisma.returnRequest.deleteMany({ where: { storeId: { in: ids } } });
  await prisma.directRefund.deleteMany({ where: { storeId: { in: ids } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function entregue(opts: { daysAgo?: number; direct?: boolean } = {}) {
  const direct = opts.direct !== false;
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Eletro Center', isOpen: true } as any });
  if (direct) {
    await prisma.storeAsaasAccount.create({
      data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: 'REEM', environment: 'sandbox', status: 'valid' },
    });
  }
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, subtotal: 229.9, totalValue: 244, deliveryFee: 14.1, paymentMethod: 'pix',
      paymentStatus: 'paid', status: 'entregue', acceptedAt: new Date(),
      ...(direct ? { paymentProvider: 'asaas_loja', asaasChargeStatus: 'received', asaasPaymentId: `pay_reem_${Math.random().toString(36).slice(2, 8)}` } : {}),
    } as any,
  });
  const deliveredAt = new Date(Date.now() - (opts.daysAgo ?? 2) * DAY);
  const delivery = await prisma.delivery.create({
    data: { orderId: order.id, motoboyId: motoboy.userId, fee: 14.1, status: 'delivered', deliveredAt } as any,
  });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } as any });
  return { dono, cliente, store, order };
}

/** Os avisos (sino + push) saem em segundo plano: espera a linha aparecer. */
async function aviso(userId: string, entityId: string, title: string) {
  for (let i = 0; i < 40; i++) {
    const n = await prisma.notification.findFirst({ where: { userId, entityId, title } });
    if (n) return n;
    await new Promise((r) => setTimeout(r, 25));
  }
  return null;
}

const pedir = (orderId: string, who: any, body: any = { reason: 'defeito', note: 'O lado esquerdo não liga.' }) =>
  request(app).post(`/api/orders/${orderId}/return-request`).set('Authorization', bearer(who)).send(body);
const acao = (id: string, path: string, who: any, body: any = {}) =>
  request(app).post(`/api/return-requests/${id}/${path}`).set('Authorization', bearer(who)).send(body);

describe('pedir reembolso de pedido entregue', () => {
  it('prévia: até 7 dias, todos os motivos devolvem tudo', async () => {
    const { cliente, order } = await entregue({ daysAgo: 2 });
    const r = await request(app).get(`/api/orders/${order.id}/return-request/preview`).set('Authorization', bearer(cliente));
    expect(r.status).toBe(200);
    expect(r.body.amounts).toEqual({ defeito: 244, errado: 244, arrependimento: 244 });
  });

  it('prévia: depois de 7 dias, arrependimento devolve sem a entrega', async () => {
    const { cliente, order } = await entregue({ daysAgo: 8 });
    const r = await request(app).get(`/api/orders/${order.id}/return-request/preview`).set('Authorization', bearer(cliente));
    expect(r.body.amounts).toEqual({ defeito: 244, errado: 244, arrependimento: 229.9 });
  });

  it('cria aguardando a loja, avisa a loja e não move dinheiro', async () => {
    const { dono, cliente, store, order } = await entregue();
    const r = await pedir(order.id, cliente);
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'aguardando_loja', reason: 'defeito', amount: 244, includesDeliveryFee: true });
    expect(r.body.pin).toBeUndefined();

    expect(await aviso(dono.userId, order.id, 'Pedido de reembolso')).not.toBeNull();
    expect(emit.mock.calls.some((c) => c[0] === `store:${store.id}` && c[1] === 'order:updated')).toBe(true);
    expect(postAs).not.toHaveBeenCalled();
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('entregue');
  });

  it('aba Reembolsos: o cliente vê só os dele, com loja, código e situação', async () => {
    const { cliente, order } = await entregue();
    const outro = await entregue();
    await pedir(order.id, cliente);
    await pedir(outro.order.id, outro.cliente);
    const r = await request(app).get('/api/return-requests/mine').set('Authorization', bearer(cliente));
    expect(r.status).toBe(200);
    expect(r.body).toHaveLength(1);
    expect(r.body[0]).toMatchObject({
      orderId: order.id, orderCode: order.id.slice(-6).toUpperCase(), storeName: 'Eletro Center', status: 'aguardando_loja', amount: 244,
    });
    expect(JSON.stringify(r.body)).not.toMatch(/pin|note|photo/i);
    expect((await request(app).get('/api/return-requests/mine').set('Authorization', bearer(outro.dono))).status).toBe(403);
  });

  it('o pedido guarda como devolver; valor fora da lista é recusado', async () => {
    const { cliente, order } = await entregue();
    expect((await pedir(order.id, cliente, { reason: 'defeito', mode: 'helicoptero' })).status).toBe(400);
    const r = await pedir(order.id, cliente, { reason: 'defeito', mode: 'loja' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ status: 'aguardando_loja', mode: 'loja' });
  });

  it('arrependimento depois de 7 dias grava o valor sem a entrega', async () => {
    const { cliente, order } = await entregue({ daysAgo: 8 });
    const r = await pedir(order.id, cliente, { reason: 'arrependimento' });
    expect(r.status).toBe(201);
    expect(r.body).toMatchObject({ amount: 229.9, includesDeliveryFee: false });
  });

  it('com foto: guarda o link enviado ao Cloudinary', async () => {
    const { cliente, order } = await entregue();
    const r = await request(app).post(`/api/orders/${order.id}/return-request`).set('Authorization', bearer(cliente))
      .field('reason', 'defeito').attach('photo', PNG, 'foto.png');
    expect(r.status).toBe(201);
    expect(r.body.photoUrl).toMatch(/^https:\/\/res\.cloudinary\.com\/demo\/drop\/reembolsos\//);
  });

  it('recusas: pedido de outra pessoa, não entregue, custódia, repetido e motivo inválido', async () => {
    const a = await entregue();
    const outro = await createTestUser('cliente', DOMAIN);
    expect((await pedir(a.order.id, outro)).status).toBe(403);
    expect((await pedir(a.order.id, a.cliente, { reason: 'qualquer' })).status).toBe(400);
    expect((await pedir(a.order.id, a.cliente)).status).toBe(201);
    const dup = await pedir(a.order.id, a.cliente);
    expect(dup.status).toBe(409);
    expect(dup.body.code).toBe('RETURN_EXISTS');

    const b = await entregue();
    await prisma.order.update({ where: { id: b.order.id }, data: { status: 'enviado' } as any });
    const naoEntregue = await pedir(b.order.id, b.cliente);
    expect(naoEntregue.status).toBe(409);
    expect(naoEntregue.body.code).toBe('RETURN_NOT_AVAILABLE');

    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const c = await entregue({ direct: false });
    const custodia = await pedir(c.order.id, c.cliente);
    expect(custodia.status).toBe(409);
    expect(custodia.body.code).toBe('RETURN_NOT_AVAILABLE');
  });
});

describe('a loja responde', () => {
  it('aprovar: só a dona da loja, uma vez só, e o cliente é avisado', async () => {
    const { dono, cliente, order } = await entregue();
    const rr = (await pedir(order.id, cliente)).body;
    const outraLoja = await createTestUser('lojista', DOMAIN);
    expect((await acao(rr._id, 'approve', outraLoja)).status).toBe(403);
    expect((await acao(rr._id, 'approve', cliente)).status).toBe(403);

    const r = await acao(rr._id, 'approve', dono);
    expect(r.status).toBe(200);
    expect(r.body.status).toBe('aprovado');
    expect((await acao(rr._id, 'approve', dono)).status).toBe(409);

    expect(await aviso(cliente.userId, order.id, 'Reembolso aprovado')).not.toBeNull();
  });

  it('loja com a conta bloqueada não aprova, não recusa nem confirma', async () => {
    const { dono, cliente, order } = await entregue();
    const rr = (await pedir(order.id, cliente)).body;
    await prisma.user.update({ where: { id: dono.userId }, data: { status: 'blocked' } as any });
    expect((await acao(rr._id, 'approve', dono)).status).toBe(403);
    expect((await acao(rr._id, 'reject', dono, { reasonCode: 'usado' })).status).toBe(403);
    expect((await acao(rr._id, 'confirm', dono, { pin: '12345' })).status).toBe(403);
    expect((await prisma.returnRequest.findUnique({ where: { id: rr._id } }))!.status).toBe('aguardando_loja');
  });

  it('recusar: só com motivo da lista; o cliente recebe a frase fixa', async () => {
    const { dono, cliente, order } = await entregue();
    const rr = (await pedir(order.id, cliente)).body;
    expect((await acao(rr._id, 'reject', dono, { reasonCode: 'ligue para 9999' })).status).toBe(400);

    const r = await acao(rr._id, 'reject', dono, { reasonCode: 'usado' });
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'recusado', rejectReasonCode: 'usado', rejectReasonText: 'Produto com marca de uso' });
    expect((await aviso(cliente.userId, order.id, 'Reembolso recusado'))!.message).toContain('Produto com marca de uso');
  });
});

describe('devolução e estorno', () => {
  async function aprovado() {
    const s = await entregue();
    const rr = (await pedir(s.order.id, s.cliente)).body;
    await acao(rr._id, 'approve', s.dono);
    return { ...s, rr };
  }

  it('levar na loja: gera o código; o cliente vê o código e a loja não', async () => {
    const { dono, cliente, order, rr } = await aprovado();
    // Fase 2b: o motoboy existe, mas este pedido não tem coordenadas → 409 e nada muda.
    const semEndereco = await acao(rr._id, 'mode', cliente, { mode: 'motoboy' });
    expect(semEndereco.status).toBe(409);
    expect(semEndereco.body.code).toBe('ADDRESS_MISSING');
    const m = await acao(rr._id, 'mode', cliente, { mode: 'loja' });
    expect(m.status).toBe(200);
    expect(m.body.status).toBe('devolvendo');
    expect(m.body.pin).toMatch(/^\d{5}$/);

    const doCliente = await request(app).get(`/api/orders/${order.id}/return-request`).set('Authorization', bearer(cliente));
    expect(doCliente.body.pin).toBe(m.body.pin);
    const daLoja = await request(app).get(`/api/orders/${order.id}/return-request`).set('Authorization', bearer(dono));
    expect(daLoja.status).toBe(200);
    expect(daLoja.body.status).toBe('devolvendo');
    expect(daLoja.body.pin).toBeUndefined();
  });

  it('escolher como devolver antes da aprovação: 409', async () => {
    const { cliente, order } = await entregue();
    const rr = (await pedir(order.id, cliente)).body;
    expect((await acao(rr._id, 'mode', cliente, { mode: 'loja' })).status).toBe(409);
  });

  it('a loja digita o PIN certo: estorno integral pela chave da loja, uma vez só', async () => {
    const { dono, cliente, order, rr } = await aprovado();
    const pin = (await acao(rr._id, 'mode', cliente, { mode: 'loja' })).body.pin;
    expect(postAs).not.toHaveBeenCalled();

    expect((await acao(rr._id, 'confirm', dono, { pin: pin === '11111' ? '22222' : '11111' })).status).toBe(400);
    const ok = await acao(rr._id, 'confirm', dono, { pin });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('concluido');
    expect(postAs).toHaveBeenCalledTimes(1);
    expect(postAs.mock.calls[0][0]).toBe(STORE_KEY);
    expect(postAs.mock.calls[0][2].value).toBe(244);
    const asaasId = (await prisma.order.findUnique({ where: { id: order.id } }))!.asaasPaymentId;
    expect(postAs.mock.calls[0][1]).toBe(`/payments/${asaasId}/refund`);

    expect((await acao(rr._id, 'confirm', dono, { pin })).status).toBe(409);
    expect(postAs).toHaveBeenCalledTimes(1);
  });

  it('loja sem saldo para o estorno: o cliente só fica sabendo que está sendo processado, em até 7 dias', async () => {
    const { dono, cliente, order, rr } = await aprovado();
    const pin = (await acao(rr._id, 'mode', cliente, { mode: 'loja' })).body.pin;
    postAs.mockRejectedValue(new AsaasApiError(400, [{ code: 'invalid_action', description: 'Saldo insuficiente para estornar' }] as any));
    const ok = await acao(rr._id, 'confirm', dono, { pin });
    expect(ok.status).toBe(200);
    expect(ok.body.refundStatus).toBe('pending');
    const n = await aviso(cliente.userId, order.id, 'Produto devolvido');
    expect(n?.message).toBe('A loja recebeu o produto. O estorno de R$ 244,00 está sendo processado e volta pelo Pix que você usou em até 7 dias.');
  });

  it('5 PINs errados travam a confirmação', async () => {
    const { dono, cliente, rr } = await aprovado();
    const pin = (await acao(rr._id, 'mode', cliente, { mode: 'loja' })).body.pin;
    const wrong = pin === '11111' ? '22222' : '11111';
    for (let i = 0; i < 5; i++) await acao(rr._id, 'confirm', dono, { pin: wrong });
    const locked = await acao(rr._id, 'confirm', dono, { pin });
    expect(locked.status).toBe(429);
    expect(locked.body.code).toBe('PIN_LOCKED');
    expect(postAs).not.toHaveBeenCalled();
  });

  it('GET /orders/:id traz o resumo do reembolso para a loja e para o cliente (sem o código)', async () => {
    const { dono, cliente, order } = await entregue();
    await pedir(order.id, cliente);
    for (const who of [dono, cliente]) {
      const r = await request(app).get(`/api/orders/${order.id}`).set('Authorization', bearer(who));
      expect(r.status).toBe(200);
      expect(r.body.returnRequest).toEqual({ status: 'aguardando_loja', reason: 'defeito', amount: 244 });
    }
  });

  it('o painel da loja traz o pedido entregue com reembolso em aberto entre os em andamento', async () => {
    const { dono, cliente, order } = await entregue();
    await pedir(order.id, cliente);
    const r = await request(app).get('/api/stores/dashboard').set('Authorization', bearer(dono));
    const o = r.body.orders.find((x: any) => x._id === order.id);
    expect(o).toBeDefined();
    expect(o.returnRequest).toMatchObject({ status: 'aguardando_loja', reason: 'defeito' });
  });
});
