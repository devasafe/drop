// src/tests/d1.p3.t14.featuredBannerUpload.test.ts
/** D1 · P3.14 — banner do Premium pode subir antes da aprovação (fica guardado). */
jest.mock('../utils/cloudinary', () => {
  const actual = jest.requireActual('../utils/cloudinary');
  return { __esModule: true, ...actual, uploadToCloudinary: jest.fn(async () => 'https://img.test/banner.png') };
});

import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@d1p3t14.test';
// PNG mínimo (assinatura + IHDR); o upload só checa mimetype/extensão.
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489', 'hex');
let dono: TestUser;
let storeId: string;

beforeEach(async () => {
  dono = await createTestUser('lojista', DOMAIN);
  storeId = (await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P3.14', isOpen: true, plan: 1 } as any })).id;
});
afterEach(async () => {
  await prisma.storeSubscription.deleteMany({ where: { storeId } });
  await cleanupUsersByEmailDomain(DOMAIN);
});
afterAll(async () => { await prisma.$disconnect(); });

const upload = (u: TestUser) =>
  request(app).post('/api/stores/banner?type=featured').set('Authorization', bearer(u)).attach('banner', PNG, { filename: 'b.png', contentType: 'image/png' });
const sub = (data: Record<string, unknown>) => prisma.storeSubscription.create({ data: { storeId, storeName: 'Loja P3.14', ...data } as any });

it('Plano 1 com troca para o Premium pendente: aceita e guarda o banner', async () => {
  await sub({ currentPlan: 'plan1', requestedPlan: 'plan3', planChangeStatus: 'pending', requestedAt: new Date() });
  const r = await upload(dono);
  expect(r.status).toBe(200);
  expect(r.body).toMatchObject({ success: true, type: 'featured', url: 'https://img.test/banner.png' });
  expect((await prisma.store.findUnique({ where: { id: storeId } }))!.featuredBannerUrl).toBe('https://img.test/banner.png');
});

it('Plano 3 ativo: aceita', async () => {
  await sub({ currentPlan: 'plan3' });
  await prisma.store.update({ where: { id: storeId }, data: { plan: 3 } });
  expect((await upload(dono)).status).toBe(200);
});

it('sem pedido de Premium (pendente para o Plano 2, ou recusado): 403 e nada é gravado', async () => {
  await sub({ currentPlan: 'plan1', requestedPlan: 'plan2', planChangeStatus: 'pending' });
  expect((await upload(dono)).status).toBe(403);
  await prisma.storeSubscription.update({ where: { storeId }, data: { requestedPlan: 'plan3', planChangeStatus: 'rejected' } });
  expect((await upload(dono)).status).toBe(403);
  expect((await prisma.store.findUnique({ where: { id: storeId } }))!.featuredBannerUrl).toBeNull();
});
