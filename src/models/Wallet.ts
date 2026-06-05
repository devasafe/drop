import { Schema, model, Document } from 'mongoose';

export interface IWallet extends Document {
  // Identificação
  owner: string; // userId ou storeId
  ownerType: 'user' | 'store' | 'platform' | 'motoboy';

  // Saldos
  balance: number; // Saldo atual
  totalIncome: number; // Total que entrou
  totalSpent: number; // Total que saiu
  blockedBalance: number; // reservado para garantia de fee de cancelamento tardio (COD)
  availableBalance: number; // soma dos Payouts released (disponivel pra saque - store/motoboy)
  pendingBalance: number; // soma dos Payouts pending (aguardando entrega - store/motoboy)

  // Para lojistas: dados de taxa
  platformFeeRate?: number; // % de taxa (15, 20, 30)

  // Para motoboys: benefícios gamificação
  gamificationBenefits?: {
    freeDeliveriesAvailable: number;
    discountPercentage: number;
    lastRedeemedAt?: Date;
  };

  // Histórico transacional
  history: Array<{
    date: Date;
    type: 'credit' | 'debit' | 'refund';
    category?: 'deposit' | 'withdrawal' | 'payment' | 'refund' | 'transfer' | 'penalty'; // ✅ Adicionado 'penalty' para multas
    amount: number;
    reason: string;
    paymentMethod?: string; // Ex: 'credit_card', 'pix', 'bank_transfer', 'wallet'
    relatedId?: string; // orderId, deliveryId, etc
    reference?: string;
  }>;

  createdAt: Date;
  updatedAt: Date;
}

const walletSchema = new Schema<IWallet>({
  owner: { type: String, required: true, index: true },
  ownerType: {
    type: String,
    enum: ['user', 'store', 'platform', 'motoboy'],
    required: true,
    index: true
  },

  balance: { type: Number, default: 0, min: 0 },
  totalIncome: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  blockedBalance: { type: Number, default: 0, min: 0 },
  availableBalance: { type: Number, default: 0 },
  pendingBalance: { type: Number, default: 0 },

  platformFeeRate: { type: Number },

  gamificationBenefits: {
    freeDeliveriesAvailable: { type: Number, default: 0 },
    discountPercentage: { type: Number, default: 0 },
    lastRedeemedAt: Date
  },

  history: [
    {
      date: { type: Date, default: Date.now },
      type: { type: String, enum: ['credit', 'debit', 'refund'], required: true },
      category: { type: String, default: null },  // Removed enum to allow null for backward compatibility
      amount: { type: Number, required: true },
      reason: { type: String, required: true },
      paymentMethod: String,
      relatedId: String,
      reference: String
    }
  ],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

// Índices para performance
walletSchema.index({ owner: 1, ownerType: 1 }, { unique: true });
walletSchema.index({ 'history.date': -1 });

export default model<IWallet>('Wallet', walletSchema);
