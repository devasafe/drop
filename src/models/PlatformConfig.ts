import mongoose, { Document, Schema } from 'mongoose';

export interface IPlatformConfig extends Document {
  // Comissões por plano
  commissionPlan1: number; // Plano 1: Marketplace Only (%)
  commissionPlan2: number; // Plano 2: Marketplace + Motoboys (%)
  commissionPlan3: number; // Plano 3: Premium (%)

  // Ganhos Motoboy
  motoboyCutPerDelivery: number; // Ganho base por entrega (R$)
  motoboyCutPerKm: number; // Taxa por km (R$ / km)
  motoboyMinimumWithdraw: number; // Valor mínimo de saque (R$)

  // ✨ NOVO: Comissão do Motoboy para o App
  motoboyCommissionPercent: number; // % da taxa de entrega que o app fica (ex: 20%)

  // Taxa de cancelamento tardio
  lateCancellationFeePercent: number; // % do total do pedido cobrado como taxa
  lateCancellationMotoboyShare: number; // % da taxa que vai ao motoboy como compensação

  // Controle de payouts
  autoApprovePayouts: boolean; // true = payout vira 'released' automaticamente na entrega

  // Controle de saques
  autoApproveWithdrawals: boolean; // true = saque solicitado é aprovado/processado automaticamente

  // Tema sazonal
  seasonalTheme: string; // 'none' | 'natal' | 'pascoa' | 'junina' | 'halloween'

  // Metadata
  updatedAt: Date;
  updatedBy: string; // ID do CEO que fez a alteração
}

const PlatformConfigSchema = new Schema<IPlatformConfig>({
  commissionPlan1: {
    type: Number,
    default: 10, // 10% default
    min: 0,
    max: 100,
  },
  commissionPlan2: {
    type: Number,
    default: 15, // 15% default
    min: 0,
    max: 100,
  },
  commissionPlan3: {
    type: Number,
    default: 5, // 5% default para premium
    min: 0,
    max: 100,
  },
  motoboyCutPerDelivery: {
    type: Number,
    default: 5, // R$ 5 default
    min: 0,
  },
  motoboyCutPerKm: {
    type: Number,
    default: 1, // R$ 1/km default
    min: 0,
  },
  motoboyMinimumWithdraw: {
    type: Number,
    default: 50, // R$ 50 default
    min: 0,
  },
  motoboyCommissionPercent: {
    type: Number,
    default: 20, // ✨ NOVO: 20% default - comissão do app sobre entrega do motoboy
    min: 0,
    max: 100,
  },
  lateCancellationFeePercent: {
    type: Number,
    default: 10, // 10% do total do pedido
    min: 0,
    max: 100,
  },
  lateCancellationMotoboyShare: {
    type: Number,
    default: 50, // 50% da taxa vai para o motoboy como compensação
    min: 0,
    max: 100,
  },
  autoApprovePayouts: {
    type: Boolean,
    default: false, // começa manual — admin aprova cada payout
  },
  autoApproveWithdrawals: {
    type: Boolean,
    default: false, // começa manual — admin aprova cada saque
  },
  seasonalTheme: {
    type: String,
    default: 'none',
    enum: ['none', 'natal', 'pascoa', 'junina', 'halloween'],
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
  updatedBy: {
    type: String,
    required: true,
  },
});

export default mongoose.model<IPlatformConfig>('PlatformConfig', PlatformConfigSchema);
