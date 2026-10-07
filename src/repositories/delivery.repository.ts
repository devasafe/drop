import { Delivery, Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/**
 * Acesso a `Delivery` via Prisma — Fase 4, Fatia 4.
 *
 * `Delivery` é um registro plano (sem array embutido). O mapper só recompõe a
 * forma que a API sempre devolveu: `_id` ao lado de `id` e `fee` (Decimal) como
 * number. Os controllers seguem devolvendo o mesmo JSON.
 */

export function toApiDelivery(delivery: Delivery | null): any {
  if (!delivery) return null;
  return {
    ...delivery,
    _id: delivery.id,
    fee: delivery.fee === null || delivery.fee === undefined ? delivery.fee : (delivery.fee as Prisma.Decimal).toNumber(),
  };
}

/**
 * Remove os três PINs de um objeto de entrega (para loja, admin, pool, logs, sockets).
 */
export function stripDeliveryPins<T extends Record<string, any> | null | undefined>(delivery: T): T {
  if (!delivery) return delivery;
  const rest: any = { ...delivery };
  delete rest.pin;
  delete rest.pinRetirada;
  delete rest.pinDevolucao;
  return rest as T;
}

/**
 * Zera PINs e a trava de tentativas no objeto (antes de persistDelivery) quando a
 * entrega volta ao pool: o próximo motoboy recebe PINs novos no claim. `null`, não
 * `undefined` — o Prisma ignora undefined no update e o PIN antigo ficaria gravado.
 */
export function clearDeliveryPins(delivery: any): void {
  delivery.pin = null;
  delivery.pinRetirada = null;
  delivery.pinDevolucao = null;
  delivery.pinFailedAttempts = 0;
  delivery.pinLockedUntil = null;
}

/**
 * Serializa a entrega para QUEM está vendo. Regra (auditoria 2026-10-07):
 *   pinRetirada / pinDevolucao → só o motoboy desta entrega (ele mostra à loja)
 *   pin (entrega)              → só o cliente do pedido (ele informa ao motoboy)
 *   loja, admin e outros       → nenhum PIN
 * `delivery` já no formato de API (toApiDelivery).
 */
export function serializeDeliveryFor(delivery: any, viewerId: unknown, opts: { customerId?: unknown } = {}): any {
  if (!delivery) return delivery;
  const out: any = stripDeliveryPins(delivery);
  const viewer = viewerId ? String(viewerId) : '';
  if (viewer && delivery.motoboyId && String(delivery.motoboyId) === viewer) {
    out.pinRetirada = delivery.pinRetirada ?? null;
    out.pinDevolucao = delivery.pinDevolucao ?? null;
  }
  if (viewer && opts.customerId && String(opts.customerId) === viewer) {
    out.pin = delivery.pin ?? null;
  }
  return out;
}

/**
 * Persiste o objeto de API mutável de volta no Postgres — substitui o
 * `delivery.save()` do Mongoose. `Delivery` só tem colunas escalares (sem
 * relações), então gravar o objeto inteiro é seguro. Descartamos os campos que
 * não são colunas graváveis (`_id`, `id`, timestamps gerenciados).
 */
export async function persistDelivery(delivery: any): Promise<void> {
  const { _id, id, createdAt, updatedAt, ...data } = delivery;
  await prisma.delivery.update({ where: { id }, data });
}

class DeliveryRepository {
  findById(id: string): Promise<Delivery | null> {
    return prisma.delivery.findUnique({ where: { id } });
  }
}

export const deliveryRepository = new DeliveryRepository();
export default deliveryRepository;
