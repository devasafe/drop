import { DeliveryInvoice } from '@prisma/client';
import { prisma } from '../lib/prisma';

import userRepository from '../repositories/user.repository';

/**
 * Gera numero sequencial NS-000001 baseado na contagem atual.
 * Nao ha race-condition critica: se duas invoices forem criadas simultaneamente
 * o indice unique em invoiceNumber rejeita duplicatas e o caller pode retry.
 */
async function generateInvoiceNumber(): Promise<string> {
  const count = await prisma.deliveryInvoice.count();
  const next = count + 1;
  return `NS-${String(next).padStart(6, '0')}`;
}

function formatAddress(addr: any): string {
  if (!addr) return '';
  if (typeof addr === 'string') return addr;
  const parts = [
    addr.street,
    addr.number,
    addr.neighborhood,
    addr.city,
    addr.state,
  ].filter(Boolean);
  return parts.join(', ');
}

class DeliveryInvoiceService {
  /**
   * Gera uma nota de servico para uma entrega finalizada.
   * Idempotente: se ja existir nota para (orderId, deliveryId), retorna a existente.
   */
  async generateInvoice(params: {
    orderId: string;
    deliveryId: string;
    payoutId?: string;
    motoboyAmount: number;
    appCommission: number;
    commissionPercent: number;
  }): Promise<DeliveryInvoice> {
    const { orderId, deliveryId, payoutId, motoboyAmount, appCommission, commissionPercent } = params;

    // Idempotencia: checar se ja existe.
    const existing = await prisma.deliveryInvoice.findFirst({ where: { orderId, deliveryId } });
    if (existing) return existing;

    // Buscar dados do pedido/entrega/loja/cliente/motoboy.
    // Order e Delivery vivem no Postgres; Delivery ainda pelo Mongoose model (Fatia 4).
    const [order, delivery] = await Promise.all([
      prisma.order.findUnique({ where: { id: String(orderId) } }),
      prisma.delivery.findUnique({ where: { id: String(deliveryId) } }),
    ]);

    if (!order) throw new Error(`Order ${orderId} nao encontrado`);
    if (!delivery) throw new Error(`Delivery ${deliveryId} nao encontrado`);

    const [store, customer, motoboy] = await Promise.all([
      prisma.store.findUnique({ where: { id: String(order.storeId) } }),
      userRepository.findById(String(order.customerId)),
      delivery.motoboyId ? userRepository.findById(String(delivery.motoboyId)) : null,
    ]);

    if (!motoboy) throw new Error(`Motoboy nao encontrado para delivery ${deliveryId}`);

    const deliveryFee = delivery.fee || Number(order.deliveryFee) || 0;
    const invoiceNumber = await generateInvoiceNumber();

    // Endereco de entrega do cliente
    const customerAddress = (order as any).customerAddress
      || (customer as any)?.addresses?.find((a: any) => a.isDefault)
      || (customer as any)?.addresses?.[0];

    return prisma.deliveryInvoice.create({
      data: {
        invoiceNumber,
        orderId,
        deliveryId,
        payoutId: payoutId || undefined,

        motoboyId: motoboy.id,
        motoboyName: (motoboy as any).name || 'Motoboy',
        motoboyEmail: (motoboy as any).email,
        motoboyCpf: (motoboy as any).cpf,

        storeId: String(order.storeId),
        storeName: (store as any)?.name || 'Loja',
        storeAddress: formatAddress((store as any)?.address) || (store as any)?.address,
        storeCnpj: (store as any)?.cnpj,

        customerId: String(order.customerId),
        customerName: (customer as any)?.name || 'Cliente',
        customerAddress: formatAddress(customerAddress),

        serviceDescription: 'Servico de entrega rapida por motoboy',
        distance: delivery.distance,
        deliveryFee,
        motoboyAmount,
        appCommission,
        commissionPercent,

        pickedAt: (delivery as any).pickedAt,
        deliveredAt: (delivery as any).deliveredAt || new Date(),
        issuedAt: new Date(),
        status: 'issued',
      },
    });
  }

  async findByOrderId(orderId: string): Promise<DeliveryInvoice | null> {
    return prisma.deliveryInvoice.findFirst({ where: { orderId } });
  }

  async findById(id: string): Promise<DeliveryInvoice | null> {
    return prisma.deliveryInvoice.findUnique({ where: { id } });
  }

  async listByMotoboy(motoboyId: string, limit = 50): Promise<DeliveryInvoice[]> {
    return prisma.deliveryInvoice.findMany({
      where: { motoboyId },
      orderBy: { issuedAt: 'desc' },
      take: limit,
    });
  }
}

export const deliveryInvoiceService = new DeliveryInvoiceService();
export default deliveryInvoiceService;
