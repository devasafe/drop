/* eslint-env jest */
/** Antifraude · caminho gravado da corrida e alerta de "sinal perdido" para o admin. */
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn(), emitAdminOrderChanged: jest.fn() };
});
jest.mock('../services/pushService', () => {
  const actual = jest.requireActual('../services/pushService');
  return { __esModule: true, ...actual, notifyAdmins: jest.fn() };
});

import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { bearer, createTestUser } from './helpers/authUser';
import { criarCorrida, limparCorridas, minutesAgo } from './helpers/motoboyRide';
import { relayRideLocation } from '../services/notifier';
import { checkRideSignals, purgeOldTrackPoints } from '../jobs/rideSignal.job';
import { emitAdminNotification } from '../utils/socketEmitter';
import { notifyAdmins } from '../services/pushService';
import { attentionFor } from '../services/adminOps/attention';

const DOMAIN = '@antifraude-sinal.test';
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
const alert = emitAdminNotification as jest.Mock;
let restore: () => Promise<void>;
let since = new Date();
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY; });
beforeEach(async () => {
  since = new Date();
  alert.mockClear();
  (notifyAdmins as jest.Mock).mockClear();
  (env as any).PAYMENT_GATEWAY = 'none';
  await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
});
afterEach(async () => { await limparCorridas(DOMAIN, since); });

const pos = { latitude: -23.55, longitude: -46.63, accuracy: 9 };
const points = (deliveryId: string) => prisma.deliveryTrackPoint.findMany({ where: { deliveryId } });

describe('caminho da corrida', () => {
  it('cada posição do motoboy da corrida vira um ponto; GPS falso fica marcado', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    await relayRideLocation(c.motoboy.userId, c.deliveryId, pos);
    await prisma.deliveryTrackPoint.updateMany({ where: { deliveryId: c.deliveryId }, data: { createdAt: new Date(Date.now() - 10_000), bucket: { decrement: 5 } } });
    await relayRideLocation(c.motoboy.userId, c.deliveryId, { ...pos, simulated: true });
    const pts = await points(c.deliveryId);
    expect(pts).toHaveLength(2);
    expect(pts.filter((p) => p.simulated)).toHaveLength(1);
  });

  it('enxurrada de posições, mesmo simultâneas: no máximo um ponto a cada 3 s por corrida', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    for (let i = 0; i < 5; i++) await relayRideLocation(c.motoboy.userId, c.deliveryId, pos);
    await Promise.all(Array.from({ length: 10 }, () => relayRideLocation(c.motoboy.userId, c.deliveryId, pos)));
    expect((await points(c.deliveryId)).length).toBeLessThanOrEqual(2); // pode virar a janela no meio
  });

  it('caminho longo: o admin recebe uma amostra no banco, com a primeira e a última posição', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    const t0 = Date.now() - 6 * 3600_000;
    await prisma.deliveryTrackPoint.createMany({
      data: Array.from({ length: 7000 }, (_, i) => ({
        deliveryId: c.deliveryId, motoboyId: c.motoboy.userId, lat: i, lng: i, bucket: i, simulated: i === 6999, createdAt: new Date(t0 + i * 3000),
      })),
    });
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await request(app).get(`/api/admin/orders/${c.orderId}/track`).set('Authorization', bearer(ceo));
    const r = res.body.rides[0];
    expect(r.totalPoints).toBe(7000);
    expect(r.simulatedCount).toBe(1);
    expect(r.points.length).toBeLessThanOrEqual(5001);
    expect(r.points[0].lat).toBe(0);
    expect(r.points[r.points.length - 1].lat).toBe(6999);
  });

  it('outro motoboy ou corrida encerrada não grava', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    const intruso = await createTestUser('motoboy', DOMAIN);
    await relayRideLocation(intruso.userId, c.deliveryId, pos);
    await prisma.delivery.update({ where: { id: c.deliveryId }, data: { status: 'delivered' } });
    await relayRideLocation(c.motoboy.userId, c.deliveryId, pos);
    expect(await points(c.deliveryId)).toHaveLength(0);
  });

  it('o admin lê o caminho do pedido; cliente não', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    await relayRideLocation(c.motoboy.userId, c.deliveryId, { ...pos, simulated: true });
    await prisma.user.update({ where: { id: c.motoboy.userId }, data: { telefone: '11988887777' } });
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await request(app).get(`/api/admin/orders/${c.orderId}/track`).set('Authorization', bearer(ceo));
    expect(res.status).toBe(200);
    expect(res.body.rides[0]).toEqual(expect.objectContaining({ deliveryId: c.deliveryId, simulatedCount: 1, totalPoints: 1 }));
    expect(res.body.rides[0].motoboy).toEqual(expect.objectContaining({ phone: '11988887777' }));
    expect(res.body.rides[0].points[0]).toEqual(expect.objectContaining({ lat: -23.55, lng: -46.63, simulated: true }));
    const nao = await request(app).get(`/api/admin/orders/${c.orderId}/track`).set('Authorization', bearer(c.cliente));
    expect(nao.status).toBe(403);
  });

  it('pontos com mais de 180 dias são apagados', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    await prisma.deliveryTrackPoint.create({ data: { deliveryId: c.deliveryId, motoboyId: c.motoboy.userId, lat: 1, lng: 1, bucket: 1, createdAt: new Date(Date.now() - 181 * 86_400_000) } });
    await relayRideLocation(c.motoboy.userId, c.deliveryId, pos);
    await purgeOldTrackPoints();
    expect(await points(c.deliveryId)).toHaveLength(1);
  });
});

