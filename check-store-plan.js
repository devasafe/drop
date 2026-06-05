const mongoose = require('mongoose');
const fs = require('fs');
const path = require('path');

// Conectar ao MongoDB
mongoose.connect('mongodb://localhost:27017/drop-marketplace', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

// Importar modelos compilados
const Store = require('./dist/models/Store').default;
const PricingPlan = require('./dist/models/PricingPlan').default;
const User = require('./dist/models/User').default;

async function checkStorePlan() {
  try {
    console.log('🔍 Buscando lojas...\n');
    
    const stores = await Store.find().lean().limit(5);
    
    for (const store of stores) {
      console.log(`📦 Loja: ${store.name} (ID: ${store._id})`);
      console.log(`   Plan: ${store.plan || 'N/A'}`);
      console.log(`   Custom Commission: ${store.customCommissionRate || 'N/A'}`);
      
      // Buscar usuário owner
      const owner = await User.findById(store.ownerId).populate('planId');
      if (owner && owner.planId) {
        const plan = await PricingPlan.findById(owner.planId);
        console.log(`   Owner Plan Commission: ${plan?.commission || 'N/A'}%`);
      }
      console.log('');
    }
    
    // Também listar todos os planos disponíveis
    console.log('\n💳 Planos disponíveis:');
    const plans = await PricingPlan.find().lean();
    for (const plan of plans) {
      console.log(`   ${plan.name}: ${plan.commission}% comissão`);
    }
    
    mongoose.connection.close();
  } catch (err) {
    console.error('❌ Erro:', err.message);
    mongoose.connection.close();
    process.exit(1);
  }
}

checkStorePlan();
