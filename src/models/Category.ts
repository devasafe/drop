import { Schema, model, Document, Types } from 'mongoose';

export interface ICategory extends Document {
  storeId: Types.ObjectId;
  name: string;
  createdAt: Date;
  updatedAt: Date;
}

const CategorySchema = new Schema<ICategory>({
  storeId: { type: Schema.Types.ObjectId, ref: 'Store', required: true },
  name: { type: String, required: true },
}, { timestamps: true });

export default model<ICategory>('Category', CategorySchema);
