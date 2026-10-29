/**
 * Localização "Aproximada" do Android (margem de erro de km): o motoboy não vê, não é avisado e
 * não aceita corrida nova até mandar uma posição precisa. O admin vê o selo no mapa.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { impreciseOnlineCouriers, isImpreciseAccuracy } from '../services/courierPrecision';
import { getOpsMap } from '../services/adminOps/map';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';
const DOMAIN = '@gpsaproximado.test';

let deliveryIds: string[] = [];

afterEach(async () => {
  if (deliveryIds.length) await prisma.delivery.deleteMany({ where: { id: { in: deliveryIds } } });
  deliveryIds = [];
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function motoboy() {
  const user = await prisma.user.create({
    data: {
      name: 'Moto GPS', email: `m-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`,
      passwordHash: await bcrypt.hash('Senha123!', 10),
      role: 'motoboy', roles: ['motoboy'], activeRole: 'motoboy', isOnline: true,
      verification: {
        email: { status: 'verified' },
        phone: { status: 'verified', e164: '+5511988887777' },
        document: { type: 'rg', status: 'approved' },
        facial: { status: 'approved' },
        courier: { status: 'approved' },
      },
    } as any,
  });
  const token = jwt.sign({ id: user.id, role: 'motoboy', activeRole: 'motoboy', roles: ['motoboy'] }, JWT_SECRET);
  return { user, token };
}

async function pendingDelivery() {
  const orderId = `order-gps-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const d = await prisma.delivery.create({ data: { orderId, status: 'pending', fee: 10, storeLatitude: -23.55, storeLongitude: -46.63 } as any });
  deliveryIds.push(d.id);
  return d;
}

const sendLocation = (token: string, body: Record<string, unknown>) =>
  request(app).post('/api/deliveries/location').set('Authorization', `Bearer ${token}`).send({ lat: -23.55, lng: -46.63, isOnline: true, ...body });
const available = (token: string) => request(app).get('/api/deliveries/available').set('Authorization', `Bearer ${token}`);

it('limite: acima de 500 m é aproximada; sem margem (app antigo) não é', () => {
  expect(isImpreciseAccuracy(2000)).toBe(true);
  expect(isImpreciseAccuracy(500)).toBe(false);
  expect(isImpreciseAccuracy(12)).toBe(false);
  expect(isImpreciseAccuracy(undefined)).toBe(false);
  expect(isImpreciseAccuracy('abc')).toBe(false);
});

it('posição aproximada: guarda a margem, esconde as corridas, recusa o aceite e corrige com a precisa', async () => {
  const { user, token } = await motoboy();
  const d = await pendingDelivery();

  expect((await sendLocation(token, { accuracy: 2400.7 })).status).toBe(200);
  const loc = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).currentLocation as any;
  expect(loc).toMatchObject({ accuracy: 2401, imprecise: true });

  const list = await available(token);
  expect(list.body).toMatchObject({ deliveries: [], imprecise: true });

  const claim = await request(app).post(`/api/deliveries/${d.id}/claim`).set('Authorization', `Bearer ${token}`);
  expect(claim.status).toBe(409);
  expect(claim.body.code).toBe('LOCATION_IMPRECISE');
  expect((await prisma.delivery.findUniqueOrThrow({ where: { id: d.id } })).motoboyId).toBeNull();

  expect(await impreciseOnlineCouriers()).toContain(user.id);
  const map = await getOpsMap();
  expect(map.motoboys.find((m) => m.id === user.id)?.imprecise).toBe(true);

  await sendLocation(token, { accuracy: 15 });
  const fixed = (await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).currentLocation as any;
  expect(fixed.imprecise).toBeUndefined();
  const again = await available(token);
  expect(again.body.imprecise).toBeUndefined();
  expect(again.body.deliveries.map((x: any) => x._id ?? x.id)).toContain(d.id);
  expect(await impreciseOnlineCouriers()).not.toContain(user.id);
  expect((await getOpsMap()).motoboys.find((m) => m.id === user.id)?.imprecise).toBe(false);
});

it('app antigo sem margem de erro continua recebendo corridas', async () => {
  const { token } = await motoboy();
  const d = await pendingDelivery();
  await sendLocation(token, {});
  const list = await available(token);
  expect(list.body.imprecise).toBeUndefined();
  expect(list.body.deliveries.map((x: any) => x._id ?? x.id)).toContain(d.id);
});
