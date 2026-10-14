/**
 * D2 — monta uma corrida de motoboy no Postgres de teste (custódia; a suíte põe
 * PAYMENT_GATEWAY='none'). Cada suíte passa o seu domínio de e-mail, como os outros helpers.
 */
import { prisma } from '../../lib/prisma';
import { createTestUser, TestUser } from './authUser';
import { createWallet } from './financePg';
import { cleanupUsersByEmailDomain } from './pgCleanup';

export const RIDE_PIN_ENTREGA = '12345';
export const RIDE_PIN_RETIRADA = '54321';
export const minutesAgo = (m: number) => new Date(Date.now() - m * 60_000);

export interface RideOpts {
  status: 'pending' | 'assigned' | 'picked';
  /** Padrão: 'pago' (pending/assigned) ou 'enviado' (picked). */
  orderStatus?: 'pago' | 'aguardando_motoboy' | 'enviado' | 'cancelado' | 'rejeitado';
  /** Só para picked. Padrão: 30 min atrás. `null` simula entrega retirada antes da C2. */
  pickedAt?: Date | null;
  /** Força o `updatedAt` gravado na criação. */
  updatedAt?: Date;
}

export interface Ride {
  dono: TestUser;
  cliente: TestUser;
  motoboy: TestUser;
  storeId: string;
  productId: string;
  orderId: string;
  deliveryId: string;
}

export async function criarCorrida(domain: string, opts: RideOpts): Promise<Ride> {
  const dono = await createTestUser('lojista', domain);
  const cliente = await createTestUser('cliente', domain);
  const motoboy = await createTestUser('motoboy', domain);
  const store = await prisma.store.create({
    data: { ownerId: dono.userId, name: 'Loja Corrida D2', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
  const order = await prisma.order.create({
    data: {
      customerId: cliente.userId, storeId: store.id,
      items: { create: [{ productId: product.id, quantity: 1, price: 20 }] },
      subtotal: 20, totalValue: 30, deliveryFee: 10,
      status: opts.orderStatus ?? (opts.status === 'picked' ? 'enviado' : 'pago'),
      paymentMethod: 'pix', paymentStatus: 'paid', acceptedAt: new Date(),
    } as any,
  });
  const withMotoboy = opts.status !== 'pending';
  const delivery = await prisma.delivery.create({
    data: {
      orderId: order.id, status: opts.status, fee: 10, distance: 4,
      ...(withMotoboy
        ? { motoboyId: motoboy.userId, pin: RIDE_PIN_ENTREGA, pinRetirada: RIDE_PIN_RETIRADA, assignedAt: minutesAgo(40) }
        : {}),
      ...(opts.status === 'picked' ? { pickedAt: opts.pickedAt === undefined ? minutesAgo(30) : opts.pickedAt } : {}),
      ...(opts.updatedAt ? { updatedAt: opts.updatedAt } : {}),
    } as any,
  });
  await prisma.order.update({ where: { id: order.id }, data: { deliveryId: delivery.id } as any });
  await createWallet({ owner: cliente.userId, ownerType: 'user' });
  await createWallet({ owner: motoboy.userId, ownerType: 'motoboy' });
  return { dono, cliente, motoboy, storeId: store.id, productId: product.id, orderId: order.id, deliveryId: delivery.id };
}

/** Limpa o que as corridas da suíte gravaram (dinheiro, notas, caixa criado no teste) e os usuários. */
export async function limparCorridas(domain: string, since: Date): Promise<void> {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: domain } } }, select: { id: true } });
  const orders = await prisma.order.findMany({ where: { storeId: { in: stores.map((s) => s.id) } }, select: { id: true } });
  const ids = orders.map((o) => o.id);
  await prisma.motoboyTransfer.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.directRefund.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.deliveryInvoice.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.payout.deleteMany({ where: { orderId: { in: ids } } });
  await prisma.appCashboxEntry.deleteMany({ where: { orderId: { in: ids } } });
  // O fluxo de custódia cria o AppCashbox (singleton) se ele não existia: não deixa vazar.
  await prisma.appCashbox.deleteMany({ where: { createdAt: { gte: since }, entries: { none: {} } } });
  await cleanupUsersByEmailDomain(domain);
}
