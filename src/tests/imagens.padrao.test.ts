/**
 * Padrão de tamanho das imagens (capa, banner da Home, logo, banner do admin, avatar).
 * A imagem fora do tamanho/proporção da área volta 422 IMAGE_SIZE_INVALID antes de ir ao Cloudinary.
 * Cloudinary mockado: nenhum upload sai da máquina.
 */
jest.mock('../utils/cloudinary', () => ({
  ...jest.requireActual('../utils/cloudinary'),
  uploadToCloudinary: jest.fn(async (_buf: Buffer, folder: string) => `https://res.cloudinary.com/demo/image/upload/${folder}/arquivo.png`),
}));

import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { uploadToCloudinary } from '../utils/cloudinary';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { png } from './helpers/png';

const DOMAIN = '@imgpadrao.test';

const mockedUpload = uploadToCloudinary as jest.Mock;

beforeEach(() => mockedUpload.mockClear());
afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});
afterAll(async () => { await prisma.$disconnect(); });

async function lojaPremium(): Promise<{ dono: TestUser; storeId: string }> {
  const dono = await createTestUser('lojista', DOMAIN);
  // Sem StoreSubscription e plan 3: Premium legado, o banner de destaque é aceito.
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja Imagens', isOpen: true, plan: 3 } as any });
  return { dono, storeId: store.id };
}

const banner = (u: TestUser, type: 'cover' | 'featured', buf: Buffer) =>
  request(app).post('/api/stores/banner').query({ type }).set('Authorization', bearer(u))
    .attach('banner', buf, { filename: 'b.png', contentType: 'image/png' });

function expectRecusa(res: request.Response, msg: string) {
  expect(res.status).toBe(422);
  expect(res.body).toEqual({ error: msg, code: 'IMAGE_SIZE_INVALID' });
  expect(mockedUpload).not.toHaveBeenCalled();
}

describe('capa da loja (3:1, mínimo 1200 × 400)', () => {
  it('1200 × 400: 200', async () => {
    const { dono } = await lojaPremium();
    expect((await banner(dono, 'cover', png(1200, 400))).status).toBe(200);
  });

  it('1600 × 700 (fora de 3:1): 422 e nada é gravado', async () => {
    const { dono, storeId } = await lojaPremium();
    expectRecusa(await banner(dono, 'cover', png(1600, 700)), 'A imagem precisa ter pelo menos 1200 × 400 px, na proporção 3:1.');
    expect((await prisma.store.findUnique({ where: { id: storeId } }))!.coverBannerUrl).toBeNull();
  });

  it('600 × 200 (3:1, mas pequena): 422', async () => {
    const { dono } = await lojaPremium();
    expectRecusa(await banner(dono, 'cover', png(600, 200)), 'A imagem precisa ter pelo menos 1200 × 400 px, na proporção 3:1.');
  });

  it('buffer ilegível: 422', async () => {
    const { dono } = await lojaPremium();
    expectRecusa(await banner(dono, 'cover', Buffer.from('isto não é uma imagem')), 'A imagem precisa ter pelo menos 1200 × 400 px, na proporção 3:1.');
  });
});

describe('banner da Home do lojista (2:1, mínimo 1200 × 600)', () => {
  it('1200 × 600: 200', async () => {
    const { dono } = await lojaPremium();
    expect((await banner(dono, 'featured', png(1200, 600))).status).toBe(200);
  });

  it('1200 × 400: 422', async () => {
    const { dono } = await lojaPremium();
    expectRecusa(await banner(dono, 'featured', png(1200, 400)), 'A imagem precisa ter pelo menos 1200 × 600 px, na proporção 2:1.');
  });
});

describe('logo da loja (1:1, mínimo 400 × 400)', () => {
  const logo = (u: TestUser, storeId: string, buf: Buffer) =>
    request(app).post(`/api/stores/${storeId}/logo`).set('Authorization', bearer(u))
      .attach('logo', buf, { filename: 'logo.png', contentType: 'image/png' });

  it('400 × 300: 422', async () => {
    const { dono, storeId } = await lojaPremium();
    expectRecusa(await logo(dono, storeId, png(400, 300)), 'A imagem precisa ter pelo menos 400 × 400 px, na proporção 1:1.');
  });

  it('400 × 400: 200', async () => {
    const { dono, storeId } = await lojaPremium();
    expect((await logo(dono, storeId, png(400, 400))).status).toBe(200);
  });
});

describe('banner do admin (2:1, mínimo 1200 × 600)', () => {
  it('1200 × 600: 200', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await request(app).post('/api/banners/upload').set('Authorization', bearer(ceo))
      .attach('image', png(1200, 600), { filename: 'aviso.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body.imageUrl).toContain('drop/banners');
  });

  it('1200 × 400: 422', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await request(app).post('/api/banners/upload').set('Authorization', bearer(ceo))
      .attach('image', png(1200, 400), { filename: 'aviso.png', contentType: 'image/png' });
    expectRecusa(res, 'A imagem precisa ter pelo menos 1200 × 600 px, na proporção 2:1.');
  });
});

describe('foto de perfil (1:1, mínimo 400 × 400)', () => {
  const foto = (u: TestUser, buf: Buffer) =>
    request(app).post('/api/user/me/photo').set('Authorization', bearer(u))
      .attach('photo', buf, { filename: 'eu.png', contentType: 'image/png' });

  it('não quadrada: 422', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    expectRecusa(await foto(cliente, png(800, 600)), 'A imagem precisa ter pelo menos 400 × 400 px, na proporção 1:1.');
  });

  it('400 × 400: 200', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    expect((await foto(cliente, png(400, 400))).status).toBe(200);
  });
});
