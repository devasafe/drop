/**
 * H3 — cartão (custódia) com CPF inválido: `ensureAsaasCustomer` lançava fora de try →
 * caía no catch externo (500 "Erro interno") SEM compensar: pedido órfão + estoque baixado.
 * Agora segue o ramo PIX: compensa (apaga o pedido, devolve o estoque) e responde 502 com
 * a mensagem do CPF em `detail`.
 */
import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// ensureAsaasCustomer é o REAL (valida o CPF antes de qualquer rede); as cobranças são mocks.
jest.mock('../services/asaas/payment', () => ({
  __esModule: true,
  ...jest.requireActual('../services/asaas/payment'),
  createPixCharge: jest.fn(),
  createCardCharge: jest.fn(),
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
import { createCardCharge, createPixCharge } from '../services/asaas/payment';
import { ensurePlatformConfig, updatePlatformConfig } from '../repositories/platformConfig.repository';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';
const DOMAIN = '@hotfixh3.test';
const CPF_MSG = /CPF é inválido/;

let restoreConfig: () => Promise<void>;
let gatewayOriginal: any;

beforeAll(async () => {
  gatewayOriginal = env.PAYMENT_GATEWAY;
  env.PAYMENT_GATEWAY = 'asaas';
  restoreConfig = await snapshotPlatformConfig();
  await ensurePlatformConfig('system');
  await updatePlatformConfig(
    { settlementMode: 'custodia', cardFeePercent: 2.99, cardFeeFixed: 0.49, cardAnticipationMonthlyRate: 1.99, cardInstallmentMaxCount: 12, cardInstallmentMinValue: 5 } as any,
    'system'
  );
}, 60000);

afterAll(async () => {
  env.PAYMENT_GATEWAY = gatewayOriginal;
  await restoreConfig();
});

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
  (createCardCharge as jest.Mock).mockReset();
  (createPixCharge as jest.Mock).mockReset();
});

async function buyerCpfInvalido() {
  const user = await prisma.user.create({
    data: {
      name: 'Comprador CPF ruim',
      email: `buyer-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`,
      passwordHash: await bcrypt.hash('Senha123!', 10),
      role: 'cliente', roles: ['cliente'], activeRole: 'cliente',
      cpf: '11111111111', // dígitos repetidos: CPF inválido
      verification: {
        email: { status: 'verified' },
        phone: { status: 'verified' },
        document: { status: 'approved', type: 'cpf', number: '11111111111' },
      },
    },
  });
  await createWallet({ owner: user.id, ownerType: 'user', balance: 0, totalIncome: 0, totalSpent: 0 });
  const token = jwt.sign({ id: user.id, role: 'cliente', activeRole: 'cliente', roles: ['cliente'] }, JWT_SECRET);
  return { user, token };
}

async function lojaEProduto() {
  const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja h3', isOpen: true } });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 100, quantity: 10 } } as any);
  return { store, product };
}

function payload(storeId: string, productId: string, paymentMethod: 'credit_card' | 'pix') {
  return {
    storeId,
    products: [{ productId, quantity: 1 }],
    paymentMethod,
    deliveryDistanceKm: 0,
    address: 'Rua X, 1 - Centro',
    ...(paymentMethod === 'credit_card' ? {
      card: { holderName: 'Fulano de Tal', number: '4111111111111111', expiryMonth: '12', expiryYear: '2030', ccv: '123' },
      cardHolder: { name: 'Fulano de Tal', email: 'fulano@hotfixh3.test', cpfCnpj: '12345678909', postalCode: '12345678', addressNumber: '100', phone: '11999999999' },
    } : {}),
  };
}

describe('H3 — CPF inválido no checkout (custódia)', () => {
  it('PIX (referência): 502 com a mensagem do CPF, pedido desfeito e estoque de volta', async () => {
    const { token } = await buyerCpfInvalido();
    const { store, product } = await lojaEProduto();
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send(payload(store.id, product.id, 'pix'));
    expect(res.status).toBe(502);
    expect(res.body.detail).toMatch(CPF_MSG);
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: product.id } }))?.quantity).toBe(10);
  });

  it('cartão: 502 com a mensagem do CPF, pedido desfeito, estoque de volta e nada cobrado', async () => {
    const { token } = await buyerCpfInvalido();
    const { store, product } = await lojaEProduto();
    const res = await request(app).post('/api/orders').set('Authorization', `Bearer ${token}`).send(payload(store.id, product.id, 'credit_card'));
    expect(res.status).toBe(502);
    expect(res.body.detail).toMatch(CPF_MSG);
    expect(res.body.error).toBeTruthy();
    expect(createCardCharge).not.toHaveBeenCalled();
    expect(await prisma.order.count({ where: { storeId: store.id } })).toBe(0);
    expect((await prisma.product.findUnique({ where: { id: product.id } }))?.quantity).toBe(10);
  });
});
