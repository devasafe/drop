/**
 * Regressão (auditoria de segurança 2026-10-07) — item 10: rotas públicas de loja
 * expõem só o necessário para a vitrine. Dados de pagamento/recebimento (asaas),
 * KYC (verification), CNPJ e integração (apiConfig) nunca saem em rota pública; o
 * dono também não recebe os segredos da subconta.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@sec10.test';
const PRIVATE_KEYS = ['asaas', 'verification', 'cnpj', 'apiConfig', 'customCommissionRate', 'planExpiresAt'];
const SECRET = 'apikey-cifrada-super-secreta';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function lojaComDadosSensiveis() {
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({
    data: {
      ownerId: dono.userId, name: 'Loja sec10', isOpen: true, isVerified: true, cnpj: '11222333000181',
      apiConfig: { token: 'tok' },
      verification: { address: { status: 'approved', comprovanteUrl: 'https://cdn/comprovante.jpg' } },
      asaas: { status: 'active', walletId: 'wal_123', accountId: 'acc_123', apiKeyEncrypted: SECRET, pixKey: 'chave@pix.com' },
    },
  });
  return { dono, store };
}

const leaked = (obj: any) => PRIVATE_KEYS.filter((k) => obj && k in obj);

describe('Item 10 — serializer público de loja', () => {
  it('GET /stores não devolve campos privados', async () => {
    const { store } = await lojaComDadosSensiveis();
    const res = await request(app).get('/api/stores');
    expect(res.status).toBe(200);
    const mine = res.body.find((s: any) => s._id === store.id);
    expect(mine).toBeDefined();
    expect(leaked(mine)).toEqual([]);
    expect(mine.name).toBe('Loja sec10');
    expect(mine.ownerId).toBeDefined(); // usado pela vitrine p/ "sou o dono"
  });

  it('GET /stores/:id não devolve campos privados', async () => {
    const { store } = await lojaComDadosSensiveis();
    const res = await request(app).get(`/api/stores/${store.id}`);
    expect(res.status).toBe(200);
    expect(leaked(res.body)).toEqual([]);
    expect(JSON.stringify(res.body)).not.toContain(SECRET);
  });

  it('GET /stores/top não devolve campos privados', async () => {
    const { store } = await lojaComDadosSensiveis();
    const cliente = await createTestUser('cliente', DOMAIN);
    await prisma.order.create({
      data: { customerId: cliente.userId, storeId: store.id, totalValue: 10, deliveryFee: 0, status: 'entregue', paymentMethod: 'pix', paymentStatus: 'paid' },
    });
    const res = await request(app).get('/api/stores/top');
    expect(res.status).toBe(200);
    const mine = res.body.find((s: any) => s._id === store.id);
    expect(mine).toBeDefined();
    expect(leaked(mine)).toEqual([]);
    expect(mine.salesCount).toBe(1);
  });

  it('painel do dono não traz os segredos da subconta Asaas', async () => {
    const { dono } = await lojaComDadosSensiveis();
    const res = await request(app).get('/api/stores/dashboard').set('Authorization', bearer(dono));
    expect(res.status).toBe(200);
    const raw = JSON.stringify(res.body.store);
    expect(raw).not.toContain(SECRET);
    expect(raw).not.toContain('wal_123');
    expect(res.body.store.cnpj).toBe('11222333000181'); // o dono continua vendo os próprios dados
  });
});
