import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

// Mock do estorno Asaas — os casos de gateway asseram o VALUE passado (fix #1: exclui walletApplied).
jest.mock('../services/asaas/refund', () => ({
  __esModule: true,
  refundOrderCharge: jest.fn(async () => {}),
}));

import app from '../app';
import env from '../config/env';
import { ownerIdForStore, productIdForItem } from './helpers/storeOwner';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain, wipeAppCashbox, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createWallet, findWallet, createAppCashbox, findAppCashbox, findPayout } from './helpers/financePg';
import { refundOrderCharge } from '../services/asaas/refund';

const refundMock = refundOrderCharge as jest.Mock;
const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';

// PlatformConfig é um singleton compartilhado no Postgres de dev. Fixamos as taxas
// relevantes em valores conhecidos e restauramos ao final (padrão da Task 3), para não
// depender de valores que outra suíte possa ter deixado e não vazar os nossos.
let restorePlatformConfig: () => Promise<void>;

beforeAll(async () => {
  restorePlatformConfig = await snapshotPlatformConfig();
  const existing = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
  const data = { cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, lateCancellationMotoboyShare: 50, updatedBy: 'cancelFlows.test' };
  if (existing) {
    await prisma.platformConfig.update({ where: { id: existing.id }, data });
  } else {
    await prisma.platformConfig.create({ data });
  }
});

afterAll(async () => {
  await restorePlatformConfig();
});

afterEach(async () => {
  await cleanupUsersByEmailDomain('@cancel.test');
  await wipeAppCashbox();
  refundMock.mockClear();
});

async function createUser(role: string) {
  const passwordHash = await bcrypt.hash('Senha123!', 10);
  const roles = role !== 'cliente' ? [role, 'cliente'] : ['cliente'];
  const user = await prisma.user.create({
    data: {
      name: `${role} test`,
      email: `${role}-${Date.now()}-${Math.random().toString(36).slice(2)}@cancel.test`,
      passwordHash,
      role: role as Role,
      roles: roles as Role[],
      activeRole: role as Role,
    },
  });
  const token = jwt.sign({ id: user.id, role, activeRole: role, roles }, JWT_SECRET, { expiresIn: '7d' });
  return { user, token, id: user.id };
}

// ============================================================
// Task 5: cliente cancela usando calculateCancellationFee
// - taxa só APÓS o aceite da loja (acceptedAt != null) — fix #2
// - refund DESCONTADO (parcial): cliente recebe orderTotal - totalFee
// - parte do motoboy vira Payout de compensação released (motoboyShare)
// - AppCashbox lança a taxa cheia (lastro) → líquido da plataforma = appShare
// ============================================================
describe('cliente cancela pós-pickup — divide a taxa com o motoboy (fluxo legado)', () => {
  it('refund descontado + Payout de compensação do MTB + AppCashbox reflete appShare', async () => {
    const motoboy = await createUser('motoboy');
    const customer = await createUser('cliente');

    // Carteira do cliente com saldo — o refund (parcial) cai aqui no fluxo legado.
    await createWallet({ owner: customer.id, ownerType: 'user', balance: 1000, totalIncome: 1000, totalSpent: 0 });
    // Carteira do motoboy (mirror; a fonte da verdade é o Payout).
    await createWallet({ owner: motoboy.id, ownerType: 'motoboy', balance: 0, totalIncome: 0, totalSpent: 0, availableBalance: 0, pendingBalance: 0 });
    // Caixa do app zerado.
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Cancel' } });

    // Pedido pago, ACEITO pela loja (acceptedAt), em trânsito ('enviado'), com motoboy atribuído.
    const order = await prisma.order.create({ data: {
      customerId: customer.id,
      storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 200), quantity: 1, price: 200 }] },
      totalValue: 200,
      deliveryFee: 0,
      status: 'enviado',
      paymentMethod: 'pix',
      paymentStatus: 'paid',
      acceptedAt: new Date(),
    }, include: { items: true } });

    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, motoboyId: motoboy.id, fee: 0, status: 'picked' },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Mudei de ideia' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelado');

    // Config: 10% de 200 = R$20 de taxa; 50% (R$10) motoboy, 50% (R$10) app.
    // fee.refundToCustomer = 200 - 20 = 180.

    // PROVA 1: refund DESCONTADO — o cliente recebe orderTotal - totalFee (não 100%).
    expect(res.body.refundAmount).toBeCloseTo(180, 2);
    expect(res.body.refundStatus).toBe('processed');

    // PROVA 1 (fluxo legado): a carteira do cliente foi creditada só com o refund parcial.
    const custWallet = await findWallet({ owner: customer.id, ownerType: 'user' });
    expect(custWallet!.balance).toBeCloseTo(1180, 2); // 1000 + 180 (nunca 1000 + 200)

    // PROVA 2: compensação do motoboy = motoboyShare, como Payout 'released' (sacável).
    const compPayout = await findPayout({ recipientType: 'motoboy', recipientId: motoboy.id, status: 'released' });
    expect(compPayout).not.toBeNull();
    expect(compPayout!.amount).toBeCloseTo(10, 2);

    // PROVA 3: AppCashbox recebe a taxa INTEIRA (R$20) como lastro do payout, e o líquido
    // da plataforma (income - payout do motoboy) é appShare (R$10).
    const cashbox = await findAppCashbox();
    const feeEntry = cashbox!.history.find((h: any) => h.source === 'cancelled_order');
    expect(feeEntry).toBeTruthy();
    expect(feeEntry!.amount).toBeCloseTo(20, 2);
    expect(feeEntry!.amount - compPayout!.amount).toBeCloseTo(10, 2); // = appShare (líquido)

    // Reconciliação por Payout: a compensação aparece como saldo disponível do motoboy.
    const walletRes = await request(app)
      .get(`/api/wallets/motoboy/${motoboy.id}`)
      .set('Authorization', `Bearer ${motoboy.token}`);
    expect(walletRes.status).toBe(200);
    expect(walletRes.body.availableBalance).toBeCloseTo(10, 2);
  });
});

