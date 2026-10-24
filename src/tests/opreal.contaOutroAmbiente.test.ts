/**
 * Operação real · conta Asaas da loja de outro ambiente (conectada no sandbox, servidor já em
 * produção): o lojista vê a conta inválida (reconectar) e o admin vê "recebimento com problema".
 */
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { getStoreAsaasStatus } from '../services/asaasLoja/account';
import { receivingStatus } from '../services/adminAccounts/storeStatus';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { ownerIdForStore } from './helpers/storeOwner';

const DOMAIN = '@oprealambiente.test';
const ORIGINAL_URL = env.ASAAS_API_URL;
afterEach(async () => { (env as any).ASAAS_API_URL = ORIGINAL_URL; await cleanupUsersByEmailDomain(DOMAIN); });
afterAll(() => prisma.$disconnect());

const okAccount = (environment: string) => ({
  status: 'valid', environment, paymentWebhookId: 'wh', ipWhitelistConfirmedAt: new Date(), authWebhookConfirmedAt: new Date(), lastError: null,
});

describe('conta Asaas de outro ambiente', () => {
  it('painel do lojista: status invalid e checklist da chave desmarcado', async () => {
    (env as any).ASAAS_API_URL = 'https://api.asaas.com/v3';
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja Ambiente', isOpen: true } as any });
    await prisma.storeAsaasAccount.create({
      data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData('$aact_hmlg_X'), apiKeyLast4: 'XXXX', environment: 'sandbox', status: 'valid' },
    });
    const st = await getStoreAsaasStatus(store.id);
    expect(st.status).toBe('invalid');
    expect(st.environment).toBe('sandbox');
    expect(st.checklist.apiKey).toBe(false);
  });

  it('admin: recebimento com problema; mesmo ambiente segue ok', () => {
    (env as any).ASAAS_API_URL = 'https://api.asaas.com/v3';
    expect(receivingStatus('direto', 'none', { asaas: null, asaasAccount: okAccount('sandbox') } as any)).toBe('problem');
    expect(receivingStatus('direto', 'none', { asaas: null, asaasAccount: okAccount('production') } as any)).toBe('ok');
  });
});
