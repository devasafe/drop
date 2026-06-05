// Script para debugar endereços
const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const MONGO_URI = process.env.MONGO_URI;

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  addresses: [
    {
      label: String,
      street: String,
      number: String,
      neighborhood: String,
      city: String,
      state: String,
      cep: String,
      latitude: String,
      longitude: String,
      isDefault: Boolean,
      _id: mongoose.Schema.Types.ObjectId
    }
  ]
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

async function debugAddresses() {
  try {
    console.log('🔗 Conectando ao MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado\n');

    // Buscar usuário CEO
    const user = await User.findOne({ email: 'ceo@ceo' });
    
    if (!user) {
      console.log('❌ Usuário não encontrado');
      process.exit(1);
    }

    console.log('👤 Usuário:', user.name);
    console.log('📍 Total de endereços no DB:', (user.addresses || []).length);
    
    if (user.addresses && user.addresses.length > 0) {
      console.log('\n📋 Endereços:');
      user.addresses.forEach((addr, idx) => {
        console.log(`\n  [${idx}] ID: ${addr._id}`);
        console.log(`      Label: ${addr.label || '(nenhum)'}`);
        console.log(`      Endereço: ${addr.street}, ${addr.number}`);
        console.log(`      Cidade: ${addr.city} - ${addr.state}`);
        console.log(`      CEP: ${addr.cep}`);
        console.log(`      Lat/Lng: ${addr.latitude}, ${addr.longitude}`);
        console.log(`      isDefault: ${addr.isDefault}`);
      });
    } else {
      console.log('❌ Nenhum endereço encontrado');
    }

    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

debugAddresses();
