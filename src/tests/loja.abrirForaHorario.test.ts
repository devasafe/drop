/**
 * Abrir a loja fora do horário vale de verdade até a próxima virada (`Store.openOverrideUntil`).
 * Regra de "aberta agora": pausada → fechada; isOpen=false → fechada; override no futuro → aberta;
 * senão, o horário. O PUT operating-hours com isOpen=true calcula o override no servidor.
 *
 * Relógio: só o `Date` é falso (timers, nextTick etc. ficam reais para o Prisma e o supertest).
 * Quarta-feira 21/10/2026; a loja abre 10:00–18:00 todos os dias (horário de São Paulo, -03:00).
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

jest.mock('../services/asaas/payment', () => ({
  __esModule: true,
  ensureAsaasCustomer: jest.fn(async () => 'cus_test'),
  createPixCharge: jest.fn(async () => ({ paymentId: 'pay_abrir_1', status: 'PENDING', qrCodePayload: 'pix', qrCodeImage: 'img' })),
  createCardCharge: jest.fn(),
}));

jest.mock('../services/routeService', () => {
  const actual = jest.requireActual('../services/routeService');
  return { __esModule: true, ...actual, getRoute: jest.fn() };
});

import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TEST_JWT_SECRET } from './helpers/authUser';
import { createWallet } from './helpers/financePg';
import { brazilNow, isOpenAt, isStoreCurrentlyOpen } from '../utils/storeHours';

const DOMAIN = '@abrirfora.test';
// Macapá (AP): coordenada exclusiva desta suíte.
const LAT = 0.0349;
const LNG = -51.0694;

const DAY = { open: '10:00', close: '18:00', closed: false };
const HOURS = {
  sunday: DAY, monday: DAY, tuesday: DAY, wednesday: DAY, thursday: DAY, friday: DAY, saturday: DAY,
};
/** Quarta 21/10/2026 às `hhmm` em São Paulo. */
const sp = (hhmm: string) => new Date(`2026-10-21T${hhmm}:00-03:00`);

const FAKE_ONLY_DATE = {
  doNotFake: [
    'hrtime', 'nextTick', 'performance', 'queueMicrotask', 'requestAnimationFrame', 'cancelAnimationFrame',
    'requestIdleCallback', 'cancelIdleCallback', 'setImmediate', 'clearImmediate', 'setInterval',
    'clearInterval', 'setTimeout', 'clearTimeout',
  ] as any,
};
const at = (d: Date) => jest.useFakeTimers({ now: d, ...FAKE_ONLY_DATE });

