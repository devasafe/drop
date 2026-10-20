/**
 * D3b-1 · P2 — cenários de cancelamento do admin no Postgres de teste (custódia e SaaS).
 * Valores fixos: subtotal 40, entrega 12, total 52 (2 itens de R$ 20). Carteira da loja com
 * R$ 100 (a taxa da loja sai dela). O motoboy tem chave Pix (o modo direto exige).
 */
import crypto from 'crypto';
import { prisma } from '../../lib/prisma';
import { encryptSensitiveData } from '../../utils/encryption';
import { createTestUser, TestUser } from './authUser';
import { createWallet } from './financePg';
import { cleanupUsersByEmailDomain } from './pgCleanup';

export const D3B1_STORE_KEY = '$aact_hmlg_LOJA_D3B1';
export const D3B1_PIN_RETIRADA = '54321';

export interface CancelScenarioOpts {
  mode: 'custody' | 'direct';
  orderStatus: 'criado' | 'pago' | 'aguardando_motoboy' | 'enviado' | 'entregue';
  /** Sem `delivery`, o pedido não tem entrega. pending = sem motoboy; assigned/picked = com motoboy. */
  delivery?: 'pending' | 'assigned' | 'picked';
  /** Padrão true (a loja já aceitou). */
  acceptedAt?: boolean;
  /** Devolução esperando a decisão do cliente (statusDevolucao 'aguardando_confirmacao'). */
  returnInProgress?: boolean;
  /** Padrão true. false = aguardando o Pix (paymentStatus 'pending'). */
  paid?: boolean;
}

export interface CancelScenario {
  cliente: TestUser;
  lojista: TestUser;
  motoboy: TestUser;
  storeId: string;
  productId: string;
  orderId: string;
  deliveryId: string | null;
}

export async function cenarioCancel(domain: string, o: CancelScenarioOpts): Promise<CancelScenario> {
  const cliente = await createTestUser('cliente', domain);
  const lojista = await createTestUser('lojista', domain);
  const motoboy = await createTestUser('motoboy', domain);
  await prisma.user.update({
    where: { id: motoboy.userId },
    data: { asaas: { status: 'none', pixKey: '12345678909', pixKeyType: 'CPF' } } as any,
  });
  const store = await prisma.store.create({
    data: { ownerId: lojista.userId, name: 'Loja D3b1', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
  if (o.mode === 'direct') {
    await prisma.storeAsaasAccount.create({
      data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData(D3B1_STORE_KEY), apiKeyLast4: 'D3B1', environment: 'sandbox', status: 'valid' },
    });
  }
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id,
      items: { create: [{ productId: product.id, quantity: 2, price: 20 }] },
      subtotal: 40, totalValue: 52, deliveryFee: 12, status: o.orderStatus,
      paymentMethod: 'pix',
      paymentStatus: o.paid === false ? 'pending' : 'paid',
      asaasChargeStatus: o.paid === false ? 'pending' : 'received',
      asaasPaymentId: `pay_d3b1_${crypto.randomUUID().slice(0, 8)}`,
      paymentProvider: o.mode === 'direct' ? 'asaas_loja' : 'asaas',
      acceptedAt: o.acceptedAt === false ? null : new Date(),
      ...(o.mode === 'direct' ? { walletDistribution: { storeAmount: 52, appCommission: 0, commissionPercent: 0 } } : {}),
    } as any,
  });
  let deliveryId: string | null = null;
  if (o.delivery) {
    const withMotoboy = o.delivery !== 'pending';
    const d = await prisma.delivery.create({
      data: {
        orderId: order.id, status: o.delivery, fee: 12, distance: 4,
        ...(withMotoboy ? { motoboyId: motoboy.userId, pin: '12345', pinRetirada: D3B1_PIN_RETIRADA, assignedAt: new Date() } : {}),
        ...(o.delivery === 'picked' ? { pickedAt: new Date() } : {}),
        ...(o.returnInProgress ? { statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '654321' } : {}),
      } as any,
    });
    deliveryId = d.id;
    await prisma.order.update({ where: { id: order.id }, data: { deliveryId: d.id } as any });
  }
  await createWallet({ owner: cliente.userId, ownerType: 'user' });
  await createWallet({ owner: motoboy.userId, ownerType: 'motoboy' });
  await createWallet({ owner: store.id, ownerType: 'store', balance: 100, totalIncome: 100 });
  return { cliente, lojista, motoboy, storeId: store.id, productId: product.id, orderId: order.id, deliveryId };
}

/** Limpa dinheiro, avisos e o caixa criado pelos cenários da suíte, depois os usuários. */
export async function limparCancel(domain: string, since: Date): Promise<void> {
  const users = await prisma.user.findMany({ where: { email: { endsWith: domain } }, select: { id: true } });
  const userIds = users.map((u) => u.id);
  const stores = await prisma.store.findMany({ where: { ownerId: { in: userIds } }, select: { id: true } });
  const orders = await prisma.order.findMany({ where: { storeId: { in: stores.map((s) => s.id) } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await prisma.motoboyTransfer.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.directRefund.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.deliveryInvoice.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.appCashboxEntry.deleteMany({ where: { orderId: { in: ids } } });
  // O fluxo de custódia cria o AppCashbox (singleton) se ele não existia: não deixa vazar.
  await prisma.appCashbox.deleteMany({ where: { createdAt: { gte: since }, entries: { none: {} } } });
  await prisma.notification.deleteMany({ where: { userId: { in: userIds } } });
  await cleanupUsersByEmailDomain(domain);
}
