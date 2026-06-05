import { Schema, model, Document, Types } from 'mongoose';

export interface ICoupon extends Document {
  code: string;
  type: 'store' | 'global';
  discountType: 'percent' | 'fixed';
  discountValue: number;
  storeId?: Types.ObjectId;
  productIds?: Types.ObjectId[];
  minOrderValue?: number;
  maxUses?: number;
  usedCount: number;
  validFrom: Date;
  validUntil: Date;
  isActive: boolean;
  createdBy: Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const CouponSchema = new Schema<ICoupon>({
  code: { type: String, required: true, unique: true, uppercase: true, trim: true },
  type: { type: String, enum: ['store', 'global'], required: true },
  discountType: { type: String, enum: ['percent', 'fixed'], required: true },
  discountValue: { type: Number, required: true, min: 0 },
  storeId: { type: Schema.Types.ObjectId, ref: 'Store' },
  productIds: [{ type: Schema.Types.ObjectId, ref: 'Product' }],
  minOrderValue: { type: Number, min: 0 },
  maxUses: { type: Number, min: 1 },
  usedCount: { type: Number, default: 0 },
  validFrom: { type: Date, required: true },
  validUntil: { type: Date, required: true },
  isActive: { type: Boolean, default: true },
  createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

CouponSchema.index({ code: 1 });
CouponSchema.index({ storeId: 1, isActive: 1 });
CouponSchema.index({ type: 1, isActive: 1 });

export default model<ICoupon>('Coupon', CouponSchema);
