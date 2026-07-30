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
import { runStoreAcceptTimeout } from '../jobs/storeAcceptTimeout.job';
import { runPoolTimeout } from '../jobs/poolTimeout.job';

const refundMock = refundOrderCharge as jest.Mock;
const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';

// PlatformConfig é um singleton compartilhado no Postgres de dev. Fixamos as taxas
// relevantes em valores conhecidos e restauramos ao final (padrão da Task 3), para não
// depender de valores que outra suíte possa ter deixado e não vazar os nossos.
let restorePlatformConfig: () => Promise<void>;

beforeAll(async () => {
  restorePlatformConfig = await snapshotPlatformConfig();
  const existing = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
  const data = { cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10, lateCancellationMotoboyShare: 50, updatedBy: 'cancelFlows.test' };
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

// ============================================================
// Task 7: MOTOBOY cancela após pegar → cobra taxa do MTB (100% app) + devolução
// + o CLIENTE decide reembolso (100%) ou reentrega (volta ao pool).
// Desenho escolhido: o cliente decide PRIMEIRO. `reentrega` só volta ao pool
// depois do confirmReturn da loja (produto fisicamente de volta) — reusando a
// infra existente pinDevolucao/pendingReturnAction='reassign'.
// ============================================================
describe('Task 7: motoboy cancela ANTES de pegar (assigned) — volta ao pool, sem taxa', () => {
  it('devolve a entrega ao pool (pending, motoboyId=null) e NÃO cobra taxa do motoboy', async () => {
    const motoboy = await createUser('motoboy');
    const customer = await createUser('cliente');

    await createWallet({ owner: motoboy.id, ownerType: 'motoboy', balance: 50, totalIncome: 50, totalSpent: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja MTB Assigned' } });

    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 200), quantity: 1, price: 200 }] },
      totalValue: 200, deliveryFee: 100, status: 'pago', paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(),
    }, include: { items: true } });

    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, motoboyId: motoboy.id, fee: 100, status: 'assigned' },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const res = await request(app)
      .post(`/api/deliveries/${delivery.id}/reject`)
      .set('Authorization', `Bearer ${motoboy.token}`)
      .send({ reason: 'Não vou conseguir pegar' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('pending');

    const updated = await prisma.delivery.findUnique({ where: { id: delivery.id } });
    expect(updated!.status).toBe('pending');
    expect(updated!.motoboyId).toBeNull();

    // Sem taxa: carteira do motoboy intacta, sem penalty, sem entrada no caixa.
    const mtbWallet = await findWallet({ owner: motoboy.id, ownerType: 'motoboy' });
    expect(mtbWallet!.balance).toBeCloseTo(50, 2);
    expect(mtbWallet!.history.find((h: any) => h.category === 'penalty')).toBeFalsy();
    const cashbox = await findAppCashbox();
    expect(cashbox!.history.find((h: any) => h.source === 'cancelled_order')).toBeFalsy();
  });
});

describe('Task 7: motoboy cancela APÓS pegar (picked) — cobra taxa do MTB + aguarda decisão do cliente', () => {
  it('debita fee.totalFee do MTB, +appShare no caixa, statusDevolucao aguardando e NÃO reatribui', async () => {
    const motoboy = await createUser('motoboy');
    const customer = await createUser('cliente');

    // Carteira do MTB com saldo — a taxa é debitada daqui (penalty).
    await createWallet({ owner: motoboy.id, ownerType: 'motoboy', balance: 50, totalIncome: 50, totalSpent: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja MTB Picked' } });

    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 200), quantity: 1, price: 200 }] },
      totalValue: 200, deliveryFee: 100, status: 'enviado', paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(),
    }, include: { items: true } });

    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, motoboyId: motoboy.id, fee: 100, status: 'picked' },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const res = await request(app)
      .post(`/api/deliveries/${delivery.id}/reject`)
      .set('Authorization', `Bearer ${motoboy.token}`)
      .send({ reason: 'Desisti no meio do caminho' });

    // Entra em devolução aguardando confirmação (não reatribui ainda).
    expect(res.status).toBe(202);
    expect(res.body.statusDevolucao).toBe('aguardando_confirmacao');

    // Config: cancelFeeMotoboyPercent=10% de deliveryFee(100) = R$10; 100% app.
    // PROVA 1: taxa debitada do MTB (penalty).
    const mtbWallet = await findWallet({ owner: motoboy.id, ownerType: 'motoboy' });
    expect(mtbWallet!.balance).toBeCloseTo(40, 2); // 50 - 10
    const penalty = mtbWallet!.history.find((h: any) => h.category === 'penalty');
    expect(penalty).toBeTruthy();
    expect(penalty!.amount).toBeCloseTo(10, 2);

    // PROVA 2: AppCashbox recebe appShare (= totalFee, 100% app) = R$10.
    const cashbox = await findAppCashbox();
    const feeEntry = cashbox!.history.find((h: any) => h.source === 'cancelled_order');
    expect(feeEntry).toBeTruthy();
    expect(feeEntry!.amount).toBeCloseTo(10, 2);

    // PROVA 3: pedido aguardando decisão — a entrega NÃO voltou ao pool.
    const updated = await prisma.delivery.findUnique({ where: { id: delivery.id } });
    expect(updated!.status).toBe('picked');
    expect(updated!.motoboyId).toBe(motoboy.id);
    expect(updated!.statusDevolucao).toBe('aguardando_confirmacao');
    expect(updated!.pendingReturnAction).toBeNull();
  });
});

