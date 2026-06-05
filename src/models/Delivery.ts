import { Schema, model, Document, Types } from 'mongoose';


export interface IDelivery extends Document {
  orderId: Types.ObjectId;
  motoboyId?: Types.ObjectId;
  distance: number;
  fee: number;
  status: 'pending' | 'assigned' | 'picked' | 'delivered' | 'cancelled';
  createdAt: Date;
  updatedAt?: Date;
  cancelledAt?: Date;
  pin?: string;
  pinRetirada?: string; // PIN de retirada na loja
  pinDevolucao?: string; // ✅ PIN para devolver o produto na loja
  statusDevolucao?: 'pending' | 'aguardando_confirmacao' | 'confirmado'; // ✅ Status da devolução
  dataConfirmacaoDevolucao?: Date; // ✅ Quando a loja confirmou a devolução
  pendingReturnAction?: 'reassign' | 'cancel'; // ação a executar após confirmar devolução
  rating?: number; // 1 a 5 estrelas
  comment?: string; // comentário do cliente
  
  // ✅ NOVO: Endereço e coordenadas (cópia do Order para garantir dados originais)
  storeAddress?: string;
  storeLatitude?: number;
  storeLongitude?: number;
  customerAddress?: string;
  customerLatitude?: number;
  customerLongitude?: number;
  routePolyline?: string; // Polyline da rota
}


const DeliverySchema = new Schema<IDelivery>({
  orderId: { type: Schema.Types.ObjectId, ref: 'Order', required: true },
  motoboyId: { type: Schema.Types.ObjectId, ref: 'User' },
  distance: { type: Number, default: 0 },
  fee: { type: Number, required: true },
  status: { type: String, enum: ['pending','assigned','picked','delivered','cancelled'], default: 'pending' },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
  cancelledAt: { type: Date },
  pin: { type: String },
  pinRetirada: { type: String },
  pinDevolucao: { type: String }, // ✅ PIN para devolver
  statusDevolucao: { type: String, enum: ['pending', 'aguardando_confirmacao', 'confirmado'], default: 'pending' }, // ✅ Status devolução
  dataConfirmacaoDevolucao: { type: Date }, // ✅ Data de confirmação
  pendingReturnAction: { type: String, enum: ['reassign', 'cancel'] }, // ação pós-devolução
  rating: { type: Number, min: 1, max: 5 },
  comment: { type: String },
  
  // ✅ NOVO: Endereço e coordenadas (snapshot do Order para dados originais)
  storeAddress: { type: String },
  storeLatitude: { type: Number },
  storeLongitude: { type: Number },
  customerAddress: { type: String },
  customerLatitude: { type: Number },
  customerLongitude: { type: Number },
  routePolyline: { type: String },
}, { timestamps: true });

export default model<IDelivery>('Delivery', DeliverySchema);
