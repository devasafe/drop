/**
 * D1 · P2.7 — identidade da loja: logo, frase (até 80) e capa em todos os planos.
 * A capa deixa de dar 403 fora do Plano 3 (o banner de destaque continua regra do Premium).
 * Cloudinary mockado: nenhum upload sai da máquina.
 */
jest.mock('../utils/cloudinary', () => ({
  ...jest.requireActual('../utils/cloudinary'),
  uploadToCloudinary: jest.fn(async (_buf: Buffer, folder: string) => `https://res.cloudinary.com/demo/image/upload/${folder}/arquivo.png`),
}));

import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@d1ident.test';
const LOGO = 'https://res.cloudinary.com/demo/image/upload/drop/logos/logo.png';
const CAPA = 'https://res.cloudinary.com/demo/image/upload/drop/banners/capa.png';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function lojaPlano1(dono: TestUser) {
  // Sem StoreSubscription e plan 1: é o Plano 1 para o uploadStoreBanner.
  return prisma.store.create({ data: { ownerId: dono.userId, name: 'Doceria Identidade', isOpen: true, isVerified: true, plan: 1 } });
}

describe('PUT /stores/:id — identidade', () => {
  it('grava logo, frase e capa; o GET público mostra', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await lojaPlano1(dono);
    const res = await request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(dono))
      .send({ logoUrl: LOGO, tagline: '  Doces feitos no dia  ', coverBannerUrl: CAPA });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ logoUrl: LOGO, tagline: 'Doces feitos no dia', coverBannerUrl: CAPA });

    const pub = await request(app).get(`/api/stores/${store.id}`);
    expect(pub.status).toBe(200);
    expect(pub.body).toMatchObject({ logoUrl: LOGO, tagline: 'Doces feitos no dia', coverBannerUrl: CAPA });
  });

  it('frase com 81 caracteres: 400 e nada muda', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await lojaPlano1(dono);
    const res = await request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(dono)).send({ tagline: 'x'.repeat(81) });
    expect(res.status).toBe(400);
    expect((await prisma.store.findUnique({ where: { id: store.id } }) as any).tagline).toBeNull();
  });

  it('link de imagem fora do Cloudinary: 400', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await lojaPlano1(dono);
    for (const body of [{ logoUrl: 'https://exemplo.com/logo.png' }, { coverBannerUrl: 'http://res.cloudinary.com/x.png' }, { logoUrl: 'nao-e-url' }]) {
      const res = await request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(dono)).send(body);
      expect(res.status).toBe(400);
    }
    const saved = await prisma.store.findUnique({ where: { id: store.id } }) as any;
    expect(saved.logoUrl).toBeNull();
    expect(saved.coverBannerUrl).toBeNull();
  });

  it('null remove o logo e a capa; frase vazia vira null', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await lojaPlano1(dono);
    await prisma.store.update({ where: { id: store.id }, data: { logoUrl: LOGO, coverBannerUrl: CAPA, tagline: 'Antiga' } as any });
    const res = await request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(dono)).send({ logoUrl: null, coverBannerUrl: null, tagline: '' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ logoUrl: null, coverBannerUrl: null, tagline: null });
  });

  it('salvar só o nome não mexe na identidade', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await lojaPlano1(dono);
    await prisma.store.update({ where: { id: store.id }, data: { logoUrl: LOGO, tagline: 'Fica' } as any });
    const res = await request(app).put(`/api/stores/${store.id}`).set('Authorization', bearer(dono)).send({ name: 'Doceria Nova' });
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ name: 'Doceria Nova', logoUrl: LOGO, tagline: 'Fica' });
  });
});

describe('uploads de capa e logo', () => {
  it('capa no Plano 1: 200 e grava coverBannerUrl (antes era 403)', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await lojaPlano1(dono);
    const res = await request(app).post('/api/stores/banner').query({ type: 'cover' }).set('Authorization', bearer(dono))
      .attach('banner', PNG, { filename: 'capa.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, type: 'cover', url: 'https://res.cloudinary.com/demo/image/upload/drop/banners/arquivo.png' });
    const saved = await prisma.store.findUnique({ where: { id: store.id } });
    expect(saved?.coverBannerUrl).toBe('https://res.cloudinary.com/demo/image/upload/drop/banners/arquivo.png');
    expect(saved?.featuredBannerUrl).toBeNull();
  });

  it('logo: POST /stores/:id/logo grava e devolve logoUrl', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await lojaPlano1(dono);
    const res = await request(app).post(`/api/stores/${store.id}/logo`).set('Authorization', bearer(dono))
      .attach('logo', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ success: true, data: { logoUrl: 'https://res.cloudinary.com/demo/image/upload/drop/logos/arquivo.png' } });
    expect((await prisma.store.findUnique({ where: { id: store.id } }) as any).logoUrl).toBe('https://res.cloudinary.com/demo/image/upload/drop/logos/arquivo.png');
  });

  it('logo: outro lojista 403 NOT_STORE_OWNER; sem arquivo 400 NO_FILE; loja inexistente 404', async () => {
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await lojaPlano1(dono);
    const intruso = await createTestUser('lojista', DOMAIN);
    const r1 = await request(app).post(`/api/stores/${store.id}/logo`).set('Authorization', bearer(intruso))
      .attach('logo', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(r1.status).toBe(403);
    expect(r1.body.error.code).toBe('NOT_STORE_OWNER');
    const r2 = await request(app).post(`/api/stores/${store.id}/logo`).set('Authorization', bearer(dono));
    expect(r2.status).toBe(400);
    expect(r2.body.error.code).toBe('NO_FILE');
    const r3 = await request(app).post('/api/stores/nao-existe-logo/logo').set('Authorization', bearer(dono))
      .attach('logo', PNG, { filename: 'logo.png', contentType: 'image/png' });
    expect(r3.status).toBe(404);
    expect((await prisma.store.findUnique({ where: { id: store.id } }) as any).logoUrl).toBeNull();
  });
});
