// Script para linkar storeId aos usuários lojistas
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const MONGO_URI = process.env.MONGO_URI;

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  role: String,
  roles: [String],
  storeId: mongoose.Schema.Types.ObjectId,
}, { collection: 'users' });

const storeSchema = new mongoose.Schema({
  ownerId: mongoose.Schema.Types.ObjectId,
  name: String,
}, { collection: 'stores' });

const User = mongoose.model('User', userSchema);
const Store = mongoose.model('Store', storeSchema);

async function linkStoreIds() {
  try {
    console.log('🔗 Conectando ao MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado\n');

    // Encontrar todos os usuários lojistas
    const lojistas = await User.find({ 
      roles: { $in: ['lojista'] },
      storeId: null  // Que não têm storeId ainda
    });

    console.log(`📋 Encontrados ${lojistas.length} lojistas sem storeId\n`);

    for (const lojista of lojistas) {
      console.log(`🔍 Procurando store para: ${lojista.email}`);
      
      // Procurar store com ownerId = userId
      const store = await Store.findOne({ ownerId: lojista._id });
      
      if (store) {
        console.log(`  ✅ Store encontrada: ${store.name}`);
        
        // Linkar storeId ao user
        lojista.storeId = store._id;
        await lojista.save();
        console.log(`  ✅ storeId linkado: ${store._id}\n`);
      } else {
        console.log(`  ❌ Nenhuma store encontrada para este usuário`);
        console.log(`     (Talvez precisa criar uma store primeiro)\n`);
      }
    }

    console.log('✅ Processo completo!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

linkStoreIds();
