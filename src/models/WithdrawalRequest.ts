import mongoose, { Document, Schema } from 'mongoose';

export interface IWithdrawalRequest extends Document {
  motoboyId: string; // ID do motoboy
  motoboyName: string; // Nome do motoboy
  motoboyEmail: string; // Email do motoboy
  amount: number; // Valor solicitado
  status: 'pending' | 'approved' | 'rejected' | 'processed'; // Status
  bankAccount?: {
    bankName: string;
    accountType: string; // 'checking' ou 'savings'
    accountNumber: string;
    routingNumber: string;
    ownerName: string;
  };
  requestedAt: Date;
  approvedAt?: Date;
  approvedBy?: string; // ID do CEO
  rejectionReason?: string;
  processedAt?: Date;
  transactionId?: string; // ID da transação na carteira do CEO
  payoutIds?: string[]; // IDs dos Payouts vinculados a este saque
}

const WithdrawalRequestSchema = new Schema<IWithdrawalRequest>({
  motoboyId: {
    type: String,
    required: true,
    index: true,
  },
  motoboyName: {
    type: String,
    required: true,
  },
  motoboyEmail: {
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
    enum: ['pending', 'approved', 'rejected', 'processed'],
    default: 'pending',
  },
  bankAccount: {
    bankName: String,
    accountType: String,
    accountNumber: String,
    routingNumber: String,
    ownerName: String,
  },
  requestedAt: {
    type: Date,
    default: Date.now,
  },
  approvedAt: Date,
  approvedBy: String,
  rejectionReason: String,
  processedAt: Date,
  transactionId: String,
  payoutIds: [{ type: String }],
});

export default mongoose.model<IWithdrawalRequest>('WithdrawalRequest', WithdrawalRequestSchema);
