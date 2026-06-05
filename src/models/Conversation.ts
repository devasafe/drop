import mongoose, { Schema, Document } from 'mongoose';

export interface IConversation extends Document {
  type: 'loja_cliente' | 'loja_motoboy' | 'motoboy_cliente' | 'loja_cliente_pre_compra' | 'suporte';
  supportCategory?: 'clientes' | 'lojistas' | 'motoboys' | 'geral';
  supportStatus?: 'aberto' | 'em_atendimento' | 'resolvido';
  
  // Participantes
  participant1: {
    userId: mongoose.Types.ObjectId;
    role: 'loja' | 'cliente' | 'motoboy';
    name: string;
    avatar?: string;
  };
  
  participant2: {
    userId: mongoose.Types.ObjectId;
    role: 'loja' | 'cliente' | 'motoboy';
    name: string;
    avatar?: string;
  };
  
  // Contexto
  orderId?: mongoose.Types.ObjectId;
  deliveryId?: mongoose.Types.ObjectId;
  relatedOrderNumber?: string;
  productId?: mongoose.Types.ObjectId; // 👈 NOVO: Conversa iniciada em um produto específico
  conversationType?: 'product' | 'user'; // 👈 NOVO: Type diferencia se é de produto ou usuário geral
  
  // Metadados
  messageCount: number;
  unreadCount: [number, number]; // [participant1, participant2]
  isActive: boolean;
  isBlocked: [boolean, boolean];
  isMuted: [boolean, boolean];
  deletedBy?: mongoose.Types.ObjectId[]; // 👈 NOVO: IDs dos usuários que deletaram a conversa
  lastMessageAt?: Date;
  
  // Timestamps
  createdAt: Date;
  updatedAt: Date;
}

const conversationSchema = new Schema<IConversation>(
  {
    type: {
      type: String,
      enum: ['loja_cliente', 'loja_motoboy', 'motoboy_cliente', 'loja_cliente_pre_compra', 'suporte'],
      required: true,
      index: true
    },
    supportCategory: {
      type: String,
      enum: ['clientes', 'lojistas', 'motoboys', 'geral'],
    },
    supportStatus: {
      type: String,
      enum: ['aberto', 'em_atendimento', 'resolvido'],
      default: 'aberto',
    },
    participant1: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
      },
      role: {
        type: String,
        enum: ['loja', 'cliente', 'motoboy', 'suporte', 'gerente'],
        required: true
      },
      name: {
        type: String,
        required: true
      },
      avatar: String
    },
    participant2: {
      userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true,
        index: true
      },
      role: {
        type: String,
        enum: ['loja', 'cliente', 'motoboy', 'suporte', 'gerente'],
        required: true
      },
      name: {
        type: String,
        required: true
      },
      avatar: String
    },
    orderId: {
      type: Schema.Types.ObjectId,
      ref: 'Order',
      index: true
    },
    deliveryId: {
      type: Schema.Types.ObjectId,
      ref: 'Delivery',
      index: true
    },
    relatedOrderNumber: String,
    productId: {
      type: Schema.Types.ObjectId,
      ref: 'Product',
      index: true
    },
    conversationType: {
      type: String,
      enum: ['product', 'user'],
      default: 'user'
    },
    messageCount: {
      type: Number,
      default: 0
    },
    unreadCount: {
      type: [Number],
      default: [0, 0]
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isBlocked: {
      type: [Boolean],
      default: [false, false]
    },
    isMuted: {
      type: [Boolean],
      default: [false, false]
    },
    deletedBy: {
      type: [Schema.Types.ObjectId],
      default: [],
      ref: 'User'
    },
    lastMessageAt: {
      type: Date,
      index: true
    }
  },
  { timestamps: true }
);

// Criar índices compostos para queries eficientes
conversationSchema.index({ 'participant1.userId': 1, 'participant2.userId': 1 });
conversationSchema.index({ 'participant1.userId': 1, lastMessageAt: -1 });
conversationSchema.index({ 'participant2.userId': 1, lastMessageAt: -1 });
conversationSchema.index({ orderId: 1, type: 1 });

export default mongoose.model<IConversation>('Conversation', conversationSchema);
