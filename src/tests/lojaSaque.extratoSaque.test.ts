/**
 * Extrato e saque da conta de recebimento da loja (modo direto): extrato do Asaas traduzido,
 * disponível = saldo − fretes e estornos em aberto, saque só para o CPF/CNPJ do dono da conta,
 * com senha, um de cada vez, aprovado pela trava e concluído pelo webhook.
 */
jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return { __esModule: true, ...actual, default: { ...actual.default, getAs: jest.fn(), postAs: jest.fn() } };
});

import request from 'supertest';
import app from '../app';
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { decideStoreWithdrawal, reconcileStoreWithdrawalFromWebhook } from '../services/asaasLoja/storeWithdrawal';

const DOMAIN = '@lojasaque.test';
const KEY = '$aact_hmlg_SAQUE';
const OWNER_CPF = '52998224725';
const getAs = asaasClient.getAs as jest.Mock;
const postAs = asaasClient.postAs as jest.Mock;

let balance = 100;
const transactions: any[] = [];

beforeEach(() => {
  getAs.mockReset();
  postAs.mockReset();
  balance = 100;
  transactions.length = 0;
  getAs.mockImplementation(async (_k: string, path: string) => {
    if (path === '/finance/balance') return { balance };
    if (path.startsWith('/myAccount/commercialInfo')) return { cpfCnpj: '529.982.247-25' };
    if (path.startsWith('/financialTransactions')) return { data: transactions, hasMore: false };
    throw new Error(`rota inesperada ${path}`);
  });
});

afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const storeId = { in: stores.map((s) => s.id) };
  await prisma.storeWithdrawal.deleteMany({ where: { storeId } });
  await prisma.motoboyTransfer.deleteMany({ where: { storeId } });
  await prisma.directRefund.deleteMany({ where: { storeId } });
  await prisma.order.deleteMany({ where: { storeId } });
  await prisma.storeAsaasAccount.deleteMany({ where: { storeId } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function setup() {
  const owner = await createTestUser('lojista', DOMAIN);
  const other = await createTestUser('lojista', DOMAIN);
  const motoboy = await createTestUser('motoboy', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja Saque', isOpen: true } as any });
  await prisma.storeAsaasAccount.create({
    data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(KEY), apiKeyLast4: 'AQUE', environment: 'sandbox', status: 'valid' },
  });
  return { owner, other, motoboy, store };
}

const extrato = (storeId: string, who: TestUser, qs = '') =>
  request(app).get(`/api/stores/${storeId}/asaas/extrato${qs}`).set('Authorization', bearer(who));
const saque = (storeId: string, who: TestUser, body: any) =>
  request(app).post(`/api/stores/${storeId}/asaas/saque`).set('Authorization', bearer(who)).send(body);

let seq = 0;
const motoboyTransfer = (storeId: string, motoboyId: string, status: string, amount: number, extra: any = {}) =>
  prisma.motoboyTransfer.create({
    data: {
      deliveryId: `del-saque-${Date.now()}-${seq}`, orderId: `ord-saque-${seq++}`, storeId, motoboyId, amount, status,
      pixKeyEncrypted: encryptSensitiveData('12345678909'), pixKeyType: 'CPF', ...extra,
    },
  });

describe('extrato', () => {
  it('traduz o extrato do Asaas, mais recente primeiro, e mostra o disponível sem o dinheiro do motoboy', async () => {
    const s = await setup();
    const order = await prisma.order.create({
      data: { customerId: s.other.userId, storeId: s.store.id, totalValue: 15.23, subtotal: 10, deliveryFee: 5.23, asaasPaymentId: 'pay_1' } as any,
    });
    await motoboyTransfer(s.store.id, s.motoboy.userId, 'done', 5.23, { orderId: order.id, asaasTransferId: 'tra_m' });
    await motoboyTransfer(s.store.id, s.motoboy.userId, 'failed', 5.23);
    transactions.push(
      { id: 'ftn_000000000001', date: '2026-10-28', type: 'PAYMENT_RECEIVED', value: 15.23, balance: 15.23, paymentId: 'pay_1', description: 'Cobrança recebida - fatura nr. 948024344 Asafe Mota' },
      { id: 'ftn_000000000002', date: '2026-10-28', type: 'PAYMENT_FEE', value: -1.99, balance: 13.24, paymentId: 'pay_1', description: 'Taxa do Pix - fatura nr. 948024344 Asafe Mota' },
      { id: 'ftn_000000000003', date: '2026-10-28', type: 'TRANSFER', value: -5.23, balance: 8.01, transferId: 'tra_m', description: 'Transação via Pix com chave para Fulano' },
      { id: 'ftn_000000000004', date: '2026-10-28', type: 'TRANSFER', value: -5.25, balance: 2.76, transferId: 'tra_x', description: 'Transação via Pix com chave para Fulano' },
      { id: 'ftn_000000000005', date: '2026-10-28', type: 'PIX_TRANSACTION_DEBIT_REFUND', value: 5.25, balance: 8.01, transferId: 'tra_x', description: 'Estorno de transação via Pix' },
    );
    balance = 8.01;

    const r = await extrato(s.store.id, s.owner);
    expect(r.status).toBe(200);
    const d = r.body.data;
    const code = order.id.slice(-6).toUpperCase();
    expect(d.items.map((i: any) => i.label)).toEqual([
      'Pix devolvido', 'Pix enviado', `Frete ao motoboy · Pedido #${code}`, `Taxa do Pix da venda · Pedido #${code}`, `Venda · Pedido #${code}`,
    ]);
    expect(d.items[4]).toMatchObject({ orderId: order.id, value: 15.23, balance: 15.23 });
    expect(d).toMatchObject({ balance: 8.01, reserved: { motoboys: 5.23, refunds: 0, withdrawals: 0, total: 5.23 }, available: 2.78, withdrawTo: '***.***.***-25' });
    expect(JSON.stringify(d)).not.toMatch(/Asaas|fatura|52998224725/i);
    const qs = getAs.mock.calls.find((c) => String(c[1]).startsWith('/financialTransactions'))![1];
    expect(qs).toMatch(/limit=50/);
  });

  it('só o dono da loja vê o extrato', async () => {
    const s = await setup();
    expect((await extrato(s.store.id, s.other)).status).toBe(403);
  });
});

describe('saque', () => {
  it('vai para a chave no CPF do dono da conta, com o id do saque como referência', async () => {
    const s = await setup();
    postAs.mockResolvedValue({ id: 'tra_saque' });
    const r = await saque(s.store.id, s.owner, { amount: 50, password: 'Senha123!' });
    expect(r.status).toBe(200);
    const w = await prisma.storeWithdrawal.findFirstOrThrow({ where: { storeId: s.store.id } });
    expect(w).toMatchObject({ status: 'requested', asaasTransferId: 'tra_saque', pixKeyType: 'CPF' });
    expect(postAs).toHaveBeenCalledWith(KEY, '/transfers', expect.objectContaining({
      value: 50, operationType: 'PIX', pixAddressKey: OWNER_CPF, pixAddressKeyType: 'CPF', externalReference: w.id,
    }));
  });

  it('senha errada não saca', async () => {
    const s = await setup();
    const r = await saque(s.store.id, s.owner, { amount: 50, password: 'errada' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('WRONG_PASSWORD');
    expect(postAs).not.toHaveBeenCalled();
  });

  it('não saca o dinheiro do motoboy nem o estorno em aberto', async () => {
    const s = await setup();
    await motoboyTransfer(s.store.id, s.motoboy.userId, 'failed_final', 40);
    await prisma.directRefund.create({ data: { orderId: `ord-saque-dr-${seq++}`, storeId: s.store.id, asaasPaymentId: 'pay_x', amount: 30, status: 'pending', requestedBy: 'x' } });
    const r = await saque(s.store.id, s.owner, { amount: 31, password: 'Senha123!' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('OVER_AVAILABLE');
    expect(r.body.error.message).toContain('R$ 30,00');
    expect(postAs).not.toHaveBeenCalled();
  });

  it('reserva também o Pix ao motoboy a caminho e o frete das corridas em andamento', async () => {
    const s = await setup();
    await motoboyTransfer(s.store.id, s.motoboy.userId, 'requested', 30);
    const order = await prisma.order.create({
      data: { customerId: s.other.userId, storeId: s.store.id, totalValue: 60, subtotal: 50, deliveryFee: 10, status: 'aguardando_motoboy' } as any,
    });
    await prisma.delivery.create({ data: { orderId: order.id, status: 'assigned', motoboyId: s.motoboy.userId, fee: 10 } as any });
    const r = await saque(s.store.id, s.owner, { amount: 61, password: 'Senha123!' });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toContain('R$ 60,00');
    await prisma.delivery.deleteMany({ where: { orderId: order.id } });
  });

  it('saque em conferência segura o próximo (o Pix pode ter saído)', async () => {
    const s = await setup();
    await prisma.storeWithdrawal.create({
      data: { storeId: s.store.id, requestedBy: s.owner.userId, amount: 20, pixKeyEncrypted: encryptSensitiveData(OWNER_CPF), pixKeyType: 'CPF', status: 'uncertain', createdAt: new Date(Date.now() - 86_400_000) },
    });
    const r = await saque(s.store.id, s.owner, { amount: 10, password: 'Senha123!' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('WITHDRAWAL_IN_PROGRESS');
    expect(postAs).not.toHaveBeenCalled();
  });

  it('abaixo do mínimo é recusado', async () => {
    const s = await setup();
    const r = await saque(s.store.id, s.owner, { amount: 0.5, password: 'Senha123!' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('BELOW_MINIMUM');
  });

  it('um saque de cada vez: dois pedidos juntos, só um vai', async () => {
    const s = await setup();
    postAs.mockResolvedValue({ id: 'tra_1' });
    const rs = await Promise.all([
      saque(s.store.id, s.owner, { amount: 20, password: 'Senha123!' }),
      saque(s.store.id, s.owner, { amount: 20, password: 'Senha123!' }),
    ]);
    expect(rs.map((x) => x.status).sort()).toEqual([200, 409]);
    expect(postAs).toHaveBeenCalledTimes(1);
  });

  it('Asaas recusou: o saque fica como falha e a tela recebe a explicação', async () => {
    const s = await setup();
    postAs.mockRejectedValue(new AsaasApiError(403, [{ code: 'insufficient_permission', description: 'sem permissão' } as any]));
    const r = await saque(s.store.id, s.owner, { amount: 20, password: 'Senha123!' });
    expect(r.status).toBe(409);
    expect(r.body.error.message).toMatch(/permissão de Transferências/);
    expect((await prisma.storeWithdrawal.findFirstOrThrow({ where: { storeId: s.store.id } })).status).toBe('failed');
  });

  it('Asaas fora do ar: fica em conferência, nunca como falha (o Pix pode ter saído)', async () => {
    const s = await setup();
    postAs.mockRejectedValue(new AsaasApiError(503, []));
    const r = await saque(s.store.id, s.owner, { amount: 20, password: 'Senha123!' });
    expect(r.status).toBe(200);
    expect(r.body.data.uncertain).toBe(true);
    expect((await prisma.storeWithdrawal.findFirstOrThrow({ where: { storeId: s.store.id } })).status).toBe('uncertain');
  });
});

describe('trava de autorização e webhook', () => {
  async function requested(s: Awaited<ReturnType<typeof setup>>) {
    return prisma.storeWithdrawal.create({
      data: { storeId: s.store.id, requestedBy: s.owner.userId, amount: 20, pixKeyEncrypted: encryptSensitiveData(OWNER_CPF), pixKeyType: 'CPF' },
    });
  }

  it('aprova só o saque pedido, para a chave do dono, uma vez', async () => {
    const s = await setup();
    const w = await requested(s);
    const req = { transferId: w.id, asaasId: 'tra_a', valueCents: 2000, pixKey: '529.982.247-25' };
    expect(await decideStoreWithdrawal(s.store.id, req)).toMatchObject({ approved: true });
    expect(await decideStoreWithdrawal(s.store.id, req)).toMatchObject({ approved: true }); // retry do mesmo id
    expect(await decideStoreWithdrawal(s.store.id, { ...req, asaasId: 'tra_b' })).toMatchObject({ approved: false, reason: 'ALREADY_AUTHORIZED' });
  });

  it('recusa outra chave, outro valor ou outra loja; referência desconhecida não é saque', async () => {
    const s = await setup();
    const w = await requested(s);
    const req = { transferId: w.id, asaasId: 'tra_a', valueCents: 2000, pixKey: OWNER_CPF };
    expect(await decideStoreWithdrawal(s.store.id, { ...req, pixKey: '12345678909' })).toMatchObject({ approved: false, reason: 'PIX_KEY_MISMATCH' });
    expect(await decideStoreWithdrawal(s.store.id, { ...req, valueCents: 2001 })).toMatchObject({ approved: false, reason: 'AMOUNT_MISMATCH' });
    expect(await decideStoreWithdrawal('outra-loja', req)).toMatchObject({ approved: false, reason: 'STORE_MISMATCH' });
    expect(await decideStoreWithdrawal(s.store.id, { ...req, transferId: 'nao-existe' })).toBeNull();
  });

  it('chave com os mesmos números que não é o CPF (e-mail, aleatória) é recusada', async () => {
    const s = await setup();
    const w = await requested(s);
    const req = { transferId: w.id, asaasId: 'tra_a', valueCents: 2000 };
    expect(await decideStoreWithdrawal(s.store.id, { ...req, pixKey: `${OWNER_CPF}@golpe.com` })).toMatchObject({ approved: false, reason: 'PIX_KEY_MISMATCH' });
    expect(await decideStoreWithdrawal(s.store.id, { ...req, pixKey: `a${OWNER_CPF}` })).toMatchObject({ approved: false, reason: 'PIX_KEY_MISMATCH' });
  });

  it('saque pedido há mais de 30 min não é aprovado', async () => {
    const s = await setup();
    const w = await prisma.storeWithdrawal.create({
      data: { storeId: s.store.id, requestedBy: s.owner.userId, amount: 20, pixKeyEncrypted: encryptSensitiveData(OWNER_CPF), pixKeyType: 'CPF', createdAt: new Date(Date.now() - 31 * 60_000) },
    });
    expect(await decideStoreWithdrawal(s.store.id, { transferId: w.id, asaasId: 'tra_a', valueCents: 2000, pixKey: OWNER_CPF })).toMatchObject({ approved: false, reason: 'EXPIRED' });
  });

  it('Pix concluído no Asaas corrige um saque dado como falha', async () => {
    const s = await setup();
    const w = await prisma.storeWithdrawal.create({
      data: { storeId: s.store.id, requestedBy: s.owner.userId, amount: 20, pixKeyEncrypted: encryptSensitiveData(OWNER_CPF), pixKeyType: 'CPF', status: 'failed', asaasTransferId: 'tra_f' },
    });
    await reconcileStoreWithdrawalFromWebhook(s.store.id, 'TRANSFER_DONE', { id: 'tra_f', externalReference: w.id });
    expect((await prisma.storeWithdrawal.findUniqueOrThrow({ where: { id: w.id } })).status).toBe('done');
  });

  it('webhook conclui ou falha o saque; transferência de motoboy não é tratada aqui', async () => {
    const s = await setup();
    const ok = await requested(s);
    const bad = await requested(s);
    expect(await reconcileStoreWithdrawalFromWebhook(s.store.id, 'TRANSFER_DONE', { id: 'tra_ok', externalReference: ok.id })).toBe(true);
    expect(await reconcileStoreWithdrawalFromWebhook(s.store.id, 'TRANSFER_FAILED', { id: 'tra_bad', externalReference: bad.id })).toBe(true);
    expect((await prisma.storeWithdrawal.findUniqueOrThrow({ where: { id: ok.id } })).status).toBe('done');
    expect((await prisma.storeWithdrawal.findUniqueOrThrow({ where: { id: bad.id } })).status).toBe('failed');
    expect(await reconcileStoreWithdrawalFromWebhook(s.store.id, 'TRANSFER_DONE', { id: 'tra_m', externalReference: 'motoboy-x' })).toBe(false);
  });
});
