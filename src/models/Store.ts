import { Schema, model, Document, Types } from 'mongoose';

export interface IOperatingHoursDay {
  open: string;   // ex: "08:00"
  close: string;  // ex: "22:00"
  closed: boolean;
}

export interface IStore extends Document {
  ownerId: Types.ObjectId;
  name: string;
  address?: string;
  street?: string;
  number?: string;
  neighborhood?: string;
  city?: string;
  state?: string;
  zip?: string;
  cnpj?: string;
  latitude?: string;
  longitude?: string;
  stockType: 'internal' | 'api';
  apiConfig?: any;
  plan?: number;
  planSince?: Date;
  planExpiresAt?: Date;
  customCommissionRate?: number;
  featuredBannerUrl?: string;
  coverBannerUrl?: string;
  operatingHours?: {
    monday?: IOperatingHoursDay;
    tuesday?: IOperatingHoursDay;
    wednesday?: IOperatingHoursDay;
    thursday?: IOperatingHoursDay;
    friday?: IOperatingHoursDay;
    saturday?: IOperatingHoursDay;
    sunday?: IOperatingHoursDay;
  };
  isOpen: boolean; // toggle manual (feriados, emergências)
  createdAt?: Date;
  updatedAt?: Date;
}

const StoreSchema = new Schema<IStore>({
  ownerId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  address: { type: String },
  street: { type: String },
  number: { type: String },
  neighborhood: { type: String },
  city: { type: String },
  state: { type: String },
  zip: { type: String },
  cnpj: { type: String },
  latitude: { type: String },
  longitude: { type: String },
  stockType: { type: String, enum: ['internal', 'api'], default: 'internal' },
  apiConfig: { type: Schema.Types.Mixed },
  plan: { type: Number, enum: [1, 2, 3], default: 1, index: true }, // ✅ NOVO: Plano de loja
  planSince: { type: Date, default: Date.now }, // ✅ NOVO
  planExpiresAt: { type: Date }, // ✅ NOVO
  customCommissionRate: { type: Number }, // ✅ NOVO: % customizada
  featuredBannerUrl: { type: String },
  coverBannerUrl: { type: String },
  operatingHours: {
    monday:    { open: String, close: String, closed: { type: Boolean, default: false } },
    tuesday:   { open: String, close: String, closed: { type: Boolean, default: false } },
    wednesday: { open: String, close: String, closed: { type: Boolean, default: false } },
    thursday:  { open: String, close: String, closed: { type: Boolean, default: false } },
    friday:    { open: String, close: String, closed: { type: Boolean, default: false } },
    saturday:  { open: String, close: String, closed: { type: Boolean, default: false } },
    sunday:    { open: String, close: String, closed: { type: Boolean, default: false } },
  },
  isOpen: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

export default model<IStore>('Store', StoreSchema);