let restore: () => Promise<void>;
let gatewayOriginal: any;
beforeAll(async () => {
  gatewayOriginal = env.PAYMENT_GATEWAY;
  restore = await snapshotPlatformConfig();
});
afterAll(async () => {
  env.PAYMENT_GATEWAY = gatewayOriginal;
  await restore();
});
beforeEach(async () => {
  env.PAYMENT_GATEWAY = 'asaas';
  await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
});
afterEach(async () => {
  jest.useRealTimers();
  env.PAYMENT_GATEWAY = gatewayOriginal;
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function comprador() {
  const user = await prisma.user.create({
    data: {
      name: 'Comprador abrir', email: `buyer-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`,
      passwordHash: await bcrypt.hash('Senha123!', 4), role: 'cliente', roles: ['cliente'], activeRole: 'cliente', cpf: '39053344705',
      verification: { email: { status: 'verified' }, phone: { status: 'verified' }, document: { status: 'approved', type: 'cpf', number: '39053344705' } },
    },
  });
  await createWallet({ owner: user.id, ownerType: 'user', balance: 0, totalIncome: 0, totalSpent: 0 });
  return `Bearer ${jwt.sign({ id: user.id, role: 'cliente', activeRole: 'cliente', roles: ['cliente'] }, TEST_JWT_SECRET)}`;
}

async function cenario(extra: Record<string, unknown> = {}) {
  const tag = Math.random().toString(36).slice(2, 8);
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({
    data: {
      ownerId: dono.userId, name: `Açaí Fora Hora ${tag}`, isOpen: true, isVerified: true, plan: 3,
      latitude: String(LAT), longitude: String(LNG), operatingHours: HOURS, ...extra,
    } as any,
  });
  const prod = await prisma.product.create({ data: { storeId: store.id, name: `Cuia ${tag}`, price: 20, quantity: 10 } });
  return { dono, store, prod };
}

const abrir = (c: { dono: any; store: any }, body: Record<string, unknown>) =>
  request(app).put(`/api/stores/${c.store.id}/operating-hours`).set('Authorization', bearer(c.dono)).send(body);
const pedir = async (storeId: string, productId: string) =>
  request(app).post('/api/orders').set('Authorization', await comprador()).send({
    storeId, products: [{ productId, quantity: 1 }], paymentMethod: 'pix', deliveryDistanceKm: 0, address: 'Rua das Flores, 100 - Centro',
  });
const overrideOf = async (id: string) =>
  (await prisma.store.findUnique({ where: { id } }) as any)?.openOverrideUntil as Date | null;

describe('PUT operating-hours { isOpen: true } fora do horário', () => {
  it('antes de abrir hoje: override até a abertura de hoje, e o pedido é aceito', async () => {
    at(sp('07:00'));
    const c = await cenario({ isOpen: false });
    const res = await abrir(c, { isOpen: true });
    expect(res.status).toBe(200);
    expect(res.body.store.isOpen).toBe(true);
    expect(new Date(res.body.store.openOverrideUntil).toISOString()).toBe(sp('10:00').toISOString());
    expect((await overrideOf(c.store.id))?.toISOString()).toBe(sp('10:00').toISOString());

    const pedido = await pedir(c.store.id, c.prod.id);
    expect(String(pedido.body.error ?? '')).not.toMatch(/Loja fechada/);
    expect(pedido.status).toBe(201);
  });

  it('depois de fechar hoje: override até 23:59:59 de hoje (SP)', async () => {
    at(sp('20:00'));
    const c = await cenario();
    expect((await abrir(c, { isOpen: true })).status).toBe(200);
    expect((await overrideOf(c.store.id))?.toISOString()).toBe(new Date('2026-10-21T23:59:59-03:00').toISOString());
  });

  it('dia marcado como fechado: override até 23:59:59 de hoje (SP)', async () => {
    at(sp('11:00'));
    const c = await cenario({ operatingHours: { ...HOURS, wednesday: { open: '10:00', close: '18:00', closed: true } } });
    expect((await abrir(c, { isOpen: true })).status).toBe(200);
    expect((await overrideOf(c.store.id))?.toISOString()).toBe(new Date('2026-10-21T23:59:59-03:00').toISOString());
  });

  it('dentro do horário: não grava override', async () => {
    at(sp('12:00'));
    const c = await cenario({ isOpen: false });
    const res = await abrir(c, { isOpen: true });
    expect(res.status).toBe(200);
    expect(res.body.store.openOverrideUntil).toBeNull();
    expect(await overrideOf(c.store.id)).toBeNull();
  });

  it('fechar (isOpen: false) limpa o override', async () => {
    at(sp('20:00'));
    const c = await cenario({ openOverrideUntil: new Date('2026-10-21T23:59:59-03:00') });
    const res = await abrir(c, { isOpen: false });
    expect(res.status).toBe(200);
    expect(res.body.store.openOverrideUntil).toBeNull();
    expect(await overrideOf(c.store.id)).toBeNull();
  });

  it('só operatingHours (sem isOpen): não mexe no override', async () => {
    at(sp('20:00'));
    const until = new Date('2026-10-21T23:59:59-03:00');
    const c = await cenario({ openOverrideUntil: until });
    expect((await abrir(c, { operatingHours: HOURS })).status).toBe(200);
    expect((await overrideOf(c.store.id))?.toISOString()).toBe(until.toISOString());
  });
});

describe('regra de "aberta agora" com override', () => {
  const base = { isOpen: true, operatingHours: HOURS };
  const check = (store: Record<string, unknown>, now: Date) => {
    const { dayIndex, minutes } = brazilNow(now);
    return isOpenAt(store as any, dayIndex, minutes, now);
  };

  it('override no futuro abre fora do horário; vencido volta a seguir o horário', () => {
    const now = sp('20:00');
    expect(check(base, now)).toBe(false);
    expect(check({ ...base, openOverrideUntil: sp('23:00') }, now)).toBe(true);
    expect(check({ ...base, openOverrideUntil: sp('19:00') }, now)).toBe(false);
    // Vencido no meio do horário: segue o horário (aberta).
    expect(check({ ...base, openOverrideUntil: sp('09:00') }, sp('12:00'))).toBe(true);
  });

  it('pausa vence o override', () => {
    expect(check({ ...base, openOverrideUntil: sp('23:00'), pausedUntil: sp('21:00') }, sp('20:00'))).toBe(false);
  });

  it('isOpen=false vence o override', () => {
    expect(check({ ...base, isOpen: false, openOverrideUntil: sp('23:00') }, sp('20:00'))).toBe(false);
  });

  it('isStoreCurrentlyOpen usa o relógio de agora', () => {
    at(sp('20:00'));
    expect(isStoreCurrentlyOpen({ ...base, openOverrideUntil: sp('23:00') } as any)).toBe(true);
  });

  it('checkout: override vencido → "Loja fechada"', async () => {
    at(sp('20:00'));
    const c = await cenario({ openOverrideUntil: sp('19:00') });
    const res = await pedir(c.store.id, c.prod.id);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Loja fechada/);
  });

  it('checkout: pausa vence o override (409 STORE_PAUSED)', async () => {
    at(sp('20:00'));
    const c = await cenario({ openOverrideUntil: sp('23:00'), pausedUntil: sp('21:00') });
    const res = await pedir(c.store.id, c.prod.id);
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('STORE_PAUSED');
  });

  it('checkout: isOpen=false vence o override', async () => {
    at(sp('20:00'));
    const c = await cenario({ isOpen: false, openOverrideUntil: sp('23:00') });
    const res = await pedir(c.store.id, c.prod.id);
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/Loja fechada/);
  });
});

