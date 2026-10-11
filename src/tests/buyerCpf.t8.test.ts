/**
 * Task 8: CPF antes do Pix (custódia), `cpfStatus` em GET /user/me e customer Asaas
 * invalidado quando o CPF muda no perfil.
 *
 * Custódia + Pix:
 * - nenhum CPF (perfil vazio, sem documento do KYC, sem body) → 400 CPF_REQUIRED antes de
 *   baixar estoque;
 * - CPF no body: válido grava e segue; de outra conta → 409; inválido → 400 CPF_REQUIRED;
 * - CPF presente porém inválido no perfil segue o caminho atual (H3: 502 compensado);
 * - Pix 100% pago com saldo não exige CPF.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

jest.mock('../services/asaas/payment', () => ({
  __esModule: true,
  ...jest.requireActual('../services/asaas/payment'),
  ensureAsaasCustomer: jest.fn(async () => 'cus_t8'),
  createPixCharge: jest.fn(async () => ({ paymentId: 'pay_t8', status: 'PENDING', qrCodePayload: 'x' })),
}));
jest.mock('../services/asaas/orderPayment', () => ({
  __esModule: true,
  confirmOrderPaidByPayment: jest.fn(async () => {}),
  finalizeWalletPaidOrder: jest.fn(async () => {}),
}));

import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { ownerIdForStore } from './helpers/storeOwner';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createWallet } from './helpers/financePg';
import { ensureAsaasCustomer, createPixCharge } from '../services/asaas/payment';
import { ensurePlatformConfig, updatePlatformConfig } from '../repositories/platformConfig.repository';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';
const DOMAIN = '@buyercpf-t8.test';

/** CPF válido aleatório (dígitos verificadores calculados). */
function randomCpf(): string {
  for (;;) {
    const base = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10));
    if (base.every((d) => d === base[0])) continue;
    const dv = (arr: number[]) => {
      const sum = arr.reduce((s, d, i) => s + d * (arr.length + 1 - i), 0);
      const r = 11 - (sum % 11);
      return r >= 10 ? 0 : r;
    };
    const d1 = dv(base);
    const d2 = dv([...base, d1]);
    return [...base, d1, d2].join('');
  }
}

let restoreConfig: () => Promise<void>;
let gatewayOriginal: any;

beforeAll(async () => {
  gatewayOriginal = env.PAYMENT_GATEWAY;
  env.PAYMENT_GATEWAY = 'asaas';
  restoreConfig = await snapshotPlatformConfig();
  await ensurePlatformConfig('system');
  await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'system');
}, 60000);

afterAll(async () => {
  env.PAYMENT_GATEWAY = gatewayOriginal;
  await restoreConfig();
});

