// src/models/CustomerDebt.ts
import { Schema, model, Document, Types } from 'mongoose';

export interface ICustomerDebt extends Document {
  customerId: string;
  amount: number;
  sourceOrderId: string;
  collectedOrderId?: string;
  status: 'pending' | 'collected';
  reason: string;
  createdAt: Date;
  collectedAt?: Date;
}

const CustomerDebtSchema = new Schema<ICustomerDebt>({
  customerId: { type: String, required: true, index: true },
  amount: { type: Number, required: true, min: 0 },
  sourceOrderId: { type: String, required: true, index: true },
  collectedOrderId: { type: String, index: true },
  status: { type: String, enum: ['pending', 'collected'], default: 'pending' },
  reason: { type: String, required: true },
  collectedAt: { type: Date },
}, { timestamps: true });

CustomerDebtSchema.index({ customerId: 1, status: 1 });

export default model<ICustomerDebt>('CustomerDebt', CustomerDebtSchema);
