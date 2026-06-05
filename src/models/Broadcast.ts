import { Schema, model, Document, Types } from 'mongoose';

export interface IBroadcast extends Document {
  title: string;
  body: string;
  targetRoles: string[];
  createdBy: Types.ObjectId;
  deliveryCount: number;
  sentAt: Date;
  createdAt: Date;
}

const BroadcastSchema = new Schema<IBroadcast>({
  title: { type: String, required: true, maxlength: 200 },
  body: { type: String, required: true, maxlength: 2000 },
  targetRoles: [{ type: String }],
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  deliveryCount: { type: Number, default: 0 },
  sentAt: { type: Date, default: Date.now },
}, { timestamps: true });

BroadcastSchema.index({ sentAt: -1 });

export default model<IBroadcast>('Broadcast', BroadcastSchema);