describe('vitrine enxerga a loja aberta com override', () => {
  it('cotação (POST /stores/quotes): open true', async () => {
    at(sp('20:00'));
    const com = await cenario({ openOverrideUntil: sp('23:00') });
    const sem = await cenario();
    const res = await request(app).post('/api/stores/quotes').send({ latitude: LAT, longitude: LNG, storeIds: [com.store.id, sem.store.id] });
    expect(res.status).toBe(200);
    const byId = new Map((res.body.data as any[]).map((q) => [q.storeId, q]));
    expect(byId.get(com.store.id)).toMatchObject({ open: true });
    expect(byId.get(sem.store.id)).toMatchObject({ open: false, opensAt: '10:00' });
  });

  it('busca com openNow=1: a loja com override aparece; sem override, não', async () => {
    at(sp('20:00'));
    const com = await cenario({ openOverrideUntil: sp('23:00') });
    const sem = await cenario();
    const ids = (res: request.Response) => (res.body.data.items as any[]).map((i) => i._id ?? i.id);
    const res = await request(app).get('/api/search').query({ type: 'stores', q: 'Açaí Fora Hora', lat: LAT, lng: LNG, openNow: '1', limit: 40 });
    expect(res.status).toBe(200);
    expect(ids(res)).toContain(com.store.id);
    expect(ids(res)).not.toContain(sem.store.id);
  });

  it('GET /stores/:id: isOpenNow true e o campo openOverrideUntil no payload', async () => {
    at(sp('20:00'));
    const c = await cenario({ openOverrideUntil: sp('23:00') });
    const res = await request(app).get(`/api/stores/${c.store.id}`);
    expect(res.status).toBe(200);
    expect(res.body.isOpenNow).toBe(true);
    expect(res.body.openOverrideUntil).toBe(sp('23:00').toISOString());
  });
});
