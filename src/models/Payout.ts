import mongoose, { Document, Schema, Types } from 'mongoose';

export type PayoutStatus = 'pending' | 'released' | 'requested' | 'paid' | 'cancelled';
export type PayoutRecipientType = 'store' | 'motoboy';
export type PayoutGatewayProvider = 'manual' | 'asaas' | 'pagarme' | 'efi';

export interface IPayout extends Document {
  recipientType: PayoutRecipientType;
  recipientId: Types.ObjectId;
  orderId: Types.ObjectId;
  deliveryId?: Types.ObjectId;
  amount: number;
  currency: string;
  status: PayoutStatus;
  releasedAt: Date | null;
  requestedAt: Date | null;
  paidAt: Date | null;
  cancelledAt: Date | null;
  cancelReason?: string;
  gatewayProvider: PayoutGatewayProvider;
  gatewayTransferId: string | null;
  withdrawalRequestId: Types.ObjectId | null;
  blocked: boolean;
  blockReason?: string;
  blockedAt?: Date | null;
  blockedBy?: string;
  createdAt: Date;
  updatedAt: Date;
}

const PayoutSchema = new Schema<IPayout>(
  {
    recipientType: {
      type: String,
      enum: ['store', 'motoboy'],
      required: true,
    },
    recipientId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    orderId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    deliveryId: {
      type: Schema.Types.ObjectId,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    currency: {
      type: String,
      default: 'BRL',
    },
    status: {
      type: String,
      enum: ['pending', 'released', 'requested', 'paid', 'cancelled'],
      default: 'pending',
    },
    releasedAt: { type: Date, default: null },
    requestedAt: { type: Date, default: null },
    paidAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String },
    gatewayProvider: {
      type: String,
      enum: ['manual', 'asaas', 'pagarme', 'efi'],
      default: 'manual',
    },
    gatewayTransferId: { type: String, default: null },
    withdrawalRequestId: {
      type: Schema.Types.ObjectId,
      default: null,
    },
    blocked: { type: Boolean, default: false },
    blockReason: { type: String },
    blockedAt: { type: Date, default: null },
    blockedBy: { type: String },
  },
  { timestamps: true }
);

PayoutSchema.index({ recipientType: 1, recipientId: 1, status: 1 });
PayoutSchema.index({ orderId: 1 });
PayoutSchema.index({ status: 1, releasedAt: 1 });
PayoutSchema.index({ withdrawalRequestId: 1 });

export default mongoose.model<IPayout>('Payout', PayoutSchema);