// ============================================================
// Fix #2: taxa do cliente só vale APÓS o aceite da loja.
// Pedido pago mas NÃO aceito (acceptedAt=null) → refund 100%, sem taxa/compensação.
// ============================================================
describe('cliente cancela pedido pago NÃO aceito pela loja (fluxo legado)', () => {
  it('reembolsa 100% sem cobrar taxa nem compensar motoboy', async () => {
    const customer = await createUser('cliente');
    await createWallet({ owner: customer.id, ownerType: 'user', balance: 500, totalIncome: 500, totalSpent: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Sem Aceite' } });

    // Pedido pago, porém a loja ainda NÃO aceitou (acceptedAt=null).
    const order = await prisma.order.create({ data: {
      customerId: customer.id,
      storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 150), quantity: 1, price: 150 }] },
      totalValue: 150,
      deliveryFee: 0,
      status: 'pago',
      paymentMethod: 'pix',
      paymentStatus: 'paid',
      // acceptedAt: intencionalmente ausente
    }, include: { items: true } });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Desisti antes da loja aceitar' });

    expect(res.status).toBe(200);
    // Refund CHEIO (não descontado) e sem taxa registrada.
    expect(res.body.refundAmount).toBeCloseTo(150, 2);
    expect(res.body.lateCancellationFee).toBeUndefined();

    // Carteira do cliente recebe o total integral.
    const custWallet = await findWallet({ owner: customer.id, ownerType: 'user' });
    expect(custWallet!.balance).toBeCloseTo(650, 2); // 500 + 150

    // Nenhuma entrada de taxa no AppCashbox.
    const cashbox = await findAppCashbox();
    const feeEntry = cashbox!.history.find((h: any) => h.source === 'cancelled_order');
    expect(feeEntry).toBeFalsy();
  });
});

