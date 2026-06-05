import mongoose, { Document, Schema } from 'mongoose';

export interface IWithdrawal extends Document {
  appCashboxId: string;
  amount: number;
  status: 'pending' | 'approved' | 'paid' | 'rejected';
  bankInfo?: {
    account: string;
    agency: string;
    bank: string;
    holderName: string;
    document: string; // CPF/CNPJ
  };
  requestedAt: Date;
  approvedAt?: Date;
  paidAt?: Date;
  rejectedAt?: Date;
  processedBy?: string; // ID do CEO que aprovou/rejeitou
  rejectionReason?: string;
  reason?: string;
}

const WithdrawalSchema = new Schema<IWithdrawal>(
  {
    appCashboxId: {
      type: String,
      required: true,
    },
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    status: {
      type: String,
      enum: ['pending', 'approved', 'paid', 'rejected'],
      default: 'pending',
    },
    bankInfo: {
      account: String,
      agency: String,
      bank: String,
      holderName: String,
      document: String,
    },
    requestedAt: {
      type: Date,
      default: Date.now,
    },
    approvedAt: Date,
    paidAt: Date,
    rejectedAt: Date,
    processedBy: String,
    rejectionReason: String,
    reason: String,
  },
  { timestamps: true }
);

// ✅ Índices para busca eficiente
WithdrawalSchema.index({ appCashboxId: 1, status: 1 });
WithdrawalSchema.index({ requestedAt: -1 });
WithdrawalSchema.index({ status: 1 });

export default mongoose.model<IWithdrawal>('Withdrawal', WithdrawalSchema);
