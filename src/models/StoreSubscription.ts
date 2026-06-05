import mongoose, { Document, Schema } from 'mongoose';

export interface IStoreSubscription extends Document {
  storeId: string; // Referência ao Store._id
  storeName: string; // Nome da loja
  currentPlan: 'plan1' | 'plan2' | 'plan3'; // Plano atual
  requestedPlan?: 'plan1' | 'plan2' | 'plan3'; // Plano que a loja pediu para trocar
  planChangeStatus: 'none' | 'pending' | 'approved' | 'rejected'; // Status da mudança
  requestedAt?: Date; // Quando a loja pediu a mudança
  approvedAt?: Date; // Quando CEO aprovou
  approvedBy?: string; // ID do CEO
  rejectionReason?: string; // Motivo da rejeição
  commissionRate?: number; // Comissão atual baseado no plano
  createdAt: Date;
  updatedAt: Date;
}

const StoreSubscriptionSchema = new Schema<IStoreSubscription>({
  storeId: {
    type: String,
    required: true,
    unique: true,
    index: true,
  },
  storeName: {
    type: String,
    required: true,
  },
  currentPlan: {
    type: String,
    enum: ['plan1', 'plan2', 'plan3'],
    default: 'plan1',
  },
  requestedPlan: {
    type: String,
    enum: ['plan1', 'plan2', 'plan3'],
  },
  planChangeStatus: {
    type: String,
    enum: ['none', 'pending', 'approved', 'rejected'],
    default: 'none',
  },
  requestedAt: Date,
  approvedAt: Date,
  approvedBy: String,
  rejectionReason: String,
  commissionRate: {
    type: Number,
    default: 10,
    min: 0,
    max: 100,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

export default mongoose.model<IStoreSubscription>('StoreSubscription', StoreSubscriptionSchema);
