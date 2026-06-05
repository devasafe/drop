import mongoose, { Document, Schema } from 'mongoose';

export interface IAppCashboxHistory {
  type: 'income' | 'expense' | 'withdrawal' | 'deposit' | 'refund';
  source: 'product_commission' | 'delivery_commission' | 'manual_deposit' | 'manual_withdrawal' | 'withdrawal_fee' | 'cancelled_order' | 'cancelled_delivery' | 'coupon_discount' | 'order_payment' | 'order_refund' | 'payout_paid' | 'store_payout_reserved' | 'motoboy_payout_reserved';
  amount: number;
  orderId?: string;
  deliveryId?: string;
  withdrawalId?: string;
  reason?: string;
  date: Date;
}

export interface IAppCashbox extends Document {
  balance: number; // Saldo atual
  totalIncome: number; // Renda acumulada
  totalExpenses: number; // Despesas acumuladas
  history: IAppCashboxHistory[];
  createdAt: Date;
  updatedAt: Date;
}

const AppCashboxHistorySchema = new Schema<IAppCashboxHistory>({
  type: {
    type: String,
    enum: ['income', 'expense', 'withdrawal', 'deposit', 'refund'],
    required: true,
  },
  source: {
    type: String,
    enum: ['product_commission', 'delivery_commission', 'manual_deposit', 'manual_withdrawal', 'withdrawal_fee', 'cancelled_order', 'cancelled_delivery', 'coupon_discount', 'order_payment', 'order_refund', 'payout_paid', 'store_payout_reserved', 'motoboy_payout_reserved'],
    required: true,
  },
  amount: {
    type: Number,
    required: true,
  },
  orderId: String,
  deliveryId: String,
  withdrawalId: String,
  reason: String,
  date: {
    type: Date,
    default: Date.now,
  },
});

const AppCashboxSchema = new Schema<IAppCashbox>(
  {
    balance: {
      type: Number,
      default: 0,
    },
    totalIncome: {
      type: Number,
      default: 0,
    },
    totalExpenses: {
      type: Number,
      default: 0,
    },
    history: [AppCashboxHistorySchema],
  },
  { timestamps: true }
);

// ✅ Índice para buscar histórico por ordenação
AppCashboxSchema.index({ 'history.date': -1 });
AppCashboxSchema.index({ 'history.orderId': 1 });
AppCashboxSchema.index({ 'history.deliveryId': 1 });

export default mongoose.model<IAppCashbox>('AppCashbox', AppCashboxSchema);