afterEach(async () => {
  const users = await prisma.user.findMany({ where: { email: { endsWith: DOMAIN } }, select: { id: true } });
  await prisma.storeAsaasCustomer.deleteMany({ where: { userId: { in: users.map((u) => u.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
  (ensureAsaasCustomer as jest.Mock).mockClear();
  (createPixCharge as jest.Mock).mockClear();
});

// Documento 'approved' (o gate KYC_ENFORCED do createOrder exige) — com ou sem número.
async function buyer(data: { cpf?: string | null; docNumber?: string; docStatus?: string; docType?: string; asaas?: any; balance?: number } = {}) {
  const user = await prisma.user.create({
    data: {
      name: 'Comprador T8',
      email: `buyer-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`,
      passwordHash: await bcrypt.hash('Senha123!', 10),
      role: 'cliente', roles: ['cliente'], activeRole: 'cliente',
      cpf: data.cpf ?? null,
      asaas: data.asaas ?? undefined,
      verification: {
        email: { status: 'verified' },
        phone: { status: 'verified' },
        document: { status: data.docStatus ?? 'approved', type: data.docType ?? 'cpf', ...(data.docNumber ? { number: data.docNumber } : {}) },
      },
    },
  });
  await createWallet({ owner: user.id, ownerType: 'user', balance: data.balance ?? 0, totalIncome: 0, totalSpent: 0 });
  const token = jwt.sign({ id: user.id, role: 'cliente', activeRole: 'cliente', roles: ['cliente'] }, JWT_SECRET);
  return { user, token };
}

async function lojaEProduto() {
  const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja T8', isOpen: true } });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 100, quantity: 10 } } as any);
  return { store, product };
}

function pixPayload(storeId: string, productId: string, extra: Record<string, unknown> = {}) {
  return {
    storeId,
    products: [{ productId, quantity: 1 }],
    paymentMethod: 'pix',
    deliveryDistanceKm: 0,
    address: 'Rua X, 1 - Centro',
    ...extra,
  };
}

const stockOf = async (id: string) => (await prisma.product.findUnique({ where: { id } }))?.quantity;

describe('T8: custódia + Pix exige CPF antes de baixar estoque', () => {
  it('sem nenhum CPF → 400 CPF_REQUIRED, estoque intacto, nenhum pedido', async () => {
    const { token } = await buyer();
    const { store, product } = await lojaEProduto();
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send(pixPayload(store.id, product.id));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CPF_REQUIRED');
    expect(await stockOf(product.id)).toBe(10);
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect(ensureAsaasCustomer).not.toHaveBeenCalled();
  });

  it('CPF válido no body → grava no perfil, segue e cobra com esse CPF', async () => {
    const { user, token } = await buyer();
    const { store, product } = await lojaEProduto();
    const cpf = randomCpf();
    const masked = `${cpf.slice(0, 3)}.${cpf.slice(3, 6)}.${cpf.slice(6, 9)}-${cpf.slice(9)}`;
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send(pixPayload(store.id, product.id, { cpf: masked }));
    expect(res.status).toBe(201);
    expect(res.body.pix?.paymentId).toBe('pay_t8');
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.cpf).toBe(cpf);
    expect(ensureAsaasCustomer).toHaveBeenCalledWith(user.id, cpf);
    expect(await stockOf(product.id)).toBe(9);
  });

  it('CPF do body já usado por outra conta → 409, estoque intacto, nada gravado', async () => {
    const cpf = randomCpf();
    await buyer({ cpf });
    const { user, token } = await buyer();
    const { store, product } = await lojaEProduto();
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send(pixPayload(store.id, product.id, { cpf }));
    expect(res.status).toBe(409);
    expect(res.body.code).toBe('CPF_IN_USE');
    expect(await stockOf(product.id)).toBe(10);
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect((await prisma.user.findUnique({ where: { id: user.id } }))?.cpf).toBeNull();
  });

  it('CPF inválido no body → 400 CPF_REQUIRED, estoque intacto', async () => {
    const { token } = await buyer();
    const { store, product } = await lojaEProduto();
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send(pixPayload(store.id, product.id, { cpf: '12345678900' }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CPF_REQUIRED');
    expect(await stockOf(product.id)).toBe(10);
  });

  it('perfil vazio + documento do KYC válido → segue e cobra com o documento do KYC', async () => {
    const doc = randomCpf();
    const { user, token } = await buyer({ docNumber: doc });
    const { store, product } = await lojaEProduto();
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send(pixPayload(store.id, product.id));
    expect(res.status).toBe(201);
    expect(ensureAsaasCustomer).toHaveBeenCalledWith(user.id, doc);
  });

  it('perfil com CPF inválido + CPF válido no body → cobra com o CPF do body', async () => {
    const { user, token } = await buyer({ cpf: '11111111111' });
    const { store, product } = await lojaEProduto();
    const cpf = randomCpf();
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send(pixPayload(store.id, product.id, { cpf }));
    expect(res.status).toBe(201);
    expect(ensureAsaasCustomer).toHaveBeenCalledWith(user.id, cpf);
  });

  it('KYC feito com RG e sem User.cpf → 400 CPF_REQUIRED, estoque intacto (RG não é CPF)', async () => {
    const { token } = await buyer({ docType: 'rg', docNumber: '123456789' });
    const { store, product } = await lojaEProduto();
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send(pixPayload(store.id, product.id));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CPF_REQUIRED');
    expect(await stockOf(product.id)).toBe(10);
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
  });

  it('useWalletBalance com saldo zero e sem CPF → 400 CPF_REQUIRED, estoque intacto', async () => {
    const { token } = await buyer({ balance: 0 });
    const { store, product } = await lojaEProduto();
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send(pixPayload(store.id, product.id, { useWalletBalance: true }));
    expect(res.status).toBe(400);
    expect(res.body.code).toBe('CPF_REQUIRED');
    expect(await stockOf(product.id)).toBe(10);
  });

  it('Pix 100% pago com saldo da carteira → não exige CPF', async () => {
    const { token } = await buyer({ balance: 500 });
    const { store, product } = await lojaEProduto();
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send(pixPayload(store.id, product.id, { useWalletBalance: true }));
    expect(res.status).toBe(201);
    expect(ensureAsaasCustomer).not.toHaveBeenCalled();
    expect(createPixCharge).not.toHaveBeenCalled();
  });
});

describe('T8: GET /user/me expõe cpfStatus', () => {
  it('missing / invalid / valid', async () => {
    const vazio = await buyer();
    const ruim = await buyer({ cpf: '11111111111' });
    const bom = await buyer({ cpf: randomCpf() });
    const kyc = await buyer({ docNumber: randomCpf() });
    const rg = await buyer({ docType: 'rg', docNumber: '123456789' });
    const get = (t: string) => request(app).get('/api/user/me').set('Authorization', `Bearer ${t}`);
    expect((await get(vazio.token)).body.cpfStatus).toBe('missing');
    expect((await get(ruim.token)).body.cpfStatus).toBe('invalid');
    expect((await get(bom.token)).body.cpfStatus).toBe('valid');
    expect((await get(kyc.token)).body.cpfStatus).toBe('valid');
    expect((await get(rg.token)).body.cpfStatus).toBe('missing');
  });
});

describe('T8: trocar o CPF no perfil invalida os customers Asaas', () => {
  it('limpa User.asaas.customerId (preserva o resto) e apaga StoreAsaasCustomer', async () => {
    const { user, token } = await buyer({ cpf: randomCpf(), docStatus: 'pending', asaas: { customerId: 'cus_old', status: 'approved', walletId: 'wal_1' } });
    const { store } = await lojaEProduto();
    await prisma.storeAsaasCustomer.create({ data: { storeId: store.id, userId: user.id, customerId: 'cus_loja_old' } });

    const novo = randomCpf();
    const res = await request(app).patch('/api/user/me').set('Authorization', `Bearer ${token}`).send({ cpf: novo });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe('Dados atualizados');

    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect(after?.cpf).toBe(novo);
    expect((after?.asaas as any)?.customerId).toBeUndefined();
    expect(after?.asaas).toMatchObject({ status: 'approved', walletId: 'wal_1' });
    expect(await prisma.storeAsaasCustomer.count({ where: { userId: user.id } })).toBe(0);
  });

  it('salvar o perfil sem trocar o CPF não mexe nos customers', async () => {
    const cpf = randomCpf();
    const { user, token } = await buyer({ cpf, docStatus: 'pending', asaas: { customerId: 'cus_keep' } });
    const { store } = await lojaEProduto();
    await prisma.storeAsaasCustomer.create({ data: { storeId: store.id, userId: user.id, customerId: 'cus_loja_keep' } });

    const res = await request(app).patch('/api/user/me').set('Authorization', `Bearer ${token}`).send({ cpf, name: 'Outro Nome' });
    expect(res.status).toBe(200);
    const after = await prisma.user.findUnique({ where: { id: user.id } });
    expect((after?.asaas as any)?.customerId).toBe('cus_keep');
    expect(await prisma.storeAsaasCustomer.count({ where: { userId: user.id } })).toBe(1);
  });
});
