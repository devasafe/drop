import mongoose, { Schema, Document } from 'mongoose';

export interface IMessage extends Document {
  conversationId: mongoose.Types.ObjectId;
  
  // Autor
  senderId: mongoose.Types.ObjectId;
  senderRole: 'loja' | 'lojista' | 'cliente' | 'motoboy' | 'suporte';
  senderName: string;
  
  // Conteúdo
  text: string;
  attachments?: Array<{
    type: 'image' | 'location' | 'file';
    url: string;
    metadata?: {
      latitude?: number;
      longitude?: number;
      accuracy?: number;
      fileName?: string;
      fileSize?: number;
    };
  }>;
  
  // Status
  status: 'sent' | 'delivered' | 'read';
  readAt?: Date;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const messageSchema = new Schema<IMessage>(
  {
    conversationId: {
      type: Schema.Types.ObjectId,
      ref: 'Conversation',
      required: true,
      index: true
    },
    senderId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    senderRole: {
      type: String,
      enum: ['loja', 'lojista', 'cliente', 'motoboy', 'suporte'],
      required: true
    },
    senderName: {
      type: String,
      required: true
    },
    text: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    attachments: [
      {
        type: {
          type: String,
          enum: ['image', 'location', 'file']
        },
        url: String,
        metadata: {
          latitude: Number,
          longitude: Number,
          accuracy: Number,
          fileName: String,
          fileSize: Number
        }
      }
    ],
    status: {
      type: String,
      enum: ['sent', 'delivered', 'read'],
      default: 'sent',
      index: true
    },
    readAt: Date
  },
  { timestamps: true }
);

// Índices para queries rápidas
messageSchema.index({ conversationId: 1, createdAt: -1 });
messageSchema.index({ senderId: 1, createdAt: -1 });
messageSchema.index({ conversationId: 1, status: 1 });

// Auto-delete mensagens após 90 dias (opcional, comentado por padrão)
// messageSchema.index(
//   { createdAt: 1 },
//   { expireAfterSeconds: 90 * 24 * 60 * 60 }
// );

export default mongoose.model<IMessage>('Message', messageSchema);
