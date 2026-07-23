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
