/**
 * D3b-1 · P1.6 — GET /admin/ops/map (Mapa ao vivo, spec 3.4): só motoboy online com localização,
 * "sem sinal" acima de 2 min, raio pela idade da entrega, card de despacho e nada de PIN, CPF ou e-mail.
 */
import request from 'supertest';
import { Prisma } from '@prisma/client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { createOpsStore, createOpsOrder, cleanupOpsFixtures, grantRolePermissions, OpsOrderInput } from './helpers/d3b1Ops';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { getOpsMap } from '../services/adminOps/map';
import { DISPATCH_BASE_KM, DISPATCH_MAX_KM, DISPATCH_STEP_KM, DISPATCH_STEP_MS } from '../services/dispatch';

const DOMAIN = '@d3b1p16.test';
const MARK = 'd3b1p16';
const PIN_ENTREGA = '73914';
const CPF = '39053344705';

let restoreConfig: () => Promise<void>;
let ceo: TestUser;
let cliente: TestUser;
let storeId: string;

beforeAll(async () => {
  restoreConfig = await snapshotPlatformConfig();
});
afterAll(async () => {
  await restoreConfig();
});
beforeEach(async () => {
  await updatePlatformConfig({ poolTimeoutMin: 15 }, 'test');
  ceo = await createTestUser('ceo', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
  await prisma.user.update({ where: { id: cliente.userId }, data: { cpf: CPF } });
  storeId = await createOpsStore(DOMAIN, { name: 'Loja Mapa', latitude: '-23.5', longitude: '-46.6' });
});
afterEach(async () => {
  await cleanupOpsFixtures(DOMAIN, MARK);
});

const secondsBefore = (now: Date, s: number) => new Date(now.getTime() - s * 1000);
const order = (data: Partial<OpsOrderInput>) => createOpsOrder({ customerId: cliente.userId, storeId, ...data });

/** Motoboy com estado de presença e localização gravados como o app grava ({ lat, lng, updatedAt }). */
async function motoboyAt(online: boolean, locationAt: Date | null): Promise<TestUser> {
  const m = await createTestUser('motoboy', DOMAIN);
  await prisma.user.update({
    where: { id: m.userId },
    data: {
      isOnline: online,
      currentLocation: locationAt ? { lat: -23.55, lng: -46.63, updatedAt: locationAt.toISOString() } : Prisma.DbNull,
    },
  });
  return m;
}

const get = (u?: TestUser) => {
  const r = request(app).get('/api/admin/ops/map');
  return u ? r.set('Authorization', bearer(u)) : r;
};

describe('getOpsMap', () => {
  it('motoboys: só online com localização; estado livre, em entrega ou sem sinal (> 2 min)', async () => {
    const now = new Date();
    const livre = await motoboyAt(true, secondsBefore(now, 30));
    const quase = await motoboyAt(true, secondsBefore(now, 110));
    const semSinal = await motoboyAt(true, secondsBefore(now, 180));
    const ocupado = await motoboyAt(true, secondsBefore(now, 10));
    const emRota = await motoboyAt(true, secondsBefore(now, 10));
    const ocupadoSemSinal = await motoboyAt(true, secondsBefore(now, 300));
    const offline = await motoboyAt(false, secondsBefore(now, 10));
    const semLocalizacao = await motoboyAt(true, null);
    const pedidoOcupado = await order({ status: 'aguardando_motoboy', acceptedAt: now, delivery: { status: 'assigned', motoboyId: ocupado.userId, assignedAt: now, pin: PIN_ENTREGA } });
    const pedidoEmRota = await order({ status: 'aguardando_motoboy', acceptedAt: now, delivery: { status: 'picked', motoboyId: emRota.userId, assignedAt: now, pickedAt: now } });
    const pedidoSemSinal = await order({ status: 'aguardando_motoboy', acceptedAt: now, delivery: { status: 'assigned', motoboyId: ocupadoSemSinal.userId, assignedAt: now } });

    const map = await getOpsMap(now);
    const mine = new Map(map.motoboys.map((m) => [m.id, m]));
    expect(mine.get(livre.userId)?.state).toBe('free');
    expect(mine.get(quase.userId)?.state).toBe('free');
    expect(mine.get(semSinal.userId)?.state).toBe('stale');
    expect(mine.get(ocupado.userId)?.state).toBe('delivering');
    expect(mine.get(emRota.userId)?.state).toBe('delivering');
    expect(mine.get(ocupadoSemSinal.userId)?.state).toBe('stale');
    expect(mine.has(offline.userId)).toBe(false);
    expect(mine.has(semLocalizacao.userId)).toBe(false);
    expect(mine.get(livre.userId)).toEqual({
      id: livre.userId, name: 'User motoboy', lat: -23.55, lng: -46.63,
      updatedAt: secondsBefore(now, 30).toISOString(), state: 'free', orderId: null, shortId: null, imprecise: false,
    });
    // em entrega (ou em entrega sem sinal): o pedido certo de cada um
    expect(mine.get(ocupado.userId)).toMatchObject({ orderId: pedidoOcupado.orderId, shortId: pedidoOcupado.orderId.slice(-6) });
    expect(mine.get(emRota.userId)).toMatchObject({ orderId: pedidoEmRota.orderId, shortId: pedidoEmRota.orderId.slice(-6) });
    expect(mine.get(ocupadoSemSinal.userId)).toMatchObject({ orderId: pedidoSemSinal.orderId, shortId: pedidoSemSinal.orderId.slice(-6) });
    expect(mine.get(semSinal.userId)).toMatchObject({ orderId: null, shortId: null });
  });

  it('aguardando: raio pela idade, aberto a todos depois do teto, cliente decidindo e coordenadas da loja', async () => {
    const now = new Date();
    const fresca = await order({
      status: 'aguardando_motoboy', acceptedAt: now,
      delivery: { status: 'pending', createdAt: secondsBefore(now, 1), storeLatitude: -22.9, storeLongitude: -43.2 },
    });
    const velha = await order({
      status: 'aguardando_motoboy', acceptedAt: now, awaitingCustomerPoolDecision: true,
      delivery: { status: 'pending', createdAt: secondsBefore(now, 3600) },
    });
    const encerrada = await order({ status: 'cancelado', delivery: { status: 'pending', createdAt: secondsBefore(now, 5) } });

    const map = await getOpsMap(now);
    const byOrder = new Map(map.waiting.map((w) => [w.orderId, w]));
    expect(byOrder.get(fresca.orderId)).toEqual({
      orderId: fresca.orderId, shortId: fresca.orderId.slice(-6), storeName: 'Loja Mapa',
      storeLat: -22.9, storeLng: -43.2, since: secondsBefore(now, 1).toISOString(),
      radiusKm: DISPATCH_BASE_KM, customerDeciding: false,
    });
    expect(byOrder.get(velha.orderId)).toMatchObject({ radiusKm: null, customerDeciding: true, storeLat: -23.5, storeLng: -46.6 });
    expect(byOrder.has(encerrada.orderId)).toBe(false);
  });

  it('em entrega: etapa pela entrega e nome do motoboy; despacho das envs e do pool', async () => {
    const now = new Date();
    const m1 = await motoboyAt(true, now);
    const m2 = await motoboyAt(true, now);
    const indo = await order({ status: 'aguardando_motoboy', acceptedAt: now, delivery: { status: 'assigned', motoboyId: m1.userId, assignedAt: now } });
    const levando = await order({ status: 'aguardando_motoboy', acceptedAt: now, delivery: { status: 'picked', motoboyId: m2.userId, assignedAt: now, pickedAt: now } });

    const map = await getOpsMap(now);
    const byOrder = new Map(map.inDelivery.map((d) => [d.orderId, d]));
    expect(byOrder.get(indo.orderId)).toEqual({ orderId: indo.orderId, shortId: indo.orderId.slice(-6), motoboyName: 'User motoboy', stage: 'indo_para_loja' });
    expect(byOrder.get(levando.orderId)?.stage).toBe('levando');
    expect(map.dispatch).toEqual({
      initialKm: DISPATCH_BASE_KM, stepKm: DISPATCH_STEP_KM, stepSeconds: DISPATCH_STEP_MS / 1000,
      maxKm: DISPATCH_MAX_KM, poolTimeoutMin: 15,
    });
  });
});

describe('GET /api/admin/ops/map', () => {
  it('formato combinado e nada de PIN, CPF, e-mail ou endereço do cliente', async () => {
    const now = new Date();
    const m = await motoboyAt(true, now);
    await order({ status: 'aguardando_motoboy', acceptedAt: now, delivery: { status: 'assigned', motoboyId: m.userId, assignedAt: now, pin: PIN_ENTREGA } });
    await order({ status: 'aguardando_motoboy', acceptedAt: now, delivery: { status: 'pending' } });

    const r = await get(ceo);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['dispatch', 'inDelivery', 'motoboys', 'storesWithoutCourier', 'waiting']);
    const mine = r.body.motoboys.find((x: any) => x.id === m.userId);
    expect(Object.keys(mine).sort()).toEqual(['id', 'imprecise', 'lat', 'lng', 'name', 'orderId', 'shortId', 'state', 'updatedAt']);
    const emails = (await prisma.user.findMany({ where: { id: { in: [m.userId, cliente.userId] } }, select: { email: true } })).map((u) => u.email);
    const text = JSON.stringify(r.body);
    expect(text).not.toContain(PIN_ENTREGA);
    expect(text).not.toContain(CPF);
    for (const email of emails) expect(text).not.toContain(email);
    expect(text).not.toMatch(/"pin|"cpf"|"email"|"customerId"|"customerAddress"|"customerLatitude"|"customerLongitude"/);
  });

  it('sem login → 401; sem operation:view → 403; com operation:view concedida a um gerente → 200', async () => {
    expect((await get()).status).toBe(401);
    const semPermissao = await createTestUser('gerente_geral', DOMAIN);
    expect((await get(semPermissao)).status).toBe(403);
    const marketing = await createTestUser('marketing', DOMAIN);
    const restore = await grantRolePermissions('marketing', ['operation:view']);
    try {
      expect((await get(marketing)).status).toBe(200);
    } finally {
      await restore();
    }
  });
});