describe('sinal perdido', () => {
  it('corrida sem posição há mais de 3 min: um alerta enxuto (sem telefone, cliente nem posição); não repete', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' }); // aceita há 40 min
    await prisma.user.update({ where: { id: c.motoboy.userId }, data: { telefone: '11988887777' } });
    await prisma.deliveryTrackPoint.create({ data: { deliveryId: c.deliveryId, motoboyId: c.motoboy.userId, lat: -23.5, lng: -46.6, bucket: 1, createdAt: minutesAgo(6) } });

    expect(await checkRideSignals()).toEqual([c.deliveryId]);
    expect(alert).toHaveBeenCalledTimes(1);
    const body = alert.mock.calls[0][0].body as string;
    expect(alert.mock.calls[0][0].title).toBe('Sinal perdido numa entrega');
    expect(body).toMatch(/há 6 min, com o produto/);
    expect(body).not.toMatch(/11988887777|maps|-23\.5/);
    expect(alert.mock.calls[0][0].url).toBe(`/admin/pedidos/${c.orderId}`);
    expect((await prisma.delivery.findUnique({ where: { id: c.deliveryId } }))!.signalLostAt).not.toBeNull();

    expect(await checkRideSignals()).toEqual([]);
    expect(alert).toHaveBeenCalledTimes(1);
  });

  it('com posição recente, nada', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'assigned' });
    await relayRideLocation(c.motoboy.userId, c.deliveryId, pos);
    expect(await checkRideSignals()).toEqual([]);
  });

  it('a posição voltando limpa a marca e avisa o admin', async () => {
    const c = await criarCorrida(DOMAIN, { status: 'picked' });
    await checkRideSignals();
    await relayRideLocation(c.motoboy.userId, c.deliveryId, pos);
    expect((await prisma.delivery.findUnique({ where: { id: c.deliveryId } }))!.signalLostAt).toBeNull();
    expect((notifyAdmins as jest.Mock).mock.calls.at(-1)[0].body).not.toMatch(/Motoboy|motoboy/);
    expect(notifyAdmins).toHaveBeenCalledWith(expect.objectContaining({ title: 'Sinal do motoboy voltou' }));
  });

  it('na fila do admin, "Sinal perdido" vence os outros motivos da corrida', () => {
    const base: any = {
      status: 'enviado', paymentStatus: 'paid', createdAt: minutesAgo(90), paidAt: minutesAgo(90), acceptedAt: minutesAgo(80),
      cancelledAt: null, updatedAt: new Date(), awaitingCustomerPoolDecision: false, deliveryDuration: 600, refundPending: false,
    };
    const limits: any = { storeAcceptTimeoutMin: 10, poolTimeoutMin: 10 };
    const delivery = { status: 'picked', createdAt: minutesAgo(70), assignedAt: minutesAgo(60), pickedAt: minutesAgo(50) };
    expect(attentionFor({ ...base, delivery }, limits, new Date())).toBe('atrasado');
    expect(attentionFor({ ...base, delivery: { ...delivery, signalLostAt: new Date() } }, limits, new Date())).toBe('sinal_perdido');
  });
});
