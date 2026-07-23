import { Schema, model, Document, Types } from 'mongoose';

export interface ITransaction extends Document {
  orderId: string;
  paymentMethod: string;
  amount: number;
  commissionProduct: number;
  commissionDelivery: number;
  createdAt: Date;
}

const TransactionSchema = new Schema<ITransaction>({
  orderId: { type: String, required: true, index: true },
  paymentMethod: { type: String, required: true },
  amount: { type: Number, required: true },
  commissionProduct: { type: Number, required: true },
  commissionDelivery: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now }
});

export default model<ITransaction>('Transaction', TransactionSchema);
