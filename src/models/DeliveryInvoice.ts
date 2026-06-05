import mongoose, { Document, Schema, Types } from 'mongoose';

export type DeliveryInvoiceStatus = 'issued' | 'cancelled';

export interface IDeliveryInvoice extends Document {
  invoiceNumber: string;              // NS-000001 (sequencial)
  orderId: Types.ObjectId;
  deliveryId: Types.ObjectId;
  payoutId?: Types.ObjectId;

  // Prestador do servico
  motoboyId: Types.ObjectId;
  motoboyName: string;
  motoboyEmail?: string;
  motoboyCpf?: string;

  // Tomador do servico (loja que contrata)
  storeId: Types.ObjectId;
  storeName: string;
  storeAddress?: string;
  storeCnpj?: string;

  // Destinatario (cliente final que recebeu)
  customerId: Types.ObjectId;
  customerName: string;
  customerAddress?: string;

  // Dados do servico
  serviceDescription: string;
  distance?: number;                  // km
  deliveryFee: number;                // total cobrado ao cliente
  motoboyAmount: number;              // valor que o motoboy recebeu
  appCommission: number;              // comissao da plataforma
  commissionPercent: number;

  // Timestamps do servico
  pickedAt?: Date;
  deliveredAt?: Date;
  issuedAt: Date;

  status: DeliveryInvoiceStatus;
  createdAt: Date;
  updatedAt: Date;
}

const DeliveryInvoiceSchema = new Schema<IDeliveryInvoice>(
  {
    invoiceNumber: { type: String, required: true, unique: true },
    orderId: { type: Schema.Types.ObjectId, required: true, ref: 'Order' },
    deliveryId: { type: Schema.Types.ObjectId, required: true, ref: 'Delivery' },
    payoutId: { type: Schema.Types.ObjectId, ref: 'Payout' },

    motoboyId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    motoboyName: { type: String, required: true },
    motoboyEmail: { type: String },
    motoboyCpf: { type: String },

    storeId: { type: Schema.Types.ObjectId, required: true, ref: 'Store' },
    storeName: { type: String, required: true },
    storeAddress: { type: String },
    storeCnpj: { type: String },

    customerId: { type: Schema.Types.ObjectId, required: true, ref: 'User' },
    customerName: { type: String, required: true },
    customerAddress: { type: String },

    serviceDescription: {
      type: String,
      default: 'Servico de entrega rapida por motoboy',
    },
    distance: { type: Number },
    deliveryFee: { type: Number, required: true },
    motoboyAmount: { type: Number, required: true },
    appCommission: { type: Number, required: true },
    commissionPercent: { type: Number, required: true },

    pickedAt: { type: Date },
    deliveredAt: { type: Date },
    issuedAt: { type: Date, default: Date.now },

    status: {
      type: String,
      enum: ['issued', 'cancelled'],
      default: 'issued',
    },
  },
  { timestamps: true }
);

DeliveryInvoiceSchema.index({ motoboyId: 1, issuedAt: -1 });
DeliveryInvoiceSchema.index({ orderId: 1 });
DeliveryInvoiceSchema.index({ deliveryId: 1 });
DeliveryInvoiceSchema.index({ storeId: 1, issuedAt: -1 });

export default mongoose.model<IDeliveryInvoice>('DeliveryInvoice', DeliveryInvoiceSchema);
