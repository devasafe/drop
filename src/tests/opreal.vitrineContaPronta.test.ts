/**
 * Operação real · no modo SaaS (direto) a vitrine só mostra loja que consegue cobrar: conta Asaas
 * `valid` e termo aceito (isStorePaymentsReady). Sem isso o cliente só descobria no checkout.
 */
import crypto from 'crypto';
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { isStoreHiddenFromPublic } from '../services/catalog/visibility';
import { isStorePaymentsReady } from '../services/asaasLoja/charge';
import env from '../config/env';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';
import { grantStoreConsent } from './helpers/storeConsent';

const DOMAIN = '@oprealvitrine.test';
const sha = (s: string) => crypto.createHash('sha256').update(s, 'utf8').digest('hex');

let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); await prisma.$disconnect(); });
const ORIGINAL_URL = env.ASAAS_API_URL;
afterEach(async () => { (env as any).ASAAS_API_URL = ORIGINAL_URL; await cleanupUsersByEmailDomain(DOMAIN); });

async function mkStore(name: string, opts: { account?: 'valid' | 'invalid'; consent?: boolean; environment?: 'sandbox' | 'production' } = {}) {
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: dono.userId, name, isOpen: true, isVerified: true } as any });
  if (opts.account) {
    await prisma.storeAsaasAccount.create({
      data: {
        storeId: store.id, apiKeyEncrypted: encryptSensitiveData('$aact_hmlg_VITRINE'), apiKeyLast4: 'VITR',
        environment: opts.environment ?? 'sandbox', status: opts.account, paymentWebhookId: `wh_${store.id}`, paymentWebhookTokenHash: sha(store.id),
      },
    });
  }
  if (opts.consent) await grantStoreConsent(store.id);
  return store;
}

async function publicNames(): Promise<string[]> {
  const res = await request(app).get('/api/stores?limit=200');
  expect(res.status).toBe(200);
  const list: any[] = res.body.stores ?? res.body.data ?? res.body;
  return list.map((s) => s.name).filter((n: string) => n.startsWith('Vitrine '));
}

describe('vitrine no modo SaaS exige conta pronta para cobrar', () => {
  it('direto: só a loja com conta valid e termo aceito aparece', async () => {
    await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
    const pronta = await mkStore('Vitrine Pronta', { account: 'valid', consent: true });
    const semConta = await mkStore('Vitrine Sem Conta');
    const invalida = await mkStore('Vitrine Invalida', { account: 'invalid', consent: true });
    const semTermo = await mkStore('Vitrine Sem Termo', { account: 'valid' });

    expect(await publicNames()).toEqual(['Vitrine Pronta']);
    expect(await isStoreHiddenFromPublic(pronta.id)).toBe(false);
    expect(await isStoreHiddenFromPublic(semConta.id)).toBe(true);
    expect(await isStoreHiddenFromPublic(invalida.id)).toBe(true);
    expect(await isStoreHiddenFromPublic(semTermo.id)).toBe(true);
  });

  it('direto: conta de outro ambiente (sandbox × produção) não está pronta nem aparece', async () => {
    await updatePlatformConfig({ settlementMode: 'direto' } as any, 'test');
    (env as any).ASAAS_API_URL = 'https://api.asaas.com/v3';
    const sandbox = await mkStore('Vitrine Chave Sandbox', { account: 'valid', consent: true });
    const prod = await mkStore('Vitrine Chave Prod', { account: 'valid', consent: true, environment: 'production' });

    expect(await publicNames()).toEqual(['Vitrine Chave Prod']);
    expect(await isStorePaymentsReady(sandbox.id)).toBe(false);
    expect(await isStorePaymentsReady(prod.id)).toBe(true);
    expect(await isStoreHiddenFromPublic(sandbox.id)).toBe(true);
  });

  it('custódia: conta Asaas da loja não entra na regra', async () => {
    await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
    const semConta = await mkStore('Vitrine Custodia');
    expect(await publicNames()).toContain('Vitrine Custodia');
    expect(await isStoreHiddenFromPublic(semConta.id)).toBe(false);
  });
});
