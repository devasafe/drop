import { Schema, model, Document, Types } from 'mongoose';

export interface ICancellation extends Document {
  orderId: Types.ObjectId;
  deliveryId?: Types.ObjectId;
  cancelledBy: 'customer' | 'motoboy' | 'store' | 'admin'; // quem cancelou
  reason: string; // motivo do cancelamento
  reasonCode: string; // código para categorização (ex: 'customer_request', 'not_available', 'store_busy')
  details?: string; // detalhes adicionais
  refundAmount?: number; // valor reembolsado
  refundStatus?: 'pending' | 'processed' | 'failed'; // status do reembolso
  isLateCancellation?: boolean; // se é cancelamento tardio (pedido já em 'enviado')
  lateCancellationFee?: number; // valor da taxa cobrada
  createdAt: Date;
  updatedAt: Date;
}

const CancellationSchema = new Schema<ICancellation>({
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  deliveryId: { type: Schema.Types.ObjectId, ref: 'Delivery' },
  cancelledBy: { 
    type: String, 
    enum: ['customer', 'motoboy', 'store', 'admin'], 
    required: true 
  },
  reason: { type: String, required: true },
  reasonCode: { 
    type: String, 
    enum: [
      'customer_request', // Cliente solicitou cancelamento
      'not_available', // Produto não está mais disponível
      'store_closed', // Loja fechou
      'store_busy', // Loja muito ocupada
      'motoboy_unavailable', // Motoboy indisponível
      'delivery_failed', // Falha na entrega
      'customer_unreachable', // Cliente não contactável
      'address_invalid', // Endereço inválido
      'payment_issue', // Problema de pagamento
      'wrong_order', // Pedido errado
      'damaged_items', // Itens danificados
      'motoboy_rejected', // ✅ FIX #6: Motoboy rejeitou (quer devolver)
      'store_rejected', // ✅ FIX #6: Loja rejeitou (quer devolver)
      'late_cancellation', // Cancelamento tardio (pedido já em 'enviado')
      'other' // Outro motivo
    ],
    required: true
  },
  details: { type: String },
  refundAmount: { type: Number },
  isLateCancellation: { type: Boolean, default: false },
  lateCancellationFee: { type: Number },
  refundStatus: { 
    type: String, 
    enum: ['pending', 'processed', 'failed'],
    default: 'pending'
  },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Index para queries rápidas
CancellationSchema.index({ orderId: 1 });
CancellationSchema.index({ deliveryId: 1 });
CancellationSchema.index({ cancelledBy: 1 });
CancellationSchema.index({ createdAt: -1 });

export default model<ICancellation>('Cancellation', CancellationSchema);
