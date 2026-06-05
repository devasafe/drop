import { Schema, model, Document, Types } from 'mongoose';

export type AppRole = 'ceo' | 'marketing' | 'gerente_geral' | 'gerente_clientes' | 'gerente_lojistas' | 'gerente_motoboys' | 'lojista' | 'cliente' | 'motoboy';

export interface IRolePermissions extends Document {
  role: AppRole;
  permissions: string[];
  notificationTargets: AppRole[]; // quais roles pode enviar broadcast
  updatedBy: Types.ObjectId;
  updatedAt: Date;
}

const RolePermissionsSchema = new Schema<IRolePermissions>({
  role: { type: String, required: true, unique: true },
  permissions: [{ type: String }],
  notificationTargets: [{ type: String }],
  updatedBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

export default model<IRolePermissions>('RolePermissions', RolePermissionsSchema);
