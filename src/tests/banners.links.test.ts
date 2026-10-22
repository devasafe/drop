/**
 * Avisos da home (22/10, segurança): com a gestão aberta a banner:manage, o link e a imagem do banner
 * são validados no servidor. Link: vazio, caminho interno ("/…", nunca "//…") ou http(s) absoluto, até
 * 2048 caracteres. Imagem: só https do Cloudinary (o host do secure_url do upload). Senão, 400 e nada gravado.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';

const DOMAIN = '@banners-links.test';
const MARK = '[banners-links]';
const IMG = 'https://res.cloudinary.com/drop/image/upload/v1/drop/banners/a.jpg';
const INVALID_LINK = { error: 'Link inválido: use um endereço que comece com https:// ou /.', code: 'INVALID_LINK' };
let ceo: TestUser;

beforeAll(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
});
afterEach(async () => {
  await prisma.promoBanner.deleteMany({ where: { title: { startsWith: MARK } } });
});
afterAll(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
  await prisma.$disconnect();
});

const create = (body: Record<string, unknown>) =>
  request(app).post('/api/banners').set('Authorization', bearer(ceo)).send({ title: `${MARK} aviso`, imageUrl: IMG, ...body });
const count = () => prisma.promoBanner.count({ where: { title: { startsWith: MARK } } });

const BAD_LINKS: Array<[string, unknown]> = [
  ['javascript:', 'javascript:alert(1)'],
  ['JavaScript: com espaço antes', ' JavaScript:alert(1)'],
  ['JAVASCRIPT:', 'JAVASCRIPT:alert(1)'],
  ['esquema com espaço no meio', 'java script:alert(1)'],
  ['data:', 'data:text/html,<script>alert(1)</script>'],
  ['vbscript:', 'vbscript:msgbox(1)'],
  ['//evil.com', '//evil.com'],
  ['//evil.com com espaço antes', ' //evil.com'],
  ['/\\evil.com', '/\\evil.com'],
  ['HTTPS com espaço antes do ":"', 'HTTPS ://evil.com'],
  ['ftp:', 'ftp://x.com'],
  ['sem esquema', 'evil.com'],
  ['mais de 2048 caracteres', `https://x.com/${'a'.repeat(2048)}`],
  ['número', 42],
];

describe('POST /api/banners: link', () => {
  it.each(BAD_LINKS)('%s: 400 INVALID_LINK e nada gravado', async (_label, linkUrl) => {
    const res = await create({ linkUrl });
    expect(res.status).toBe(400);
    expect(res.body).toEqual(INVALID_LINK);
    expect(await count()).toBe(0);
  });

  it.each([
    ['https://drop.app/promo', 'https://drop.app/promo'],
    ['  HTTPS://drop.app/promo  ', 'HTTPS://drop.app/promo'],
    ['http://drop.app', 'http://drop.app'],
    ['/loja/abc', '/loja/abc'],
    ['', null],
    [null, null],
  ])('%p: 201', async (linkUrl, saved) => {
    const res = await create({ linkUrl });
    expect(res.status).toBe(201);
    expect(res.body.linkUrl).toBe(saved);
  });
});

describe('POST /api/banners: imagem', () => {
  it.each([
    ['http://res.cloudinary.com/drop/a.jpg'],
    ['https://evil.com/a.jpg'],
    ['https://res.cloudinary.com.evil.com/a.jpg'],
    ['javascript:alert(1)'],
    ['data:image/png;base64,AAAA'],
  ])('%p: 400 INVALID_IMAGE e nada gravado', async (imageUrl) => {
    const res = await create({ imageUrl });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('INVALID_IMAGE');
    expect(await count()).toBe(0);
  });
});

describe('PATCH /api/banners/:id', () => {
  it('link e imagem inválidos: 400 e o banner não muda; válidos: 200', async () => {
    const made = await create({ linkUrl: '/promo' });
    const id = made.body._id;
    const patch = (body: Record<string, unknown>) =>
      request(app).patch(`/api/banners/${id}`).set('Authorization', bearer(ceo)).send(body);

    const badLink = await patch({ linkUrl: 'javascript:alert(1)' });
    expect(badLink.status).toBe(400);
    expect(badLink.body).toEqual(INVALID_LINK);
    const badImg = await patch({ imageUrl: 'https://evil.com/a.jpg' });
    expect(badImg.status).toBe(400);
    expect(badImg.body.code).toBe('INVALID_IMAGE');
    const row = await prisma.promoBanner.findUnique({ where: { id } });
    expect(row).toMatchObject({ linkUrl: '/promo', imageUrl: IMG });

    const ok = await patch({ linkUrl: 'https://drop.app/x' });
    expect(ok.status).toBe(200);
    expect(ok.body.linkUrl).toBe('https://drop.app/x');
    const toggle = await patch({ active: false });
    expect(toggle.status).toBe(200);
  });
});