describe('Task 7: cliente decide reembolso após motoboy cancelar (picked) — refund 100%', () => {
  it('POST /orders/:id/pos-devolucao {reembolso} → refund 100% e pedido cancelado', async () => {
    const motoboy = await createUser('motoboy');
    const customer = await createUser('cliente');

    await createWallet({ owner: customer.id, ownerType: 'user', balance: 500, totalIncome: 500, totalSpent: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Reembolso' } });

    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 200), quantity: 1, price: 200 }] },
      totalValue: 200, deliveryFee: 100, status: 'enviado', paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(),
    }, include: { items: true } });

    // Estado pós-rejeição do motoboy: devolução aguardando confirmação.
    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, motoboyId: motoboy.id, fee: 100, status: 'picked', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '123456' },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const res = await request(app)
      .post(`/api/orders/${order.id}/pos-devolucao`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ escolha: 'reembolso' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelado');
    // Refund 100% (motoboy é o culpado; a taxa dele já foi cobrada à parte).
    expect(res.body.refundAmount).toBeCloseTo(200, 2);

    const custWallet = await findWallet({ owner: customer.id, ownerType: 'user' });
    expect(custWallet!.balance).toBeCloseTo(700, 2); // 500 + 200

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe('cancelado');
  });
});

describe('Task 7: cliente decide reentrega após motoboy cancelar (picked) — volta ao pool', () => {
  it('POST /orders/:id/pos-devolucao {reentrega} + confirmReturn da loja → delivery pending, motoboyId null', async () => {
    const owner = await createUser('lojista');
    const motoboy = await createUser('motoboy');
    const customer = await createUser('cliente');

    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: owner.id, name: 'Loja Reentrega' } });

    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 200), quantity: 1, price: 200 }] },
      totalValue: 200, deliveryFee: 100, status: 'enviado', paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(),
    }, include: { items: true } });

    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, motoboyId: motoboy.id, fee: 100, status: 'picked', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '654321' },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    // Cliente escolhe reentrega.
    const res = await request(app)
      .post(`/api/orders/${order.id}/pos-devolucao`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ escolha: 'reentrega' });
    expect(res.status).toBe(200);
    expect(res.body.escolha).toBe('reentrega');

    // Loja confirma a devolução física com o PIN → entrega volta ao pool.
    const confirmRes = await request(app)
      .post(`/api/deliveries/${delivery.id}/confirm-return`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ pinDevolucao: '654321' });
    expect(confirmRes.status).toBe(200);

    const updated = await prisma.delivery.findUnique({ where: { id: delivery.id } });
    expect(updated!.status).toBe('pending');
    expect(updated!.motoboyId).toBeNull();
  });
});

