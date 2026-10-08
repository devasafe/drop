/**
 * Troca de modo protegida (decisão do usuário, 2026-10-08): a troca SaaS ↔ app acontece
 * uma vez só e mexe em para onde vai o dinheiro — "esse botao tem que ser protegido,
 * pergunta se tem certeza e avisa dos riscos".
 *  - GET  /admin/switches/settlement-preview?to=… → riscos com os números reais e a frase;
 *  - PUT  /admin/switches mudando o modo exige `confirmSettlement` = a frase exata;
 *  - voltar para custódia sem gateway Asaas é bloqueado (carteira virtual sem lastro).
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import env from '../config/env';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { getSaasConfig } from '../utils/settlement';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@saas19.test';
let restore: () => Promise<void>;
const ORIGINAL = { pay: env.PAYMENT_GATEWAY, out: env.PAYOUT_GATEWAY };

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => {
  await restore();
  (env as any).PAYMENT_GATEWAY = ORIGINAL.pay;
  (env as any).PAYOUT_GATEWAY = ORIGINAL.out;
});
beforeEach(async () => {
  (env as any).PAYMENT_GATEWAY = 'asaas';
  (env as any).PAYOUT_GATEWAY = 'asaas';
  await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.order.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const put = (u: any, body: object) => request(app).put('/api/admin/switches').set('Authorization', bearer(u)).send(body);

describe('troca de modo protegida', () => {
  it('sem a frase de confirmação → 400 SETTLEMENT_CONFIRM_REQUIRED e o modo não muda', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await put(ceo, { settlementMode: 'custodia' });
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('SETTLEMENT_CONFIRM_REQUIRED');
    expect(res.body.confirmPhrase).toBe('TROCAR PARA APP');
    expect((await getSaasConfig()).settlementMode).toBe('direto');
  });

  it('frase errada → 400 e o modo não muda', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await put(ceo, { settlementMode: 'custodia', confirmSettlement: 'trocar para app' });
    expect(res.status).toBe(400);
    expect((await getSaasConfig()).settlementMode).toBe('direto');
  });

  it('frase exata → troca', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await put(ceo, { settlementMode: 'custodia', confirmSettlement: 'TROCAR PARA APP' });
    expect(res.status).toBe(200);
    expect(res.body.settlementMode).toBe('custodia');
    expect(res.body).not.toHaveProperty('confirmSettlement');
  });

  it('mandar o modo atual não pede confirmação (nada muda)', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    expect((await put(ceo, { settlementMode: 'direto' })).status).toBe(200);
  });

  it('voltar para custódia sem gateway Asaas → 409 SETTLEMENT_BLOCKED, mesmo com a frase', async () => {
    (env as any).PAYMENT_GATEWAY = 'none';
    const ceo = await createTestUser('ceo', DOMAIN);
    const res = await put(ceo, { settlementMode: 'custodia', confirmSettlement: 'TROCAR PARA APP' });
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('SETTLEMENT_BLOCKED');
    expect((await getSaasConfig()).settlementMode).toBe('direto');
  });

  it('preview mostra os pedidos em andamento do modo atual e a frase', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const lojista = await createTestUser('lojista', DOMAIN);
    const cliente = await createTestUser('cliente', DOMAIN);
    const store = await prisma.store.create({ data: { ownerId: lojista.userId, name: 'Loja 19' } as any });
    for (const status of ['criado', 'pago', 'entregue'] as const) {
      await prisma.order.create({
        data: { customerId: cliente.userId, storeId: store.id, totalValue: 10, deliveryFee: 0, status, paymentMethod: 'pix', paymentProvider: 'asaas_loja' } as any,
      });
    }
    const res = await request(app).get('/api/admin/switches/settlement-preview?to=custodia').set('Authorization', bearer(ceo));
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ from: 'direto', to: 'custodia', confirmPhrase: 'TROCAR PARA APP', blockers: [] });
    expect(res.body.counts.directOrdersInFlight).toBeGreaterThanOrEqual(2);
    expect(res.body.risks.length).toBeGreaterThan(0);
  });

  it('preview e troca de modo são só do CEO', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const res = await request(app).get('/api/admin/switches/settlement-preview?to=custodia').set('Authorization', bearer(gerente));
    expect([403]).toContain(res.status);
  });
});
