// Script para copiar permissões do CEO antigo para o novo
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
  permissions: [String],
  status: String,
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

async function copyPermissions() {
  try {
    console.log('🔗 Conectando ao MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado\n');

    // Encontrar CEO antigo
    const ceoAntigo = await User.findOne({ email: 'ceo@admin.com' });
    
    if (!ceoAntigo) {
      console.log('❌ CEO antigo não encontrado (ceo@admin.com)');
      process.exit(1);
    }

    console.log('👤 CEO ANTIGO (ceo@admin.com):');
    console.log(`   Permissions: ${JSON.stringify(ceoAntigo.permissions)}\n`);

    // Encontrar CEO novo
    const ceoNovo = await User.findOne({ email: 'ceo@ceo' });
    
    if (!ceoNovo) {
      console.log('❌ CEO novo não encontrado (ceo@ceo)');
      process.exit(1);
    }

    console.log('👤 CEO NOVO (ceo@ceo):');
    console.log(`   Permissions ANTES: ${JSON.stringify(ceoNovo.permissions)}\n`);

    // Copiar permissões
    ceoNovo.permissions = ceoAntigo.permissions;
    ceoNovo.roles = ceoAntigo.roles || ['ceo'];
    ceoNovo.activeRole = ceoAntigo.activeRole || 'ceo';
    ceoNovo.status = ceoAntigo.status || 'active';
    
    await ceoNovo.save();

    console.log('✅ CEO NOVO ATUALIZADO:');
    console.log(`   Permissions DEPOIS: ${JSON.stringify(ceoNovo.permissions)}\n`);

    console.log('✅ Permissões copiadas com sucesso!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

copyPermissions();
