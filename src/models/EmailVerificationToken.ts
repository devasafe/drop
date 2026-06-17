import { Schema, model, Document } from 'mongoose';

export interface IEmailVerificationToken extends Document {
  userId: string;
  tokenHash: string;  // nunca guardar o token em texto puro
  expiresAt: Date;
  createdAt: Date;
}

const EmailVerificationTokenSchema = new Schema<IEmailVerificationToken>({
  userId: { type: String, required: true, index: true },
  tokenHash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

// TTL: expira sozinho
EmailVerificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model<IEmailVerificationToken>('EmailVerificationToken', EmailVerificationTokenSchema);
