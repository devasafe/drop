import { Schema, model, Document, Types } from 'mongoose';

export interface IProduct extends Document {
  storeId: Types.ObjectId;
  name: string;
  description?: string;
  price: number;
  quantity: number;
  image?: string;
  images?: string[];
  video?: string;
  category?: Types.ObjectId | any;
  subCategory?: string;
  tags?: string[];
  createdAt: Date;
  updatedAt: Date;
}

const ProductSchema = new Schema<IProduct>({
  storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
  name: { type: String, required: true },
  description: { type: String },
  price: { type: Number, required: true },
  quantity: { type: Number, default: 0 },
  category: { type: Schema.Types.ObjectId, ref: 'Category' },
  subCategory: { type: String },
  tags: [{ type: String }],
  images: [{ type: String }],
  video: { type: String }
}, { timestamps: true });

// optional image URL (retrocompatibilidade)
ProductSchema.add({ image: { type: String } } as any);

export default model<IProduct>('Product', ProductSchema);
