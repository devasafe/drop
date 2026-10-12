import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@d1pix.test';
let restore: () => Promise<void>;

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); });
beforeEach(async () => { await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test'); });
afterEach(async () => { await cleanupUsersByEmailDomain(DOMAIN); });

async function lojaComChave(pixKey: string | null, pixKeyType?: string) {
  const dono = await createTestUser('lojista', DOMAIN);
  const asaas = pixKey ? { status: 'active', pixKey, pixKeyType } : { status: 'none' };
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja Pix', isOpen: true, street: 'Rua A', asaas } as any });
  return { dono, store };
}

describe('GET /onboarding/status — chave Pix mascarada', () => {
  it('loja com CPF: devolve ***.456.789-** e nunca a chave inteira', async () => {
    const { dono } = await lojaComChave('12345678901', 'CPF');
    const res = await request(app).get('/api/onboarding/status').set('Authorization', bearer(dono));
    expect(res.status).toBe(200);
    expect(res.body.hasPixKey).toBe(true);
    expect(res.body.pixKey).toBe('***.456.789-**');
    expect(JSON.stringify(res.body)).not.toContain('12345678901');
  });

  it('motoboy com e-mail: devolve a***@x.com', async () => {
    const m = await createTestUser('motoboy', DOMAIN);
    await prisma.user.update({ where: { id: m.userId }, data: { asaas: { status: 'active', pixKey: 'ana@x.com', pixKeyType: 'EMAIL' } } as any });
    const res = await request(app).get('/api/onboarding/status').set('Authorization', bearer(m));
    expect(res.status).toBe(200);
    expect(res.body.pixKey).toBe('a***@x.com');
    expect(JSON.stringify(res.body)).not.toContain('ana@x.com');
  });

  it('sem chave: pixKey null e hasPixKey false', async () => {
    const { dono } = await lojaComChave(null);
    const res = await request(app).get('/api/onboarding/status').set('Authorization', bearer(dono));
    expect(res.status).toBe(200);
    expect(res.body.hasPixKey).toBe(false);
    expect(res.body.pixKey).toBeNull();
  });
});

describe('salvar a chave mascarada é recusado', () => {
  it('POST /onboarding/pix-key com a chave da tela: 400 PIX_KEY_MASKED e a chave real fica', async () => {
    const { dono, store } = await lojaComChave('12345678901', 'CPF');
    const res = await request(app).post('/api/onboarding/pix-key').set('Authorization', bearer(dono)).send({ pixKey: '***.456.789-**' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PIX_KEY_MASKED');
    expect(typeof res.body.error).toBe('string');
    const saved = await prisma.store.findUnique({ where: { id: store.id } }) as any;
    expect(saved.asaas.pixKey).toBe('12345678901');
  });

  it('POST /onboarding/receiver com a chave da tela: 400 PIX_KEY_MASKED', async () => {
    const { dono, store } = await lojaComChave('12345678901', 'CPF');
    const res = await request(app).post('/api/onboarding/receiver').set('Authorization', bearer(dono)).send({ pixKey: '123e…4000' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PIX_KEY_MASKED');
    const saved = await prisma.store.findUnique({ where: { id: store.id } }) as any;
    expect(saved.asaas.pixKey).toBe('12345678901');
  });
});
