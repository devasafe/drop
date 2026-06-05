// src/models/CustomerDebt.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface ICustomerDebt extends Document {
  customerId: Types.ObjectId;
  amount: number;
  sourceOrderId: Types.ObjectId;
  collectedOrderId?: Types.ObjectId;
  status: 'pending' | 'collected';
  reason: string;
  createdAt: Date;
  collectedAt?: Date;
}

const CustomerDebtSchema = new Schema<ICustomerDebt>({
  customerId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  sourceOrderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  collectedOrderId: { type: Schema.Types.ObjectId, ref: 'Order' },
  status: { type: String, enum: ['pending', 'collected'], default: 'pending' },
  reason: { type: String, required: true },
  collectedAt: { type: Date },
}, { timestamps: true });

CustomerDebtSchema.index({ customerId: 1, status: 1 });

export default model<ICustomerDebt>('CustomerDebt', CustomerDebtSchema);
