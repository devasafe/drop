import { Schema, model, Document, Types } from 'mongoose';

export interface ISupportTicket extends Document {
  conversationId: Types.ObjectId;
  openedBy: {
    userId: Types.ObjectId;
    role: string;
    name: string;
  };
  assignedTo: Array<{ userId: Types.ObjectId; name: string }>;
  category: 'clientes' | 'lojistas' | 'motoboys' | 'geral';
  subject: string;
  status: 'aberto' | 'em_atendimento' | 'resolvido';
  resolvedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const SupportTicketSchema = new Schema<ISupportTicket>({
  conversationId: { type: Schema.Types.ObjectId, ref: 'Conversation', required: true },
  openedBy: {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    role: { type: String, required: true },
    name: { type: String, required: true },
  },
  assignedTo: [{
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
  }],
  category: { type: String, enum: ['clientes', 'lojistas', 'motoboys', 'geral'], required: true },
  subject: { type: String, required: true, maxlength: 200 },
  status: { type: String, enum: ['aberto', 'em_atendimento', 'resolvido'], default: 'aberto' },
  resolvedAt: { type: Date },
}, { timestamps: true });

SupportTicketSchema.index({ category: 1, status: 1 });
SupportTicketSchema.index({ 'openedBy.userId': 1 });
SupportTicketSchema.index({ 'assignedTo.userId': 1, status: 1 });

export default model<ISupportTicket>('SupportTicket', SupportTicketSchema);
