import { Schema, model, Document, Types } from 'mongoose';
import { AppRole } from './RolePermissions';

export type WalletAccessStatus = 'pending' | 'approved' | 'rejected' | 'expired' | 'revoked';

export interface IWalletAccessRequest extends Document {
  requestedBy: Types.ObjectId;
  requestedByRole: AppRole;
  targetUserId: Types.ObjectId;
  reason: string;
  status: WalletAccessStatus;
  expiresAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const WalletAccessRequestSchema = new Schema<IWalletAccessRequest>({
  requestedBy:     { type: Schema.Types.ObjectId, ref: 'User', required: true },
  requestedByRole: { type: String, required: true },
  targetUserId:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
  reason:          { type: String, required: true, trim: true, maxlength: 500 },
  status:          { type: String, enum: ['pending', 'approved', 'rejected', 'expired', 'revoked'], default: 'pending', index: true },
  expiresAt:       { type: Date, default: null },
  approvedAt:      { type: Date, default: null },
  rejectedAt:      { type: Date, default: null },
  revokedAt:       { type: Date, default: null },
}, { timestamps: true });

WalletAccessRequestSchema.index({ targetUserId: 1, status: 1 });
WalletAccessRequestSchema.index({ requestedBy: 1, createdAt: -1 });

export default model<IWalletAccessRequest>('WalletAccessRequest', WalletAccessRequestSchema);
