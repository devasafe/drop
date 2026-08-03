import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';

afterEach(async () => { await cleanupUsersByEmailDomain('@disp.test'); });

async function motoboy(isOnline: boolean) {
  const user = await prisma.user.create({
    data: {
      name: 'Moto', email: `m-${Date.now()}-${Math.random().toString(36).slice(2)}@disp.test`,
      passwordHash: await bcrypt.hash('Senha123!', 10),
      role: 'motoboy', roles: ['motoboy'], activeRole: 'motoboy', isOnline,
      // jest.setup.ts liga KYC_ENFORCED=true globalmente — sem isto, o gate de
      // verificação (linha ~707 de deliveryController.ts) intercepta a requisição
      // ANTES do nosso gate de isOnline e devolve `requiresVerification`, mascarando
      // o teste (visto no RED: o teste "online" falhava com 0 entregas por causa do
      // KYC, não do isOnline). Motoboy totalmente verificado passa por aquele gate
      // e deixa o gate de isOnline ser o único em jogo neste teste.
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
  // O model `Delivery` (prisma/schema.prisma) não tem campo `storeId` — o brief
  // assumia essa coluna, mas ela não existe (confirmado: `Unknown argument storeId`
  // ao rodar o teste). `orderId` é a única coluna NOT NULL além de status/fee, e não
  // tem FK real p/ Order (confirmado em prisma/migrations/20260722044250_init/migration.sql),
  // então um id sintético satisfaz a coluna sem precisar criar Store/Order completos,
  // que este teste (gate de isOnline, sem filtro por raio já que o motoboy não reporta GPS) não usa.
  const orderId = `order-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  await prisma.delivery.create({ data: { orderId, status: 'pending', fee: 10 } as any });
}

describe('gate de disponibilidade no despacho', () => {
  it('offline → pool vazio + offline:true', async () => {
    const { token } = await motoboy(false);
    await pendingDelivery();
    const r = await request(app).get('/api/deliveries/available').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.offline).toBe(true);
    expect(r.body.deliveries).toEqual([]);
  });

  it('online (sem GPS) → lista as pendentes', async () => {
    const { token } = await motoboy(true);
    await pendingDelivery();
    const r = await request(app).get('/api/deliveries/available').set('Authorization', `Bearer ${token}`);
    expect(r.status).toBe(200);
    expect(r.body.offline).toBeFalsy();
    expect(r.body.deliveries.length).toBeGreaterThanOrEqual(1);
  });
});
