import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Mesmo harness de orderCardFlow.test.ts (Fase 1): mocka o relay Asaas — sem rede.
jest.mock('../services/asaas/payment', () => ({
  __esModule: true,
  ensureAsaasCustomer: jest.fn(async () => 'cus_test'),
  createPixCharge: jest.fn(async () => ({ paymentId: 'pay_pix_unused', status: 'PENDING' })),
  createCardCharge: jest.fn(),
}));

jest.mock('../services/asaas/orderPayment', () => ({
  __esModule: true,
  confirmOrderPaidByPayment: jest.fn(async () => {}),
  finalizeWalletPaidOrder: jest.fn(async () => {}),
}));

import app from '../app';
import { ownerIdForStore } from './helpers/storeOwner';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createWallet } from './helpers/financePg';
import { ensureAsaasCustomer, createCardCharge } from '../services/asaas/payment';
import { confirmOrderPaidByPayment } from '../services/asaas/orderPayment';
import { ensurePlatformConfig, updatePlatformConfig } from '../repositories/platformConfig.repository';
import { computeCardTotal } from '../utils/cardInstallments';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';
const DOMAIN = '@aoif.test'; // domínio próprio desta suíte (isolamento de paralelismo — ver storeOwner.ts)

// Taxas determinísticas p/ o gross-up — mesmos defaults do schema (Task 1).
const CARD_CFG = { cardFeePercent: 2.99, cardFeeFixed: 0.49, cardAnticipationMonthlyRate: 1.99 };

let restoreConfig: () => Promise<void>;

beforeAll(async () => {
  env.PAYMENT_GATEWAY = 'asaas';
  restoreConfig = await snapshotPlatformConfig();
  await ensurePlatformConfig('system');
  await updatePlatformConfig(
    { ...CARD_CFG, cardInstallmentMaxCount: 12, cardInstallmentMinValue: 5 },
    'system'
  );
}, 60000);

afterAll(async () => {
  env.PAYMENT_GATEWAY = 'none';
  await restoreConfig();
});

// Reafirma as taxas antes de cada teste — o caso de config inválida (abaixo) as
// sobrescreve de propósito, e não deve vazar para os testes seguintes.
beforeEach(async () => {
  await updatePlatformConfig(
    { ...CARD_CFG, cardInstallmentMaxCount: 12, cardInstallmentMinValue: 5 },
    'system'
  );
});

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
  (ensureAsaasCustomer as jest.Mock).mockClear();
  (createCardCharge as jest.Mock).mockReset();
  (confirmOrderPaidByPayment as jest.Mock).mockClear();
});

async function verifiedBuyer() {
  const user = await prisma.user.create({
    data: {
      name: 'Comprador Parcelado',
      email: `buyer-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`,
      passwordHash: await bcrypt.hash('Senha123!', 10),
      role: 'cliente',
      roles: ['cliente'],
      activeRole: 'cliente',
      cpf: '39053344705',
      verification: {
        email: { status: 'verified' },
        phone: { status: 'verified' },
        document: { status: 'approved', type: 'cpf', number: '39053344705' },
      },
    },
  });
  await createWallet({ owner: user.id, ownerType: 'user', balance: 0, totalIncome: 0, totalSpent: 0 });
  const token = jwt.sign({ id: user.id, role: 'cliente', activeRole: 'cliente', roles: ['cliente'] }, JWT_SECRET);
  return { user, token };
}

const CARD = {
  holderName: 'Fulano de Tal',
  number: '4111111111111111',
  expiryMonth: '12',
  expiryYear: '2030',
  ccv: '123',
};

const CARD_HOLDER = {
  name: 'Fulano de Tal',
  email: 'fulano@aoif.test',
  cpfCnpj: '12345678909',
  postalCode: '12345678',
  addressNumber: '100',
  phone: '11999999999',
};

async function makeStoreAndProduct(price = 100) {
  const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja Parcelado', isOpen: true } });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price, quantity: 10 } } as any);
  return { store, product };
}

function orderPayload(storeId: string, productId: string, extra: Record<string, any> = {}) {
  return {
    storeId,
    products: [{ productId, quantity: 1 }],
    paymentMethod: 'credit_card',
    deliveryDistanceKm: 0,
    address: 'Rua X, 1 - Centro',
    card: CARD,
    cardHolder: CARD_HOLDER,
    ...extra,
  };
}

describe('createOrder com cartão parcelado (Fase 2)', () => {
  it('3x aprovado: cobra o gross-up calculado no servidor e persiste Order.installmentCount', async () => {
    const { token } = await verifiedBuyer();
    const { store, product } = await makeStoreAndProduct(100);
    (createCardCharge as jest.Mock).mockResolvedValueOnce({ paymentId: 'pay_inst_1', status: 'CONFIRMED' });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderPayload(store.id, product.id, { installmentCount: 3 }));

    expect(res.status).toBe(201);
    expect(res.body.card).toEqual({ status: 'CONFIRMED', approved: true });

    // O total cobrado é SEMPRE recalculado no servidor — nunca aceito do cliente.
    const expected = computeCardTotal(100, 3, CARD_CFG);
    expect(createCardCharge).toHaveBeenCalledTimes(1);
    const callArg = (createCardCharge as jest.Mock).mock.calls[0][0];
    expect(callArg.installmentCount).toBe(3);
    expect(callArg.value).toBe(expected.total);
    expect(callArg.installmentValue).toBe(expected.installmentValue);

    const order = await prisma.order.findFirst({ where: { storeId: store.id } });
    expect(order?.installmentCount).toBe(3);
    // Distribuição/valor do pedido continuam sobre o BASE (à vista) — o gross-up do
    // cartão nunca vaza para o que a loja recebe.
    expect(order?.totalValue.toNumber()).toBe(100);
  });

  it('1x (padrão): comportamento idêntico à Fase 1 — cobra o base, sem installmentCount/installmentValue', async () => {
    const { token } = await verifiedBuyer();
    const { store, product } = await makeStoreAndProduct(100);
    (createCardCharge as jest.Mock).mockResolvedValueOnce({ paymentId: 'pay_inst_2', status: 'CONFIRMED' });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderPayload(store.id, product.id)); // sem installmentCount

    expect(res.status).toBe(201);
    const callArg = (createCardCharge as jest.Mock).mock.calls[0][0];
    expect(callArg.value).toBe(100);
    expect(callArg.installmentCount).toBe(1);
    expect(callArg.installmentValue).toBeUndefined();

    const order = await prisma.order.findFirst({ where: { storeId: store.id } });
    expect(order?.installmentCount).toBe(1);
  });

  it('config de parcelamento inválida (taxas somam ≥100%): compensa o pedido e responde 500 sem cobrar', async () => {
    const { token } = await verifiedBuyer();
    const { store, product } = await makeStoreAndProduct(100);
    // Taxas absurdas o bastante para o denominador de computeCardTotal ficar <= 0.
    await updatePlatformConfig({ cardFeePercent: 99, cardFeeFixed: 0.49, cardAnticipationMonthlyRate: 1.99 }, 'system');

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderPayload(store.id, product.id, { installmentCount: 3 }));

    expect(res.status).toBe(500);
    expect(createCardCharge).not.toHaveBeenCalled();

    // Compensação: pedido órfão apagado e estoque devolvido (mesmo padrão do cartão recusado).
    const orders = await prisma.order.findMany({ where: { storeId: store.id } });
    expect(orders.length).toBe(0);
    const refreshedProduct = await prisma.product.findUnique({ where: { id: product.id } });
    expect(refreshedProduct?.quantity).toBe(10);
  });
});
