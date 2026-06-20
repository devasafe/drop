import { Schema, model, Document, Types } from 'mongoose';

export interface IOrderProduct {
  productId: Types.ObjectId;
  quantity: number;
  price: number; // snapshot price
}

export interface IOrder extends Document {
  customerId: Types.ObjectId;
  storeId: Types.ObjectId;
  products: IOrderProduct[];
  totalValue: number;
  subtotal?: number; // alias para totalValue
  deliveryFee: number;
  deliveryDistance?: number; // ✅ NOVO: Distância entre loja e cliente (km)
  status: 'criado' | 'pago' | 'aguardando_motoboy' | 'enviado' | 'entregue' | 'cancelado' | 'rejeitado';
  paymentMethod?: 'credit_card' | 'debit_card' | 'pix' | 'money' | 'cash_on_delivery'; // Método de pagamento
  debtCollected?: number; // valor de dívida cobrada neste pedido
  paymentStatus?: 'pending' | 'paid' | 'failed' | 'refunded';
  paymentId?: string; // payment gateway ID
  // ✅ Fase 2 (gateway): cobrança Asaas (entrada)
  asaasPaymentId?: string; // id da cobrança no Asaas
  asaasChargeStatus?: 'none' | 'pending' | 'received' | 'confirmed' | 'refunded' | 'chargeback';
  walletApplied?: number; // valor pago com saldo da carteira do cliente (resto vai pro PIX)
  cancellationId?: Types.ObjectId; // ref Cancellation
  idempotentKey?: string; // ✅ NOVO: Para prevenir duplicação
  
  // ✅ NOVO: Endereço e coordenadas do CLIENTE
  customerAddress?: string; // Ex: "Rua XYZ, 123 - Bairro ABC, São Paulo - SP, 01310-100"
  customerLatitude?: number;
  customerLongitude?: number;
  
  // ✅ NOVO: Cópia do endereço e coordenadas da LOJA (snapshot no momento do pedido)
  storeAddress?: string;
  storeLatitude?: number;
  storeLongitude?: number;
  
  // ✅ NOVO: Rota calculada (polyline do Google Maps)
  routePolyline?: string; // string codificada da Google
  routeWaypoints?: Array<{ lat: number; lng: number; label?: string }>;
  
  walletDistribution?: {
    storeAmount: number;
    appCommission: number;
    commissionPercent: number;
    delivery?: {
      total: number;
      motoboyAmount: number;
      appCommission: number;
      commissionPercent: number;
    };
  };
  createdAt: Date;
  acceptedAt?: Date;
  cancelledAt?: Date;
  updatedAt?: Date;
  deliveryId?: Types.ObjectId; // optional, ref Delivery
  storeRating?: number;
  storeComment?: string;
}

const OrderProductSchema = new Schema<IOrderProduct>({
  productId: { type: Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true },
  price: { type: Number, required: true }
});

const OrderSchema = new Schema<IOrder>({
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
  products: [OrderProductSchema],
  totalValue: { type: Number, required: true },
  subtotal: { type: Number },
  deliveryFee: { type: Number, required: true },
  deliveryDistance: { type: Number, default: 0 }, // ✅ NOVO: Distância em km
  status: { type: String, enum: ['criado','pago','aguardando_motoboy','enviado','entregue','cancelado','rejeitado'], default: 'criado' },
  paymentMethod: { type: String, enum: ['credit_card', 'debit_card', 'pix', 'money', 'cash_on_delivery'] },
  debtCollected: { type: Number },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed', 'refunded'], default: 'pending' },
  paymentId: { type: String },
  // ✅ Fase 2 (gateway): cobrança Asaas (entrada)
  asaasPaymentId: { type: String, index: true },
  asaasChargeStatus: { type: String, enum: ['none', 'pending', 'received', 'confirmed', 'refunded', 'chargeback'], default: 'none' },
  walletApplied: { type: Number, default: 0 },
  cancellationId: { type: Schema.Types.ObjectId, ref: 'Cancellation' },
  idempotentKey: { type: String, sparse: true, unique: true },  // ✅ NOVO
  
  // ✅ NOVO: Endereço e coordenadas do CLIENTE
  customerAddress: { type: String },
  customerLatitude: { type: Number },
  customerLongitude: { type: Number },
  
  // ✅ NOVO: Cópia do endereço e coordenadas da LOJA (snapshot no momento do pedido)
  storeAddress: { type: String },
  storeLatitude: { type: Number },
  storeLongitude: { type: Number },
  
  // ✅ NOVO: Rota calculada
  routePolyline: { type: String },
  routeWaypoints: [{
    lat: { type: Number },
    lng: { type: Number },
    label: { type: String }
  }],
  
  createdAt: { type: Date, default: Date.now },
  acceptedAt: { type: Date },
  cancelledAt: { type: Date },
  updatedAt: { type: Date, default: Date.now },
  deliveryId: { type: Schema.Types.ObjectId, ref: 'Delivery', required: false },
  walletDistribution: {
    storeAmount: { type: Number },
    appCommission: { type: Number },
    commissionPercent: { type: Number },
    delivery: {
      total: { type: Number },
      motoboyAmount: { type: Number },
      appCommission: { type: Number },
      commissionPercent: { type: Number }
    }
  },
  storeRating: { type: Number, min: 1, max: 5 },
  storeComment: { type: String },
}, { timestamps: true });

// ✅ Índices para performance das queries de analytics
OrderSchema.index({ storeId: 1, createdAt: -1 });
OrderSchema.index({ status: 1, createdAt: -1 });
OrderSchema.index({ customerId: 1, createdAt: -1 });

export default model<IOrder>('Order', OrderSchema);
