// src/tests/opreal.corridaDevolucao.test.ts
/**
 * Caso B, fase 2b: "Chamar um motoboy" na devolução de pedido entregue (defeito ou produto errado:
 * a loja paga). Uma corrida ao contrário (Delivery kind 'devolucao'): busca na casa do cliente
 * com o código que o cliente mostra e leva à loja; a loja digita o código de devolução, a corrida
 * fecha, o repasse ao motoboy nasce (pago pela loja) e o estorno sai.
 * Na devolução, store* guarda o ponto de RETIRADA (casa do cliente) e customer* o DESTINO (loja):
 * despacho, oferta e navegação continuam lendo "retirada = store*" sem desvio.
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
jest.mock('../services/routeService', () => {
  const actual = jest.requireActual('../services/routeService');
  return { __esModule: true, ...actual, getRoute: jest.fn(async () => ({ distanceKm: 4, durationSec: 900, polyline: 'abc', source: 'test' })) };
});
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn(), emitDeliveryCreated: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import asaasClient from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import { emitDeliveryCreated } from '../utils/socketEmitter';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { runPoolTimeout } from '../jobs/poolTimeout.job';
import { runDeliveryTimeout } from '../jobs/deliveryTimeout.job';

const DOMAIN = '@corridadevolucao.test';
const STORE_KEY = '$aact_hmlg_LOJA_CDEV';
const postAs = asaasClient.postAs as jest.Mock;
const created = emitDeliveryCreated as jest.Mock;
let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); await prisma.$disconnect(); });
beforeEach(async () => {
  jest.clearAllMocks();
  postAs.mockReset();
  postAs.mockResolvedValue({ id: 'ref_cdev', status: 'REFUNDED' });
  await updatePlatformConfig({ settlementMode: 'direto', motoboyCutPerDelivery: 5, motoboyCutPerKm: 1, motoboyShareDirect: 100 } as any, 'test');
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const ids = stores.map((s) => s.id);
  await prisma.motoboyTransfer.deleteMany({ where: { storeId: { in: ids } } });
  await prisma.returnRequest.deleteMany({ where: { storeId: { in: ids } } });
  await prisma.directRefund.deleteMany({ where: { storeId: { in: ids } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function aprovado(reason: 'defeito' | 'errado' | 'arrependimento' = 'defeito') {
  const dono = await createTestUser('lojista', DOMAIN);
  const cliente = await createTestUser('cliente', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  await prisma.user.update({ where: { id: motoboy.userId }, data: { asaas: { status: 'none', pixKey: '12345678909', pixKeyType: 'CPF' } } as any });
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Eletro Center', isOpen: true, address: 'R. dos Pinheiros, 870', latitude: '-23.56', longitude: '-46.69' } as any });
  await prisma.storeAsaasAccount.create({
    data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: 'CDEV', environment: 'sandbox', status: 'valid' },
  });
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id, subtotal: 229.9, totalValue: 244, deliveryFee: 14.1, paymentMethod: 'pix', paymentStatus: 'paid',
      status: 'entregue', paymentProvider: 'asaas_loja', asaasChargeStatus: 'received', asaasPaymentId: `pay_cdev_${Math.random().toString(36).slice(2, 8)}`,
      storeAddress: 'R. dos Pinheiros, 870', storeLatitude: -23.56, storeLongitude: -46.69,
      customerAddress: 'R. Aurora, 112', customerLatitude: -23.54, customerLongitude: -46.64,
    } as any,
  });
  const forward = await prisma.delivery.create({
    data: { orderId: order.id, motoboyId: motoboy.userId, fee: 14.1, status: 'delivered', deliveredAt: new Date() } as any,
  });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: forward.id } as any });
  const rr = await prisma.returnRequest.create({
    data: { orderId: order.id, customerId: cliente.userId, storeId: store.id, reason, amount: 244, includesDeliveryFee: true, status: 'aprovado' },
  });
  return { dono, cliente, motoboy, store, order, forward, rr };
}

const motoboyMode = (rrId: string, who: any) =>
  request(app).post(`/api/return-requests/${rrId}/mode`).set('Authorization', bearer(who)).send({ mode: 'motoboy' });
const rideOf = (rrId: string) => prisma.delivery.findFirst({ where: { returnRequestId: rrId } as any });
const getRR = (orderId: string, who: any) => request(app).get(`/api/orders/${orderId}/return-request`).set('Authorization', bearer(who));

describe('chamar um motoboy', () => {
  it('defeito: cria a corrida de devolução no pool (retirada na casa do cliente, destino na loja)', async () => {
    const { cliente, order, forward, rr } = await aprovado();
    const r = await motoboyMode(rr.id, cliente);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({ status: 'devolvendo', mode: 'motoboy' });

    const ride: any = await rideOf(rr.id);
    expect(ride).toMatchObject({ kind: 'devolucao', status: 'pending', motoboyId: null, orderId: order.id });
    expect(ride.storeAddress).toBe('R. Aurora, 112');
    expect(ride.storeLatitude).toBeCloseTo(-23.54);
    expect(ride.customerAddress).toBe('R. dos Pinheiros, 870');
    expect(ride.customerLatitude).toBeCloseTo(-23.56);
    expect(ride.distance).toBe(4);
    expect(Number(ride.fee)).toBe(9);
    expect(created).toHaveBeenCalledTimes(1);
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.deliveryId).toBe(forward.id);
  });

  it('arrependimento: ainda não (o Pix da taxa vem na próxima etapa)', async () => {
    const { cliente, rr } = await aprovado('arrependimento');
    const r = await motoboyMode(rr.id, cliente);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('MODE_NOT_AVAILABLE');
    expect(await rideOf(rr.id)).toBeNull();
  });

  it('o cliente vê a situação da corrida; o código de retirada aparece quando um motoboy aceita', async () => {
    const { dono, cliente, motoboy, order, rr } = await aprovado();
    await motoboyMode(rr.id, cliente);
    const ride: any = await rideOf(rr.id);

    let c = await getRR(order.id, cliente);
    expect(c.body.ride).toMatchObject({ status: 'pending' });
    expect(c.body.pin).toBeUndefined();

    const claim = await request(app).post(`/api/deliveries/${ride.id}/claim`).set('Authorization', bearer(motoboy));
    expect(claim.status).toBe(200);
    expect(claim.body.pinRetirada).toBeUndefined();

    c = await getRR(order.id, cliente);
    expect(c.body.ride).toMatchObject({ status: 'assigned', motoboyName: 'User motoboy' });
    expect(c.body.ride.pickupPin).toMatch(/^\d{5}$/);
    expect(c.body.pin).toBeUndefined();

    const s = await getRR(order.id, dono);
    expect(s.body.ride).toMatchObject({ status: 'assigned' });
    expect(s.body.ride.pickupPin).toBeUndefined();
  });

  it('PINs de entrega normal não valem na devolução', async () => {
    const { dono, cliente, motoboy, rr } = await aprovado();
    await motoboyMode(rr.id, cliente);
    const ride: any = await rideOf(rr.id);
    await request(app).post(`/api/deliveries/${ride.id}/claim`).set('Authorization', bearer(motoboy));
    const fresh: any = await rideOf(rr.id);

    const loja = await request(app).post(`/api/deliveries/${ride.id}/validar-pin-retirada`).set('Authorization', bearer(dono)).send({ pinRetirada: fresh.pinRetirada });
    expect(loja.status).toBe(400);
    expect(loja.body.code).toBe('RETURN_RIDE');
    await prisma.delivery.update({ where: { id: ride.id }, data: { status: 'picked' } as any });
    const fim = await request(app).post(`/api/deliveries/${ride.id}/finalizar`).set('Authorization', bearer(motoboy)).send({ pin: fresh.pin });
    expect(fim.status).toBe(400);
    expect(fim.body.code).toBe('RETURN_RIDE');
  });

  it('retirada com o código do cliente; o motoboy passa a ver o código de devolução para a loja', async () => {
    const { cliente, motoboy, rr } = await aprovado();
    await motoboyMode(rr.id, cliente);
    const ride: any = await rideOf(rr.id);
    await request(app).post(`/api/deliveries/${ride.id}/claim`).set('Authorization', bearer(motoboy));
    const pickupPin = ((await rideOf(rr.id)) as any).pinRetirada;

    const antes = await request(app).get(`/api/deliveries/${ride.id}`).set('Authorization', bearer(motoboy));
    expect(antes.body.kind).toBe('devolucao');
    expect(antes.body.returnPin).toBeUndefined();
    expect(antes.body.pinRetirada).toBeUndefined();

    const errado = await request(app).post(`/api/deliveries/${ride.id}/retirar-devolucao`).set('Authorization', bearer(motoboy)).send({ pin: pickupPin === '11111' ? '22222' : '11111' });
    expect(errado.status).toBe(400);
    const ok = await request(app).post(`/api/deliveries/${ride.id}/retirar-devolucao`).set('Authorization', bearer(motoboy)).send({ pin: pickupPin });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('picked');

    const depois = await request(app).get(`/api/deliveries/${ride.id}`).set('Authorization', bearer(motoboy));
    const rrPin = (await prisma.returnRequest.findUnique({ where: { id: rr.id } }))!.pin;
    expect(depois.body.returnPin).toBe(rrPin);
  });

  it('a loja só confirma depois da retirada; ao confirmar: corrida entregue, repasse da loja e estorno', async () => {
    const { dono, cliente, motoboy, store, order, rr } = await aprovado();
    await motoboyMode(rr.id, cliente);
    const ride: any = await rideOf(rr.id);
    await request(app).post(`/api/deliveries/${ride.id}/claim`).set('Authorization', bearer(motoboy));
    const rrPin = (await prisma.returnRequest.findUnique({ where: { id: rr.id } }))!.pin!;
    const confirmar = () => request(app).post(`/api/return-requests/${rr.id}/confirm`).set('Authorization', bearer(dono)).send({ pin: rrPin });

    const cedo = await confirmar();
    expect(cedo.status).toBe(409);
    expect(cedo.body.code).toBe('RETURN_NOT_PICKED');

    const pickupPin = ((await rideOf(rr.id)) as any).pinRetirada;
    await request(app).post(`/api/deliveries/${ride.id}/retirar-devolucao`).set('Authorization', bearer(motoboy)).send({ pin: pickupPin });
    const ok = await confirmar();
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('concluido');

    const done: any = await rideOf(rr.id);
    expect(done.status).toBe('delivered');
    expect(done.deliveredAt).toBeInstanceOf(Date);
    const t = await prisma.motoboyTransfer.findUnique({ where: { deliveryId: ride.id } });
    expect(t).toMatchObject({ reason: 'return_delivery', payer: 'store', storeId: store.id, motoboyId: motoboy.userId });
    expect(Number(t!.amount)).toBe(9);
    expect(postAs).toHaveBeenCalledWith(STORE_KEY, `/payments/${(await prisma.order.findUnique({ where: { id: order.id } }))!.asaasPaymentId}/refund`, expect.objectContaining({ value: 244 }));

    // O ganho da corrida de volta entra no resumo do motoboy.
    const sum = await request(app).get('/api/deliveries/summary').set('Authorization', bearer(motoboy));
    expect(sum.status).toBe(200);
    expect(sum.body.today.earnings).toBe(9);
  });
});

describe('o motoboy desiste', () => {
  it('antes de retirar: a corrida volta ao pool', async () => {
    const { cliente, motoboy, rr } = await aprovado();
    await motoboyMode(rr.id, cliente);
    const ride: any = await rideOf(rr.id);
    await request(app).post(`/api/deliveries/${ride.id}/claim`).set('Authorization', bearer(motoboy));
    const r = await request(app).post(`/api/deliveries/${ride.id}/reject`).set('Authorization', bearer(motoboy)).send({ reason: 'pneu furado' });
    expect(r.status).toBe(200);
    const back: any = await rideOf(rr.id);
    expect(back).toMatchObject({ status: 'pending', motoboyId: null, pinRetirada: null });
  });

  it('com o produto na mão: não pode desistir, tem que levar à loja', async () => {
    const { cliente, motoboy, rr } = await aprovado();
    await motoboyMode(rr.id, cliente);
    const ride: any = await rideOf(rr.id);
    await request(app).post(`/api/deliveries/${ride.id}/claim`).set('Authorization', bearer(motoboy));
    const pickupPin = ((await rideOf(rr.id)) as any).pinRetirada;
    await request(app).post(`/api/deliveries/${ride.id}/retirar-devolucao`).set('Authorization', bearer(motoboy)).send({ pin: pickupPin });
    const r = await request(app).post(`/api/deliveries/${ride.id}/reject`).set('Authorization', bearer(motoboy)).send({ reason: 'x' });
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('RETURN_RIDE_PICKED');
    const still: any = await rideOf(rr.id);
    expect(still).toMatchObject({ status: 'picked', motoboyId: motoboy.userId, pinDevolucao: null });
  });

  it('"cliente ausente" não vale na devolução', async () => {
    const { cliente, motoboy, rr } = await aprovado();
    await motoboyMode(rr.id, cliente);
    const ride: any = await rideOf(rr.id);
    await request(app).post(`/api/deliveries/${ride.id}/claim`).set('Authorization', bearer(motoboy));
    const r = await request(app).post(`/api/deliveries/${ride.id}/cliente-ausente`).set('Authorization', bearer(motoboy)).send({});
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('RETURN_RIDE');
  });
});

describe('jobs', () => {
  it('o timeout do pool não oferece cancelar um pedido entregue por causa da corrida de volta', async () => {
    const { cliente, order, rr } = await aprovado();
    await motoboyMode(rr.id, cliente);
    const ride: any = await rideOf(rr.id);
    await prisma.delivery.update({ where: { id: ride.id }, data: { createdAt: new Date(Date.now() - 60 * 60 * 1000) } as any });
    await runPoolTimeout();
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.awaitingCustomerPoolDecision).toBe(false);
  });

  it('corrida de volta aceita e parada volta ao pool; o pedido continua entregue', async () => {
    const { cliente, motoboy, order, rr } = await aprovado();
    await motoboyMode(rr.id, cliente);
    const ride: any = await rideOf(rr.id);
    await request(app).post(`/api/deliveries/${ride.id}/claim`).set('Authorization', bearer(motoboy));
    await prisma.$executeRaw`UPDATE "Delivery" SET "updatedAt" = now() - interval '2 hours' WHERE id = ${ride.id}`;
    await runDeliveryTimeout();
    const back: any = await rideOf(rr.id);
    expect(back.status).toBe('pending');
    expect(back.motoboyId).toBeNull();
    expect((await prisma.order.findUnique({ where: { id: order.id } }))!.status).toBe('entregue');
  });
});
