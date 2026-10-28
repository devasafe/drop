/**
 * Taxa de mensageria (R$ 0,99 por cobrança): o Asaas cobra da conta quando ele mesmo avisa o
 * comprador. O customer na conta da loja nasce com os avisos desligados, e os antigos são
 * desligados na próxima compra, sem segurar a venda se o Asaas falhar.
 */
jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: { ...actual.default, postAs: jest.fn(), putAs: jest.fn() },
  };
});

import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { ensureStoreCustomer } from '../services/asaasLoja/charge';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';
import { ownerIdForStore } from './helpers/storeOwner';

const DOMAIN = '@semmensageria.test';
const STORE_KEY = '$aact_hmlg_MSG';
const postAs = asaasClient.postAs as jest.Mock;
const putAs = asaasClient.putAs as jest.Mock;

async function setup() {
  const buyer = await createTestUser('cliente', DOMAIN);
  await prisma.user.update({ where: { id: buyer.userId }, data: { cpf: '52998224725' } });
  const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja Msg' } as any });
  await prisma.storeAsaasAccount.create({
    data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(STORE_KEY), apiKeyLast4: 'MSG', environment: 'sandbox', status: 'valid' },
  });
  return { buyer, store };
}

beforeEach(() => {
  postAs.mockReset();
  putAs.mockReset();
});

afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const storeId = { in: stores.map((s) => s.id) };
  await prisma.storeAsaasCustomer.deleteMany({ where: { storeId } });
  await prisma.storeAsaasAccount.deleteMany({ where: { storeId } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

it('customer novo nasce com os avisos do Asaas desligados', async () => {
  const { buyer, store } = await setup();
  postAs.mockResolvedValue({ id: 'cus_novo' });

  expect(await ensureStoreCustomer(store.id, buyer.userId)).toBe('cus_novo');

  const [key, path, body] = postAs.mock.calls[0];
  expect([key, path]).toEqual([STORE_KEY, '/customers']);
  expect(body.notificationDisabled).toBe(true);
  const row = await prisma.storeAsaasCustomer.findFirstOrThrow({ where: { storeId: store.id } });
  expect(row.notificationsOff).toBe(true);
  expect(putAs).not.toHaveBeenCalled();
});

it('customer antigo tem os avisos desligados uma vez só, na próxima compra', async () => {
  const { buyer, store } = await setup();
  await prisma.storeAsaasCustomer.create({ data: { storeId: store.id, userId: buyer.userId, customerId: 'cus_antigo' } });
  putAs.mockResolvedValue({ id: 'cus_antigo' });

  expect(await ensureStoreCustomer(store.id, buyer.userId)).toBe('cus_antigo');
  expect(await ensureStoreCustomer(store.id, buyer.userId)).toBe('cus_antigo');

  expect(putAs).toHaveBeenCalledTimes(1);
  expect(putAs).toHaveBeenCalledWith(STORE_KEY, '/customers/cus_antigo', { notificationDisabled: true });
  expect(postAs).not.toHaveBeenCalled();
});

it('Asaas fora ao desligar os avisos não segura a venda e tenta de novo depois', async () => {
  const { buyer, store } = await setup();
  await prisma.storeAsaasCustomer.create({ data: { storeId: store.id, userId: buyer.userId, customerId: 'cus_antigo' } });
  putAs.mockRejectedValueOnce(new AsaasApiError(503, []));

  expect(await ensureStoreCustomer(store.id, buyer.userId)).toBe('cus_antigo');
  const row = await prisma.storeAsaasCustomer.findFirstOrThrow({ where: { storeId: store.id } });
  expect(row.notificationsOff).toBe(false);

  putAs.mockResolvedValueOnce({ id: 'cus_antigo' });
  await ensureStoreCustomer(store.id, buyer.userId);
  expect(putAs).toHaveBeenCalledTimes(2);
  expect((await prisma.storeAsaasCustomer.findFirstOrThrow({ where: { storeId: store.id } })).notificationsOff).toBe(true);
});
