import request from 'supertest';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';

// Mock do serviço de pagamento Asaas — sem rede. `createCardCharge` é controlado
// por teste (mockResolvedValueOnce/mockRejectedValueOnce).
jest.mock('../services/asaas/payment', () => ({
  __esModule: true,
  ensureAsaasCustomer: jest.fn(async () => 'cus_test'),
  createPixCharge: jest.fn(async () => ({ paymentId: 'pay_pix_unused', status: 'PENDING' })),
  createCardCharge: jest.fn(),
}));

// Mock da confirmação de pagamento — não exercitamos aqui a lógica de Payout/custódia
// (já coberta em asaasOrderPayment.test.ts), só verificamos SE/COMO é chamada.
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
import { createWallet, findWallet } from './helpers/financePg';
import { ensureAsaasCustomer, createCardCharge } from '../services/asaas/payment';
import { confirmOrderPaidByPayment } from '../services/asaas/orderPayment';
import { ensurePlatformConfig, updatePlatformConfig } from '../repositories/platformConfig.repository';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';
const DOMAIN = '@aocf.test'; // domínio próprio desta suíte (isolamento de paralelismo — ver storeOwner.ts)

let restoreConfig: () => Promise<void>;

beforeAll(async () => {
  env.PAYMENT_GATEWAY = 'asaas';
  // Fase 2: o gross-up agora roda até em 1x, então todo pedido de cartão depende de
  // uma PlatformConfig existente. Semeia com os defaults do schema (Task 1).
  restoreConfig = await snapshotPlatformConfig();
  await ensurePlatformConfig('system');
  await updatePlatformConfig(
    { cardFeePercent: 2.99, cardFeeFixed: 0.49, cardAnticipationMonthlyRate: 1.99, cardInstallmentMaxCount: 12, cardInstallmentMinValue: 5 },
    'system'
  );
}, 60000);

afterAll(async () => {
  env.PAYMENT_GATEWAY = 'none';
  await restoreConfig();
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
      name: 'Comprador Cartão',
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
  email: 'fulano@aocf.test',
  cpfCnpj: '12345678909',
  postalCode: '12345678',
  addressNumber: '100',
  phone: '11999999999',
};

async function makeStoreAndProduct(price = 100) {
  const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja Cartão', isOpen: true } });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price, quantity: 10 } } as any);
  return { store, product };
}

function orderPayload(storeId: string, productId: string) {
  return {
    storeId,
    products: [{ productId, quantity: 1 }],
    paymentMethod: 'credit_card',
    deliveryDistanceKm: 0,
    address: 'Rua X, 1 - Centro',
    card: CARD,
    cardHolder: CARD_HOLDER,
  };
}

describe('createOrder com cartão de crédito (Fase 1)', () => {
  it('aprovado (CONFIRMED): confirma o pedido e devolve card.approved=true', async () => {
    const { token } = await verifiedBuyer();
    const { store, product } = await makeStoreAndProduct(100);
    (createCardCharge as jest.Mock).mockResolvedValueOnce({ paymentId: 'pay_card_1', status: 'CONFIRMED' });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderPayload(store.id, product.id));

    expect(res.status).toBe(201);
    expect(res.body.card).toEqual({ status: 'CONFIRMED', approved: true });
    expect(res.body.order?.asaasPaymentId).toBe('pay_card_1');
    expect(confirmOrderPaidByPayment).toHaveBeenCalledTimes(1);
    expect(confirmOrderPaidByPayment).toHaveBeenCalledWith('pay_card_1', 'CONFIRMED');
  });

  it('recusado: createCardCharge lança erro → compensa (devolve estoque, apaga o pedido) e responde 402', async () => {
    const { token } = await verifiedBuyer();
    const { store, product } = await makeStoreAndProduct(100);
    (createCardCharge as jest.Mock).mockRejectedValueOnce(new Error('cartão recusado'));

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderPayload(store.id, product.id));

    expect(res.status).toBe(402);
    expect(confirmOrderPaidByPayment).not.toHaveBeenCalled();

    // Compensação: pedido órfão foi apagado.
    const orders = await prisma.order.findMany({ where: { storeId: store.id } });
    expect(orders.length).toBe(0);

    // Compensação: estoque devolvido.
    const refreshedProduct = await prisma.product.findUnique({ where: { id: product.id } });
    expect(refreshedProduct?.quantity).toBe(10);
  });

  it('pendente: createCardCharge → PENDING → NÃO confirma o pedido, responde 201 com card.approved=false', async () => {
    const { token } = await verifiedBuyer();
    const { store, product } = await makeStoreAndProduct(100);
    (createCardCharge as jest.Mock).mockResolvedValueOnce({ paymentId: 'pay_card_3', status: 'PENDING' });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${token}`)
      .send(orderPayload(store.id, product.id));

    expect(res.status).toBe(201);
    expect(res.body.card).toEqual({ status: 'PENDING', approved: false });
    expect(res.body.order?.asaasPaymentId).toBe('pay_card_3');
    expect(confirmOrderPaidByPayment).not.toHaveBeenCalled();
  });
});
