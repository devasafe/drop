import { Schema, model, Document, Types } from 'mongoose';

interface IPrizeEntry {
  position: number;
  amount: number;
  type: 'wallet' | 'manual';
}

export interface IRankingPrize extends Document {
  month: number;
  year: number;
  prizes: IPrizeEntry[];
  distributed: boolean;
  distributedAt?: Date;
  distributedBy?: string;
  createdBy: string;
}

const RankingPrizeSchema = new Schema<IRankingPrize>({
  month: { type: Number, required: true, min: 1, max: 12 },
  year: { type: Number, required: true },
  prizes: [{
    position: { type: Number, required: true },
    amount: { type: Number, required: true, min: 0 },
    type: { type: String, enum: ['wallet', 'manual'], default: 'wallet' },
  }],
  distributed: { type: Boolean, default: false },
  distributedAt: { type: Date },
  distributedBy: { type: String },
  createdBy: { type: String, required: true },
}, { timestamps: true });

RankingPrizeSchema.index({ month: 1, year: 1 }, { unique: true });

export default model<IRankingPrize>('RankingPrize', RankingPrizeSchema);
