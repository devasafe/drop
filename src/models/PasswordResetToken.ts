import { Schema, model, Document } from 'mongoose';

export interface IPasswordResetToken extends Document {
  userId: string;
  tokenHash: string; // nunca guardar o código em texto puro
  expiresAt: Date;
  createdAt: Date;
}

const PasswordResetTokenSchema = new Schema<IPasswordResetToken>({
  userId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

// TTL: expira sozinho
PasswordResetTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model<IPasswordResetToken>('PasswordResetToken', PasswordResetTokenSchema);
