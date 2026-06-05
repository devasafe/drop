import { Schema, model, Document, Types } from 'mongoose';

export interface INotification extends Document {
  userId: Types.ObjectId;
  message: string;
  title?: string;
  type: 'system' | 'broadcast' | 'order' | 'chat';
  broadcastId?: Types.ObjectId;
  createdAt: Date;
  read: boolean;
}

const NotificationSchema = new Schema<INotification>({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  message: { type: String, required: true },
  title: { type: String },
  type: { type: String, enum: ['system', 'broadcast', 'order', 'chat'], default: 'system' },
  broadcastId: { type: Schema.Types.ObjectId, ref: 'Broadcast' },
  createdAt: { type: Date, default: Date.now },
  read: { type: Boolean, default: false }
});

NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, read: 1 });

export default model<INotification>('Notification', NotificationSchema);
