// Script para debugar e corrigir storeId
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const MONGO_URI = process.env.MONGO_URI;

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  role: String,
  roles: [String],
  activeRole: String,
  storeId: mongoose.Schema.Types.ObjectId,
}, { collection: 'users' });

const storeSchema = new mongoose.Schema({
  ownerId: mongoose.Schema.Types.ObjectId,
  name: String,
}, { collection: 'stores' });

const User = mongoose.model('User', userSchema);
const Store = mongoose.model('Store', storeSchema);

async function debugStoreIds() {
  try {
    console.log('🔗 Conectando ao MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado\n');

    // Listar todos os lojistas
    const lojistas = await User.find({ 
      roles: { $in: ['lojista'] }
    });

    console.log(`📋 LOJISTAS NO BANCO: ${lojistas.length}\n`);

    for (const lojista of lojistas) {
      console.log(`👤 ${lojista.email} (${lojista.name})`);
      console.log(`   ID: ${lojista._id}`);
      console.log(`   storeId atual: ${lojista.storeId || '❌ VAZIO'}`);
      
      // Procurar store
      const store = await Store.findOne({ ownerId: lojista._id });
      
      if (store) {
        console.log(`   ✅ Store encontrada: ${store.name} (${store._id})`);
        
        // Se storeId está vazio, linkar
        if (!lojista.storeId) {
          console.log(`   🔗 Linkando storeId...`);
          lojista.storeId = store._id;
          await lojista.save();
          console.log(`   ✅ storeId linkado!`);
        }
      } else {
        console.log(`   ❌ Nenhuma store encontrada com ownerId = ${lojista._id}`);
        
        // Procurar stores em geral
        const allStores = await Store.find({});
        console.log(`   📊 Total de stores no banco: ${allStores.length}`);
        if (allStores.length > 0) {
          console.log(`   💡 Stores existentes:`);
          allStores.forEach(s => {
            console.log(`      - ${s.name} (ownerId: ${s.ownerId})`);
          });
        }
      }
      console.log('');
    }

    console.log('✅ Processo completo!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

debugStoreIds();