// ============================================================
// Fix #1 + #3: caminho Asaas (produção). refundOrderCharge é mockado e asseramos
// o VALUE do estorno — que deve EXCLUIR o walletApplied (para não devolvê-lo em dobro).
// ============================================================
describe('cliente cancela — estorno REAL no Asaas (fix #1: value exclui walletApplied)', () => {
  beforeAll(() => { env.PAYMENT_GATEWAY = 'asaas'; });
  afterAll(() => { env.PAYMENT_GATEWAY = 'none'; });

  it('sem walletApplied: estorna refundToCustomer (total - taxa) no Asaas', async () => {
    const customer = await createUser('cliente');
    await createWallet({ owner: customer.id, ownerType: 'user', balance: 0, totalIncome: 0, totalSpent: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Asaas A' } });

    // Pago via PIX, aceito, sem saldo de carteira aplicado. total=200 → taxa 20 → estorna 180.
    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 200), quantity: 1, price: 200 }] },
      totalValue: 200, deliveryFee: 0, status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid',
      asaasPaymentId: 'pay_cancel_a', asaasChargeStatus: 'received', acceptedAt: new Date(),
    }, include: { items: true } });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Desisti' });

    expect(res.status).toBe(200);
    expect(res.body.refundStatus).toBe('processed');
    // Estorno PIX = refundToCustomer (180), pois não houve walletApplied.
    expect(refundMock).toHaveBeenCalledWith('pay_cancel_a', 180);

    // Estorno é REAL — a carteira virtual NÃO é creditada com o refund.
    const custWallet = await findWallet({ owner: customer.id, ownerType: 'user' });
    expect(custWallet!.balance).toBeCloseTo(0, 2);

    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.paymentStatus).toBe('refunded');
  });

  it('com walletApplied>0: o estorno PIX EXCLUI o walletApplied (não devolve em dobro)', async () => {
    const customer = await createUser('cliente');
    await createWallet({ owner: customer.id, ownerType: 'user', balance: 0, totalIncome: 0, totalSpent: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Asaas B' } });

    // total=200, taxa 20 → refundToCustomer=180. walletApplied=50 (cobrança PIX foi 150).
    // walletApplied volta pela carteira; estorno PIX = 180 - 50 = 130. Retido do PIX = 150-130 = 20 = taxa.
    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 200), quantity: 1, price: 200 }] },
      totalValue: 200, deliveryFee: 0, status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid',
      asaasPaymentId: 'pay_cancel_b', asaasChargeStatus: 'received', acceptedAt: new Date(),
      walletApplied: 50,
    }, include: { items: true } });

    const res = await request(app)
      .post(`/api/orders/${order.id}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'Desisti' });

    expect(res.status).toBe(200);
    expect(res.body.refundStatus).toBe('processed');
    // PROVA fix #1: estorno = refundToCustomer - walletApplied = 130 (não 180).
    expect(refundMock).toHaveBeenCalledWith('pay_cancel_b', 130);

    // O walletApplied (50) voltou UMA vez pela carteira virtual.
    const custWallet = await findWallet({ owner: customer.id, ownerType: 'user' });
    expect(custWallet!.balance).toBeCloseTo(50, 2);
  });
});

// ============================================================
// Task 6: LOJA — separar rejeitar (antes do aceite, sem taxa) de
// cancelar-após-aceitar (taxa da ENTREGA) e bloquear pós-pickup (spec §3.2).
// Fluxo legado (PAYMENT_GATEWAY != asaas): refund 100% ao cliente sempre.
// ============================================================
describe('loja rejeita ANTES de aceitar (acceptedAt=null) — refund 100%, sem taxa', () => {
  it('reembolsa o cliente integralmente e NÃO cobra taxa da loja', async () => {
    const owner = await createUser('lojista');
    const customer = await createUser('cliente');

    await createWallet({ owner: customer.id, ownerType: 'user', balance: 500, totalIncome: 500, totalSpent: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: owner.id, name: 'Loja Rejeita' } });

    // Pedido pago mas ainda NÃO aceito pela loja (acceptedAt=null) → rejeição pura.
    const order = await prisma.order.create({ data: {
      customerId: customer.id,
      storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 150), quantity: 1, price: 150 }] },
      totalValue: 150,
      deliveryFee: 20,
      status: 'pago',
      paymentMethod: 'pix',
      paymentStatus: 'paid',
      // acceptedAt: intencionalmente ausente
    }, include: { items: true } });

    const res = await request(app)
      .post(`/api/orders/${order.id}/reject`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ reason: 'Sem estoque' });

    expect(res.status).toBe(200);
    // Refund CHEIO (loja é a culpada; cliente recebe tudo) e SEM taxa.
    expect(res.body.refundAmount).toBeCloseTo(150, 2);
    expect(res.body.lateCancellationFee).toBeUndefined();

    // Carteira do cliente recebe o total integral.
    const custWallet = await findWallet({ owner: customer.id, ownerType: 'user' });
    expect(custWallet!.balance).toBeCloseTo(650, 2); // 500 + 150

    // Nenhuma entrada de taxa da loja no AppCashbox.
    const cashbox = await findAppCashbox();
    const feeEntry = cashbox!.history.find((h: any) => h.source === 'cancelled_order');
    expect(feeEntry).toBeFalsy();
  });
});

describe('loja cancela APÓS aceitar, MTB atribuído mas não pegou — taxa da entrega', () => {
  it('debita taxa da loja (base=entrega), refund 100%, compensa MTB e caixa reflete appShare', async () => {
    const owner = await createUser('lojista');
    const motoboy = await createUser('motoboy');
    const customer = await createUser('cliente');

    const store = await prisma.store.create({ data: { ownerId: owner.id, name: 'Loja Cancela Aceita' } });

    await createWallet({ owner: customer.id, ownerType: 'user', balance: 1000, totalIncome: 1000, totalSpent: 0 });
    // Carteira da loja com saldo — a taxa (base=entrega) é debitada daqui (não-COD).
    await createWallet({ owner: store.id, ownerType: 'store', balance: 500, totalIncome: 500, totalSpent: 0 });
    await createWallet({ owner: motoboy.id, ownerType: 'motoboy', balance: 0, totalIncome: 0, totalSpent: 0, availableBalance: 0, pendingBalance: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    // Pedido pago, ACEITO pela loja (acceptedAt), com MTB atribuído mas que NÃO pegou.
    const order = await prisma.order.create({ data: {
      customerId: customer.id,
      storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 200), quantity: 1, price: 200 }] },
      totalValue: 200,
      deliveryFee: 100,
      status: 'pago',
      paymentMethod: 'pix',
      paymentStatus: 'paid',
      acceptedAt: new Date(),
    }, include: { items: true } });

    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, motoboyId: motoboy.id, fee: 100, status: 'assigned' },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const res = await request(app)
      .post(`/api/orders/${order.id}/reject`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ reason: 'Cancelou após aceitar' });

    expect(res.status).toBe(200);
    // Config: cancelFeeStorePercent=10% de deliveryFee(100) = R$10 de taxa;
    // 50% (R$5) motoboy, 50% (R$5) app. Cliente refund 100% (R$200).

    // PROVA 1: cliente recebe 100% do total (loja é a culpada).
    expect(res.body.refundAmount).toBeCloseTo(200, 2);
    const custWallet = await findWallet({ owner: customer.id, ownerType: 'user' });
    expect(custWallet!.balance).toBeCloseTo(1200, 2); // 1000 + 200

    // PROVA 2: taxa debitada da LOJA (base = entrega), como penalty.
    const storeWallet = await findWallet({ owner: store.id, ownerType: 'store' });
    expect(storeWallet!.balance).toBeCloseTo(490, 2); // 500 - 10
    const penalty = storeWallet!.history.find((h: any) => h.category === 'penalty');
    expect(penalty).toBeTruthy();
    expect(penalty!.amount).toBeCloseTo(10, 2);

    // PROVA 3: compensação do MTB = motoboyShare (50/50), Payout 'released'.
    const compPayout = await findPayout({ recipientType: 'motoboy', recipientId: motoboy.id, status: 'released' });
    expect(compPayout).not.toBeNull();
    expect(compPayout!.amount).toBeCloseTo(5, 2);

    // PROVA 4: AppCashbox recebe a taxa INTEIRA (R$10) como lastro; líquido = appShare (R$5).
    const cashbox = await findAppCashbox();
    const feeEntry = cashbox!.history.find((h: any) => h.source === 'cancelled_order');
    expect(feeEntry).toBeTruthy();
    expect(feeEntry!.amount).toBeCloseTo(10, 2);
    expect(feeEntry!.amount - compPayout!.amount).toBeCloseTo(5, 2); // = appShare
  });
});

describe('loja tenta cancelar APÓS o MTB pegar (status=picked) — bloqueado', () => {
  it('retorna 400 PICKED_UP_CANNOT_CANCEL e NÃO altera o status do pedido', async () => {
    const owner = await createUser('lojista');
    const motoboy = await createUser('motoboy');
    const customer = await createUser('cliente');

    await createWallet({ owner: customer.id, ownerType: 'user', balance: 100, totalIncome: 100, totalSpent: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: owner.id, name: 'Loja Bloqueada' } });

    const order = await prisma.order.create({ data: {
      customerId: customer.id,
      storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 200), quantity: 1, price: 200 }] },
      totalValue: 200,
      deliveryFee: 100,
      status: 'enviado',
      paymentMethod: 'pix',
      paymentStatus: 'paid',
      acceptedAt: new Date(),
    }, include: { items: true } });

    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, motoboyId: motoboy.id, fee: 100, status: 'picked' },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const res = await request(app)
      .post(`/api/orders/${order.id}/reject`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ reason: 'Tarde demais' });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('PICKED_UP_CANNOT_CANCEL');

    // Pedido NÃO muda de status (continua 'enviado', não foi reivindicado/rejeitado).
    const updated = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updated!.status).toBe('enviado');

    // Nenhuma taxa lançada.
    const cashbox = await findAppCashbox();
    const feeEntry = cashbox!.history.find((h: any) => h.source === 'cancelled_order');
    expect(feeEntry).toBeFalsy();
  });
});

// ============================================================
// Regressão (fix round 1): COD aceito-não-enviado NÃO pode disparar taxa.
// O gate configurável novo vale só p/ PIX (chargeStoreFee = storeAccepted && (!COD || isLate)).
// Se a taxa rodasse em COD-não-late, o ramo COD debitaria o blockedBalance (pool compartilhado)
// AO MESMO TEMPO que o bloco de liberação `if (isCashOnDelivery && !isLate)` o drenaria de novo
// → dupla-drenagem que sub-colateraliza reservas de OUTROS pedidos COD.
// ============================================================
describe('loja cancela COD aceito ANTES do envio — só libera a reserva deste pedido, sem taxa', () => {
  it('não cobra taxa; blockedBalance cai só pela reserva deste pedido; excedente do pool intacto', async () => {
    const owner = await createUser('lojista');
    const customer = await createUser('cliente');
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: owner.id, name: 'Loja COD' } });

    // Pool de reservas COD = 40 (simula DUAS reservas de 20 no bucket bloqueado). O cancelamento
    // deste pedido (total=200, lateCancellationFeePercent=10% → reserva 20) deve liberar só 20.
    await createWallet({ owner: store.id, ownerType: 'store', balance: 0, totalIncome: 0, totalSpent: 0, blockedBalance: 40 });

    const order = await prisma.order.create({ data: {
      customerId: customer.id,
      storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 200), quantity: 1, price: 200 }] },
      totalValue: 200,
      deliveryFee: 100,
      status: 'pago',              // aceito mas NÃO enviado → !isLate
      paymentMethod: 'cash_on_delivery',
      acceptedAt: new Date(),
    }, include: { items: true } });

    const res = await request(app)
      .post(`/api/orders/${order.id}/reject`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ reason: 'Cancelou COD antes do envio' });

    expect(res.status).toBe(200);
    // NENHUMA taxa: sem lateCancellationFee no corpo, sem entrada cancelled_order, sem penalty.
    expect(res.body.lateCancellationFee).toBeUndefined();
    const cashbox = await findAppCashbox();
    expect(cashbox!.history.find((h: any) => h.source === 'cancelled_order')).toBeFalsy();

    const storeWallet = await findWallet({ owner: store.id, ownerType: 'store' });
    expect(storeWallet!.history.find((h: any) => h.category === 'penalty')).toBeFalsy();

    // Só a LIBERAÇÃO rodou: blocked 40 → 20 (liberou 20 = reserva DESTE pedido),
    // balance 0 → 20. O excedente do pool (20 = reserva do OUTRO pedido) fica intacto.
    expect(storeWallet!.blockedBalance).toBeCloseTo(20, 2);
    expect(storeWallet!.balance).toBeCloseTo(20, 2);
  });
});