// ============================================================
// Task 7 — Regressão review round 1 (CRITICAL #1): duplo-reembolso via
// reembolso (pos-devolucao) + confirmReturn da loja. O produto volta à loja mesmo
// no caminho reembolso; a loja NÃO pode disparar um segundo refund.
// ============================================================
describe('Task 7 fix: motoboy — reembolso seguido de confirmReturn NÃO reembolsa 2x', () => {
  it('reembolso credita totalValue UMA vez; confirmReturn tardio é rejeitado (estado terminal)', async () => {
    const owner = await createUser('lojista');
    const motoboy = await createUser('motoboy');
    const customer = await createUser('cliente');

    await createWallet({ owner: customer.id, ownerType: 'user', balance: 500, totalIncome: 500, totalSpent: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: owner.id, name: 'Loja Duplo Refund' } });

    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 200), quantity: 1, price: 200 }] },
      totalValue: 200, deliveryFee: 100, status: 'enviado', paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(),
    }, include: { items: true } });

    // Estado pós-rejeição do motoboy: devolução aguardando confirmação com PIN.
    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, motoboyId: motoboy.id, fee: 100, status: 'picked', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '777777' },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    // 1) Cliente pede reembolso → refund #1 (100%).
    const res = await request(app)
      .post(`/api/orders/${order.id}/pos-devolucao`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ escolha: 'reembolso' });
    expect(res.status).toBe(200);
    expect(res.body.refundAmount).toBeCloseTo(200, 2);

    // 2) O produto volta fisicamente e a loja tenta confirmar com o PIN → deve ser REJEITADO
    //    (estado de devolução já é terminal), sem disparar refund #2.
    const confirmRes = await request(app)
      .post(`/api/deliveries/${delivery.id}/confirm-return`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ pinDevolucao: '777777' });
    expect(confirmRes.status).toBe(400);

    // PROVA: cliente creditado order.totalValue UMA única vez (500 + 200), nunca 900.
    const custWallet = await findWallet({ owner: customer.id, ownerType: 'user' });
    expect(custWallet!.balance).toBeCloseTo(700, 2);
    const refundEntries = custWallet!.history.filter((h: any) => h.category === 'refund');
    expect(refundEntries.length).toBe(1);
  });

  it('confirmReturn no ramo CANCEL sobre pedido JÁ cancelado é no-op (trava atômica de status)', async () => {
    const owner = await createUser('lojista');
    const motoboy = await createUser('motoboy');
    const customer = await createUser('cliente');

    await createWallet({ owner: customer.id, ownerType: 'user', balance: 500, totalIncome: 500, totalSpent: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: owner.id, name: 'Loja Trava Status' } });

    // Pedido JÁ cancelado, mas a entrega ficou (estado sintético) aguardando confirmação
    // sem pendingReturnAction → confirmReturn cairia no ramo CANCEL e reembolsaria de novo
    // se não houvesse a trava atômica de status.
    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 200), quantity: 1, price: 200 }] },
      totalValue: 200, deliveryFee: 100, status: 'cancelado', paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(), cancelledAt: new Date(),
    }, include: { items: true } });

    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, motoboyId: motoboy.id, fee: 100, status: 'picked', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '888888' },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const confirmRes = await request(app)
      .post(`/api/deliveries/${delivery.id}/confirm-return`)
      .set('Authorization', `Bearer ${owner.token}`)
      .send({ pinDevolucao: '888888' });
    expect(confirmRes.status).toBe(200); // confirma a devolução física...

    // ...mas NÃO reembolsa (pedido já estava cancelado): carteira intacta.
    const custWallet = await findWallet({ owner: customer.id, ownerType: 'user' });
    expect(custWallet!.balance).toBeCloseTo(500, 2);
    expect(custWallet!.history.filter((h: any) => h.category === 'refund').length).toBe(0);
  });
});

