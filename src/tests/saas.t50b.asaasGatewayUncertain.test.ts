/**
 * Lote pré-deploy 2 — item A: o gateway de saque separa recusa clara (4xx do Asaas: nada saiu)
 * de resposta incerta (timeout, rede, 5xx: o Pix pode ter saído). Antes tudo virava 'failed' e
 * a aprovação devolvia o saque a pending — a nova tentativa enviava o Pix de novo.
 */
jest.mock('../services/asaas/client', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), postAs: jest.fn(), getAs: jest.fn() },
}));

import asaasClient from '../services/asaas/client';
import { fakeObjectId } from './helpers/ids';
import { AsaasGateway } from '../services/payoutGateway/asaasGateway';
import { createPayout } from './helpers/financePg';
import { encryptSensitiveData } from '../utils/encryption';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { ownerIdForStore } from './helpers/storeOwner';

const postAs = (asaasClient as any).postAs as jest.Mock;
const getAs = (asaasClient as any).getAs as jest.Mock;
const DOMAIN = '@t50b.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
  postAs.mockReset();
  getAs.mockReset();
});

async function payoutDeLoja() {
  const store = await prisma.store.create({ data: {
    ownerId: await ownerIdForStore(DOMAIN),
    name: 'Loja',
    asaas: { status: 'active', walletId: 'w', apiKeyEncrypted: encryptSensitiveData('$k'), pixKey: 'l@x.com', pixKeyType: 'EMAIL' },
  } });
  const payout = await createPayout({
    recipientType: 'store', recipientId: store.id, orderId: fakeObjectId(), amount: 20, status: 'released',
  });
  return String(payout._id);
}

const asaasErr = (status: number) =>
  Object.assign(new Error(`HTTP ${status}`), { name: 'AsaasApiError', status, errors: [] });

const transferir = async () =>
  new AsaasGateway().transfer({ payoutIds: [await payoutDeLoja()], bankInfo: {} as any, amount: 20, recipientName: 'Loja' });

describe('AsaasGateway.transfer — recusa clara × incerteza', () => {
  it('4xx do Asaas → failed, sem incerteza', async () => {
    postAs.mockRejectedValue(asaasErr(400));
    const r = await transferir();
    expect(r.status).toBe('failed');
    expect(r.uncertain).toBeFalsy();
  });

  it.each([
    ['timeout', new Error('Timeout (20000ms) na chamada Asaas POST /transfers')],
    ['rede', Object.assign(new Error('fetch failed'), { name: 'TypeError' })],
    ['5xx', asaasErr(502)],
    ['408', asaasErr(408)],
  ])('%s → failed com uncertain', async (_n, err) => {
    postAs.mockRejectedValue(err);
    const r = await transferir();
    expect(r.status).toBe('failed');
    expect(r.uncertain).toBe(true);
  });

  it('resposta 200 sem id → incerta', async () => {
    postAs.mockResolvedValue({});
    const r = await transferir();
    expect(r.uncertain).toBe(true);
  });
});
