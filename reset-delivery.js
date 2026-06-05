#!/usr/bin/env node

/**
 * Script para resetar um delivery para estado 'assigned' para teste
 */

const mongoose = require('mongoose');
const Delivery = require('./src/models/Delivery').default;

async function resetDelivery() {
  try {
    const MONGO_URL = process.env.MONGO_URL || 'mongodb://localhost:27017/Drop';
    
    console.log('Conectando ao MongoDB...');
    await mongoose.connect(MONGO_URL);
    console.log('✅ Conectado');

    const deliveryId = '69a6b53995cdc8476aa508ac';
    const motoboyId = '69a567db6b35b4e3b76f8be3'; // mtb id

    console.log(`\nResetando delivery: ${deliveryId}`);
    
    const result = await Delivery.updateOne(
      { _id: deliveryId },
      {
        status: 'assigned',
        statusDevolucao: null,
        pinDevolucao: null,
        motoboyId: motoboyId
      }
    );

    console.log('Resultado:', result);

    if (result.modifiedCount > 0) {
      console.log('✅ Delivery resetado para estado "assigned"');
      console.log('   Pronto para fazer teste novamente!');
    } else {
      console.log('⚠️  Nenhum delivery foi modificado');
    }

    await mongoose.connection.close();
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

resetDelivery();
