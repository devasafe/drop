import { Schema, model, Document } from 'mongoose';

export interface IOtpCode extends Document {
  userId: string;
  channel: 'whatsapp';
  e164: string;
  codeHash: string;   // nunca guardar o código em texto puro
  attempts: number;
  expiresAt: Date;
  createdAt: Date;
}

const OtpCodeSchema = new Schema<IOtpCode>({
  userId: { type: String, required: true, index: true },
  channel: { type: String, enum: ['whatsapp'], default: 'whatsapp' },
  e164: { type: String, required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});

// TTL: o documento some sozinho quando expiresAt é atingido
OtpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export default model<IOtpCode>('OtpCode', OtpCodeSchema);