// ============================================================
// Task 8: job de timeout loja — pedido PAGO que a loja não aceita dentro de
// storeAcceptTimeoutMin é auto-cancelado (reaproveita cancelOrderWithFullRefund):
// refund 100% + devolução de estoque, sem taxa (spec §6.1). Mira só `status='pago'`
// (pedidos `criado` não-pagos são do expirePixOrders.job.ts — sem overlap).
// ============================================================
describe('Task 8: job de timeout loja (auto-cancela pedido pago sem aceite)', () => {
  beforeAll(async () => {
    // Fixa storeAcceptTimeoutMin em um valor conhecido (o snapshot/restore do topo
    // do arquivo já cobre esta linha, criada ou atualizada por essa mesma suíte).
    const existing = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
    await prisma.platformConfig.update({ where: { id: existing!.id }, data: { storeAcceptTimeoutMin: 10 } });
  });

  it('pedido pago, acceptedAt=null, createdAt > storeAcceptTimeoutMin atrás → cancela + refund 100% + estoque devolvido', async () => {
    const customer = await createUser('cliente');
    await createWallet({ owner: customer.id, ownerType: 'user', balance: 300, totalIncome: 300, totalSpent: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Timeout' } });
    const product = await prisma.product.create({ data: { storeId: store.id, name: 'Produto Timeout', price: 150, quantity: 5 } });

    // Pago, NÃO aceito (acceptedAt ausente), criado 1h atrás — bem além dos 10min configurados.
    const order = await prisma.order.create({ data: {
      customerId: customer.id,
      storeId: store.id,
      items: { create: [{ productId: product.id, quantity: 1, price: 150 }] },
      totalValue: 150,
      deliveryFee: 0,
      status: 'pago',
      paymentMethod: 'pix',
      paymentStatus: 'paid',
      createdAt: new Date(Date.now() - 60 * 60 * 1000),
    }, include: { items: true } });

    const result = await runStoreAcceptTimeout();

    expect(result.cancelled).toBe(1);
    expect(result.failed).toBe(0);

    // PROVA 1: pedido cancelado.
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe('cancelado');

    // PROVA 2: refund 100% (não descontado) — cliente recebe o total integral.
    const custWallet = await findWallet({ owner: customer.id, ownerType: 'user' });
    expect(custWallet!.balance).toBeCloseTo(450, 2); // 300 + 150

    const cancellation = await prisma.cancellation.findFirst({ where: { orderId: order.id } });
    expect(cancellation).not.toBeNull();
    expect(cancellation!.refundStatus).toBe('processed');
    expect(Number(cancellation!.refundAmount)).toBeCloseTo(150, 2);

    // PROVA 3: estoque devolvido.
    const updatedProduct = await prisma.product.findUnique({ where: { id: product.id } });
    expect(updatedProduct!.quantity).toBe(6); // 5 + 1
  });

  it('controle: pedido pago recém-criado (DENTRO do prazo) NÃO é cancelado', async () => {
    const customer = await createUser('cliente');
    await createWallet({ owner: customer.id, ownerType: 'user', balance: 300, totalIncome: 300, totalSpent: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Dentro Prazo' } });
    const product = await prisma.product.create({ data: { storeId: store.id, name: 'Produto Dentro Prazo', price: 150, quantity: 5 } });

    // Pago, NÃO aceito, mas criado agora (createdAt default) — dentro dos 10min.
    const order = await prisma.order.create({ data: {
      customerId: customer.id,
      storeId: store.id,
      items: { create: [{ productId: product.id, quantity: 1, price: 150 }] },
      totalValue: 150,
      deliveryFee: 0,
      status: 'pago',
      paymentMethod: 'pix',
      paymentStatus: 'paid',
    }, include: { items: true } });

    const result = await runStoreAcceptTimeout();

    // Não deve ter processado ESTE pedido (pode haver outros pedidos residuais de outras
    // suítes rodando em paralelo — a prova real é o estado do NOSSO pedido/produto).
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe('pago');

    const updatedProduct = await prisma.product.findUnique({ where: { id: product.id } });
    expect(updatedProduct!.quantity).toBe(5); // inalterado

    void result;
  });
});

// ============================================================
// Task 9: job de timeout do POOL — ninguém pega a entrega em `poolTimeoutMin`.
// O job NÃO cancela sozinho (spec §6.1): apenas marca
// `Order.awaitingCustomerPoolDecision=true` e emite `order:pool_timeout`. O
// cliente decide via POST /orders/:id/pool-timeout: 'cancelar' (refund 100%,
// reaproveita cancelOrderWithFullRefund) ou 'seguir' (limpa a flag, a entrega
// segue 'pending' no pool para o matching existente).
// ============================================================
describe('Task 9: job de timeout pool (marca flag, não auto-cancela) + decisão do cliente', () => {
  beforeAll(async () => {
    // Fixa poolTimeoutMin em um valor conhecido (o snapshot/restore do topo do
    // arquivo já cobre esta linha, criada ou atualizada por essa mesma suíte).
    const existing = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
    await prisma.platformConfig.update({ where: { id: existing!.id }, data: { poolTimeoutMin: 15 } });
  });

  it('delivery pending sem motoboy, mais velha que poolTimeoutMin → runPoolTimeout() marca a flag, NÃO cancela o pedido', async () => {
    const customer = await createUser('cliente');
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Timeout Pool' } });

    // Pedido no pool (status real de produção quando a loja aceita e a entrega
    // entra no pool — ver orderController.acceptOrder), sem motoboy atribuído.
    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 80), quantity: 1, price: 80 }] },
      totalValue: 80, deliveryFee: 20, status: 'aguardando_motoboy', paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(),
    }, include: { items: true } });

    // Entrega no pool (pending, sem motoboy) criada 1h atrás — bem além dos 15min configurados.
    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, motoboyId: null, fee: 20, status: 'pending', createdAt: new Date(Date.now() - 60 * 60 * 1000) },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const result = await runPoolTimeout();

    expect(result.flagged).toBeGreaterThanOrEqual(1);

    // PROVA 1: pedido marcado aguardando decisão do cliente — NÃO cancelado.
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.awaitingCustomerPoolDecision).toBe(true);
    expect(updatedOrder!.status).toBe('aguardando_motoboy');

    // PROVA 2: a entrega segue intocada (pending, sem motoboy) — job só marca, não mexe na entrega.
    const updatedDelivery = await prisma.delivery.findUnique({ where: { id: delivery.id } });
    expect(updatedDelivery!.status).toBe('pending');
    expect(updatedDelivery!.motoboyId).toBeNull();
  });

  it('controle: delivery pending recém-criada (DENTRO do prazo) NÃO é marcada', async () => {
    const customer = await createUser('cliente');
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Pool Dentro Prazo' } });

    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 80), quantity: 1, price: 80 }] },
      totalValue: 80, deliveryFee: 20, status: 'aguardando_motoboy', paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(),
    }, include: { items: true } });

    // Entrega no pool criada AGORA (createdAt default) — dentro dos 15min.
    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, motoboyId: null, fee: 20, status: 'pending' },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    await runPoolTimeout();

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.awaitingCustomerPoolDecision).toBe(false);
  });

  it("POST /orders/:id/pool-timeout {escolha:'cancelar'} → refund 100% e pedido cancelado", async () => {
    const customer = await createUser('cliente');
    await createWallet({ owner: customer.id, ownerType: 'user', balance: 300, totalIncome: 300, totalSpent: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Pool Cancelar' } });

    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 120), quantity: 1, price: 120 }] },
      totalValue: 120, deliveryFee: 20, status: 'aguardando_motoboy', paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(),
      awaitingCustomerPoolDecision: true,
    }, include: { items: true } });

    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, motoboyId: null, fee: 20, status: 'pending' },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const res = await request(app)
      .post(`/api/orders/${order.id}/pool-timeout`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ escolha: 'cancelar' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelado');
    expect(res.body.refundAmount).toBeCloseTo(120, 2);

    const custWallet = await findWallet({ owner: customer.id, ownerType: 'user' });
    expect(custWallet!.balance).toBeCloseTo(420, 2); // 300 + 120

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe('cancelado');
    expect(updatedOrder!.awaitingCustomerPoolDecision).toBe(false);
  });

  it("POST /orders/:id/pool-timeout {escolha:'seguir'} → limpa a flag, delivery segue 'pending' no pool", async () => {
    const customer = await createUser('cliente');
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Pool Seguir' } });

    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 90), quantity: 1, price: 90 }] },
      totalValue: 90, deliveryFee: 20, status: 'aguardando_motoboy', paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(),
      awaitingCustomerPoolDecision: true,
    }, include: { items: true } });

    const delivery = await prisma.delivery.create({
      data: { orderId: order.id, motoboyId: null, fee: 20, status: 'pending' },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const res = await request(app)
      .post(`/api/orders/${order.id}/pool-timeout`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ escolha: 'seguir' });

    expect(res.status).toBe(200);

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.awaitingCustomerPoolDecision).toBe(false);
    expect(updatedOrder!.status).toBe('aguardando_motoboy');

    const updatedDelivery = await prisma.delivery.findUnique({ where: { id: delivery.id } });
    expect(updatedDelivery!.status).toBe('pending');
    expect(updatedDelivery!.motoboyId).toBeNull();
  });

  it('IDOR: outro cliente não pode decidir o timeout do pool de pedido alheio (403)', async () => {
    const customer = await createUser('cliente');
    const outro = await createUser('cliente');
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Pool IDOR' } });

    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 60), quantity: 1, price: 60 }] },
      totalValue: 60, deliveryFee: 20, status: 'aguardando_motoboy', paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(),
      awaitingCustomerPoolDecision: true,
    }, include: { items: true } });

    const res = await request(app)
      .post(`/api/orders/${order.id}/pool-timeout`)
      .set('Authorization', `Bearer ${outro.token}`)
      .send({ escolha: 'seguir' });

    expect(res.status).toBe(403);
  });

  it('sem decisão pendente (awaitingCustomerPoolDecision=false) → 409', async () => {
    const customer = await createUser('cliente');
    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Pool Sem Pendencia' } });

    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 60), quantity: 1, price: 60 }] },
      totalValue: 60, deliveryFee: 20, status: 'aguardando_motoboy', paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(),
    }, include: { items: true } });

    const res = await request(app)
      .post(`/api/orders/${order.id}/pool-timeout`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ escolha: 'seguir' });

    expect(res.status).toBe(409);
  });
});

