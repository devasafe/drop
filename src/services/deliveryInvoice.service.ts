import { ClientSession, Types } from 'mongoose';
import DeliveryInvoice, { IDeliveryInvoice } from '../models/DeliveryInvoice';
import Order from '../models/Order';
import Delivery from '../models/Delivery';
import Store from '../models/Store';
import User from '../models/User';

/**
 * Gera numero sequencial NS-000001 baseado na contagem atual.
 * Nao ha race-condition critica: se duas invoices forem criadas simultaneamente
 * o indice unique em invoiceNumber rejeita duplicatas e o caller pode retry.
 */
async function generateInvoiceNumber(): Promise<string> {
  const count = await DeliveryInvoice.countDocuments();
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
    session?: ClientSession;
  }): Promise<IDeliveryInvoice> {
    const { orderId, deliveryId, payoutId, motoboyAmount, appCommission, commissionPercent, session } = params;

    // Idempotencia: checar se ja existe
    const existing = await DeliveryInvoice.findOne({
      orderId: new Types.ObjectId(orderId),
      deliveryId: new Types.ObjectId(deliveryId),
    }).session(session || null);

    if (existing) return existing;

    // Buscar dados do pedido/entrega/loja/cliente/motoboy
    const [order, delivery] = await Promise.all([
      Order.findById(orderId).session(session || null),
      Delivery.findById(deliveryId).session(session || null),
    ]);

    if (!order) throw new Error(`Order ${orderId} nao encontrado`);
    if (!delivery) throw new Error(`Delivery ${deliveryId} nao encontrado`);

    const [store, customer, motoboy] = await Promise.all([
      Store.findById(order.storeId).session(session || null),
      User.findById(order.customerId).session(session || null),
      delivery.motoboyId ? User.findById(delivery.motoboyId).session(session || null) : null,
    ]);

    if (!motoboy) throw new Error(`Motoboy nao encontrado para delivery ${deliveryId}`);

    const deliveryFee = delivery.fee || order.deliveryFee || 0;
    const invoiceNumber = await generateInvoiceNumber();

    // Endereco de entrega do cliente
    const customerAddress = (order as any).customerAddress
      || (customer as any)?.addresses?.find((a: any) => a.isDefault)
      || (customer as any)?.addresses?.[0];

    const [invoice] = await DeliveryInvoice.create(
      [
        {
          invoiceNumber,
          orderId: new Types.ObjectId(orderId),
          deliveryId: new Types.ObjectId(deliveryId),
          payoutId: payoutId ? new Types.ObjectId(payoutId) : undefined,

          motoboyId: motoboy._id,
          motoboyName: (motoboy as any).name || 'Motoboy',
          motoboyEmail: (motoboy as any).email,
          motoboyCpf: (motoboy as any).cpf,

          storeId: order.storeId,
          storeName: (store as any)?.name || 'Loja',
          storeAddress: formatAddress((store as any)?.address) || (store as any)?.address,
          storeCnpj: (store as any)?.cnpj,

          customerId: order.customerId,
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
      ],
      { session }
    );

    return invoice;
  }

  async findByOrderId(orderId: string): Promise<IDeliveryInvoice | null> {
    return DeliveryInvoice.findOne({ orderId: new Types.ObjectId(orderId) });
  }

  async findById(id: string): Promise<IDeliveryInvoice | null> {
    return DeliveryInvoice.findById(id);
  }

  async listByMotoboy(motoboyId: string, limit = 50): Promise<IDeliveryInvoice[]> {
    return DeliveryInvoice.find({ motoboyId: new Types.ObjectId(motoboyId) })
      .sort({ issuedAt: -1 })
      .limit(limit);
  }
}

export const deliveryInvoiceService = new DeliveryInvoiceService();
export default deliveryInvoiceService;
