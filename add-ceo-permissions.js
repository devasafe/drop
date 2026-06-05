// Script para adicionar permissões ao CEO novo
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

// Permissões do CEO
const CEO_PERMISSIONS = [
  'view_all',
  'edit_all',
  'delete_all',
  'manage_users',
  'manage_roles',
  'view_financials',
  'manage_rates'
];

async function addCEOPermissions() {
  try {
    console.log('🔗 Conectando ao MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado\n');

    // Encontrar CEO
    const ceo = await User.findOne({ email: 'ceo@ceo' });
    
    if (!ceo) {
      console.log('❌ CEO não encontrado (ceo@ceo)');
      process.exit(1);
    }

    console.log('👤 CEO ENCONTRADO:');
    console.log(`   Email: ${ceo.email}`);
    console.log(`   Name: ${ceo.name}`);
    console.log(`   Permissions ANTES: ${JSON.stringify(ceo.permissions)}\n`);

    // Adicionar permissões
    ceo.permissions = CEO_PERMISSIONS;
    ceo.roles = ['ceo'];
    ceo.activeRole = 'ceo';
    ceo.status = 'active';
    
    await ceo.save();

    console.log('✅ CEO ATUALIZADO:');
    console.log(`   Permissions DEPOIS: ${JSON.stringify(ceo.permissions)}`);
    console.log(`   Roles: ${JSON.stringify(ceo.roles)}`);
    console.log(`   ActiveRole: ${ceo.activeRole}`);
    console.log(`   Status: ${ceo.status}\n`);

    console.log('✅ Permissões adicionadas com sucesso!');
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

addCEOPermissions();
