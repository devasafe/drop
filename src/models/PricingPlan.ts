import mongoose from 'mongoose';

const pricingPlanSchema = new mongoose.Schema({
  // Informações do plano
  name: {
    type: String,
    enum: ['Plano 1 (Marketplace Only)', 'Plano 2 (Marketplace + Motoboys)', 'Plano 3 (Premium)'],
    required: true,
    unique: true
  },

  // Comissão da plataforma (em porcentagem)
  // Ex: 10 = 10% da plataforma, 90% para loja
  commission: {
    type: Number,
    required: true,
    default: 0,
    min: 0,
    max: 100
  },

  // Configurações de motoboys
  motorcycleTaxes: {
    basePerDelivery: {
      type: Number,
      required: true,
      default: 0
    },
    perKm: {
      type: Number,
      required: true,
      default: 0
    }
  },

  // Saque mínimo permitido
  minWithdraw: {
    type: Number,
    required: true,
    default: 0
  },

  // Metadata
  createdAt: {
    type: Date,
    default: () => new Date()
  },
  updatedAt: {
    type: Date,
    default: () => new Date()
  }
}, { collection: 'pricing_plans' });

// Atualizar updatedAt antes de salvar
pricingPlanSchema.pre('save', function(next) {
  this.updatedAt = new Date();
  next();
});

export default mongoose.model('PricingPlan', pricingPlanSchema);