// ============================================================
// Task 10: CLIENTE AUSENTE (spec §3.2/§6.3) — motoboy, no local, marca o
// cliente como ausente após a espera mínima (`customerAbsentWaitMin`) cumprida
// desde o pickup. Taxa via calculateCancellationFee({actor:'customer_absent'}):
// base=orderTotal (cliente paga), motoboy recebe ENTREGA CHEIA (deliveryFee),
// o resto (totalFee - motoboyShare = appShare) fica com a plataforma. O produto
// volta pra loja (statusDevolucao/pinDevolucao) e o pedido é cancelado com
// refund PARCIAL (orderTotal - totalFee).
// ============================================================
describe('Task 10: cliente ausente — motoboy marca após espera mínima cumprida', () => {
  beforeAll(async () => {
    // Fixa customerAbsentWaitMin em um valor conhecido (snapshot/restore do topo
    // do arquivo já cobre esta linha).
    const existing = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
    await prisma.platformConfig.update({ where: { id: existing!.id }, data: { customerAbsentWaitMin: 15 } });
  });

  it('refund parcial ao cliente + Payout de entrega CHEIA ao MTB + appShare no caixa + produto volta à loja', async () => {
    const motoboy = await createUser('motoboy');
    const customer = await createUser('cliente');

    await createWallet({ owner: customer.id, ownerType: 'user', balance: 500, totalIncome: 500, totalSpent: 0 });
    await createWallet({ owner: motoboy.id, ownerType: 'motoboy', balance: 0, totalIncome: 0, totalSpent: 0, availableBalance: 0, pendingBalance: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Cliente Ausente' } });

    // total=1000, deliveryFee=50. Config: cancelFeeCustomerPercent=10% de 1000 = totalFee=100.
    // motoboyShare = deliveryFee = 50 (entrega CHEIA, não fração da taxa). appShare = 100-50 = 50.
    // refundToCustomer = 1000 - 100 = 900.
    const order = await prisma.order.create({ data: {
      customerId: customer.id,
      storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 1000), quantity: 1, price: 1000 }] },
      totalValue: 1000,
      deliveryFee: 50,
      status: 'enviado',
      paymentMethod: 'pix',
      paymentStatus: 'paid',
      acceptedAt: new Date(),
    }, include: { items: true } });

    // Entrega 'picked' há 30min — bem além dos 15min configurados.
    const delivery = await prisma.delivery.create({
      data: {
        orderId: order.id, motoboyId: motoboy.id, fee: 50, status: 'picked',
        updatedAt: new Date(Date.now() - 30 * 60 * 1000),
      },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const res = await request(app)
      .post(`/api/deliveries/${delivery.id}/cliente-ausente`)
      .set('Authorization', `Bearer ${motoboy.token}`)
      .send({ reason: 'Cliente não atendeu no endereço' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelado');

    // PROVA 1: refund PARCIAL — total - totalFee.
    expect(res.body.refundAmount).toBeCloseTo(900, 2);
    expect(res.body.refundStatus).toBe('processed');
    const custWallet = await findWallet({ owner: customer.id, ownerType: 'user' });
    expect(custWallet!.balance).toBeCloseTo(1400, 2); // 500 + 900

    // PROVA 2: compensação do MTB = deliveryFee (entrega CHEIA), Payout 'released'.
    const compPayout = await findPayout({ recipientType: 'motoboy', recipientId: motoboy.id, status: 'released' });
    expect(compPayout).not.toBeNull();
    expect(compPayout!.amount).toBeCloseTo(50, 2);

    // PROVA 3: AppCashbox recebe a taxa cheia (R$100) como lastro; o líquido da
    // plataforma (income - payout do motoboy) é appShare (R$50).
    const cashbox = await findAppCashbox();
    const feeEntry = cashbox!.history.find((h: any) => h.source === 'cancelled_order');
    expect(feeEntry).toBeTruthy();
    expect(feeEntry!.amount).toBeCloseTo(100, 2);
    expect(feeEntry!.amount - compPayout!.amount).toBeCloseTo(50, 2); // = appShare

    // PROVA 4: produto volta pra loja — statusDevolucao setado + PIN gerado.
    const updatedDelivery = await prisma.delivery.findUnique({ where: { id: delivery.id } });
    expect(updatedDelivery!.statusDevolucao).toBe('aguardando_confirmacao');
    expect(updatedDelivery!.pinDevolucao).toBeTruthy();
    expect(updatedDelivery!.status).toBe('cancelled');

    // PROVA 5: pedido cancelado.
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe('cancelado');
  });

  it('controle: motoboy que NÃO é o dono da entrega → 403', async () => {
    const motoboyDono = await createUser('motoboy');
    const outroMotoboy = await createUser('motoboy');
    const customer = await createUser('cliente');

    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Ausente IDOR' } });

    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 200), quantity: 1, price: 200 }] },
      totalValue: 200, deliveryFee: 30, status: 'enviado', paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(),
    }, include: { items: true } });

    const delivery = await prisma.delivery.create({
      data: {
        orderId: order.id, motoboyId: motoboyDono.id, fee: 30, status: 'picked',
        updatedAt: new Date(Date.now() - 30 * 60 * 1000),
      },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const res = await request(app)
      .post(`/api/deliveries/${delivery.id}/cliente-ausente`)
      .set('Authorization', `Bearer ${outroMotoboy.token}`)
      .send({ reason: 'Tentativa indevida' });

    expect(res.status).toBe(403);

    // Pedido/entrega intocados.
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe('enviado');
  });

  it('controle: espera mínima ainda NÃO cumprida → 400', async () => {
    const motoboy = await createUser('motoboy');
    const customer = await createUser('cliente');

    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Ausente Cedo' } });

    const order = await prisma.order.create({ data: {
      customerId: customer.id, storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 200), quantity: 1, price: 200 }] },
      totalValue: 200, deliveryFee: 30, status: 'enviado', paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(),
    }, include: { items: true } });

    // Entrega retirada há só 1 minuto — dentro dos 15min configurados.
    const delivery = await prisma.delivery.create({
      data: {
        orderId: order.id, motoboyId: motoboy.id, fee: 30, status: 'picked',
        updatedAt: new Date(Date.now() - 1 * 60 * 1000),
      },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const res = await request(app)
      .post(`/api/deliveries/${delivery.id}/cliente-ausente`)
      .set('Authorization', `Bearer ${motoboy.token}`)
      .send({ reason: 'Muito cedo' });

    expect(res.status).toBe(400);

    // Pedido/entrega intocados.
    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe('enviado');
  });

  // ============================================================
  // Fix round 1 (review): edge de MAIOR risco — deliveryFee > totalFee →
  // appShare = totalFee - motoboyShare fica NEGATIVO (motoboyShare = deliveryFee,
  // entrega CHEIA, fixa; totalFee = orderTotal * cancelFeeCustomerPercent/100).
  // O handler NUNCA lança `appShare` como entrada de caixa — só `fee.totalFee`
  // (sempre ≥ 0). Este teste prova que o comportamento é esse na prática: a
  // entrada de income no AppCashbox é `totalFee` (10), nunca `appShare` (-40)
  // nem qualquer valor negativo; o Payout do MTB continua recebendo a entrega
  // cheia (50); e o refund ao cliente continua correto (total - totalFee = 90).
  // ============================================================
  it('edge: deliveryFee > totalFee → appShare negativo, mas caixa NUNCA recebe income negativo (lança totalFee)', async () => {
    const motoboy = await createUser('motoboy');
    const customer = await createUser('cliente');

    await createWallet({ owner: customer.id, ownerType: 'user', balance: 200, totalIncome: 200, totalSpent: 0 });
    await createWallet({ owner: motoboy.id, ownerType: 'motoboy', balance: 0, totalIncome: 0, totalSpent: 0, availableBalance: 0, pendingBalance: 0 });
    await createAppCashbox({ balance: 0, totalIncome: 0, totalExpenses: 0 });

    const store = await prisma.store.create({ data: { ownerId: await ownerIdForStore('@cancel.test'), name: 'Loja Ausente AppShare Negativo' } });

    // total=100, deliveryFee=50. Config: cancelFeeCustomerPercent=10% de 100 = totalFee=10.
    // motoboyShare = deliveryFee = 50 (entrega CHEIA) > totalFee(10) → appShare = 10-50 = -40.
    // refundToCustomer = 100 - 10 = 90.
    const order = await prisma.order.create({ data: {
      customerId: customer.id,
      storeId: store.id,
      items: { create: [{ productId: await productIdForItem('@cancel.test', 100), quantity: 1, price: 100 }] },
      totalValue: 100,
      deliveryFee: 50,
      status: 'enviado',
      paymentMethod: 'pix',
      paymentStatus: 'paid',
      acceptedAt: new Date(),
    }, include: { items: true } });

    const delivery = await prisma.delivery.create({
      data: {
        orderId: order.id, motoboyId: motoboy.id, fee: 50, status: 'picked',
        updatedAt: new Date(Date.now() - 30 * 60 * 1000),
      },
    });
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } });

    const res = await request(app)
      .post(`/api/deliveries/${delivery.id}/cliente-ausente`)
      .set('Authorization', `Bearer ${motoboy.token}`)
      .send({ reason: 'Cliente ausente' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('cancelado');
    // O response expõe appShare calculado (-40) só como informação — não é o que
    // vai pro caixa.
    expect(res.body.appShare).toBeCloseTo(-40, 2);

    // PROVA 1: refund ao cliente = total - totalFee = 90.
    expect(res.body.refundAmount).toBeCloseTo(90, 2);
    const custWallet = await findWallet({ owner: customer.id, ownerType: 'user' });
    expect(custWallet!.balance).toBeCloseTo(290, 2); // 200 + 90

    // PROVA 2: Payout de compensação do MTB = deliveryFee (entrega cheia) = 50,
    // MESMO sendo maior que a taxa cobrada do cliente (10).
    const compPayout = await findPayout({ recipientType: 'motoboy', recipientId: motoboy.id, status: 'released' });
    expect(compPayout).not.toBeNull();
    expect(compPayout!.amount).toBeCloseTo(50, 2);

    // PROVA 3 (o ponto central do fix): o AppCashbox recebe `totalFee` (10) como
    // income — NUNCA `appShare` (-40) e NUNCA um valor negativo. Nenhuma entrada
    // de income negativa é criada em NENHUM lugar do caixa.
    const cashbox = await findAppCashbox();
    const feeEntry = cashbox!.history.find((h: any) => h.source === 'cancelled_order');
    expect(feeEntry).toBeTruthy();
    expect(feeEntry!.amount).toBeCloseTo(10, 2); // = totalFee, não appShare
    expect(feeEntry!.type).toBe('income');
    expect(feeEntry!.amount).toBeGreaterThan(0);
    const negativeIncomeEntries = cashbox!.history.filter((h: any) => h.type === 'income' && h.amount < 0);
    expect(negativeIncomeEntries.length).toBe(0);

    // PROVA 4: produto volta pra loja + pedido cancelado.
    const updatedDelivery = await prisma.delivery.findUnique({ where: { id: delivery.id } });
    expect(updatedDelivery!.statusDevolucao).toBe('aguardando_confirmacao');
    expect(updatedDelivery!.pinDevolucao).toBeTruthy();

    const updatedOrder = await prisma.order.findUnique({ where: { id: order.id } });
    expect(updatedOrder!.status).toBe('cancelado');
  });
});
