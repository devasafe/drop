import { Order, OrderItem, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Acesso a `Order` via Prisma — Fase 4, Fatia 3.
 *
 * O que muda estruturalmente: `Order.products[]` (array embutido no Mongo) virou a
 * tabela `OrderItem`. A API pública NÃO muda — o frontend lê `order.products` e
 * `order._id`, e valores em dinheiro como `number`. O mapper `toApiOrder` recompõe
 * essa forma a partir do registro Prisma, para que os controllers devolvam o mesmo
 * JSON de sempre.
 *
 * Enquanto Wallet/Payout/AppCashbox seguem no Mongo (Fatia 5), `createOrder` cria o
 * Order no Postgres por último e, se o lado Mongo falhar, compensa apagando-o
 * (mesmo padrão que o estoque já usa desde a Fatia 2).
 */

export type OrderWithItems = Order & { items: OrderItem[] };

/** Converte Decimal|null em number, preservando null/undefined. */
function num(v: Prisma.Decimal | number | null | undefined): number | undefined {
  if (v === null || v === undefined) return undefined;
  return typeof v === 'number' ? v : v.toNumber();
}

/**
 * Recompõe a forma que a API sempre devolveu a partir de um Order do Prisma:
 * `_id` ao lado de `id`, `items` reexpostos como `products`, e dinheiro como number.
 */
export function toApiOrder(order: OrderWithItems | null): any {
  if (!order) return null;
  const { items, ...rest } = order;
  return {
    ...rest,
    _id: order.id,
    products: (items ?? []).map((it) => ({
      productId: it.productId,
      quantity: it.quantity,
      price: num(it.price),
      _id: it.id,
    })),
    totalValue: num(order.totalValue),
    subtotal: num(order.subtotal),
    deliveryFee: num(order.deliveryFee),
    debtCollected: num(order.debtCollected),
    walletApplied: num(order.walletApplied),
  };
}

export const orderInclude = { items: true } as const;

class OrderRepository {
  findById(id: string): Promise<OrderWithItems | null> {
    return prisma.order.findUnique({ where: { id }, include: orderInclude });
  }

  findByIdApi(id: string) {
    return this.findById(id).then(toApiOrder);
  }
}

export const orderRepository = new OrderRepository();
export default orderRepository;
