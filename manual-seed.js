const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/drop_marketplace';
console.log('📡 Usando MONGO_URI:', MONGO_URI.substring(0, 50) + '...');

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  role: String,
  roles: [String],
  activeRole: String,
  permissions: [String],
  status: String,
  telefone: String,
  cpf: String,
  createdAt: Date,
  updatedAt: Date
});

const User = mongoose.model('User', userSchema);

const ADMIN_USERS = [
  {
    name: 'CEO',
    email: 'ceo@admin.com',
    password: 'CEO@12345Admin',
    role: 'ceo',
    roles: ['ceo'],
    activeRole: 'ceo',
    permissions: ['view_all', 'edit_all', 'delete_all', 'manage_users', 'manage_roles', 'view_financials', 'manage_rates'],
    status: 'active'
  },
  {
    name: 'Marketing',
    email: 'marketing@admin.com',
    password: 'Marketing@12345Admin',
    role: 'marketing',
    roles: ['marketing'],
    activeRole: 'marketing',
    permissions: ['view_all', 'edit_promotions', 'view_financials', 'manage_campaigns'],
    status: 'active'
  },
  {
    name: 'Admin',
    email: 'admin@admin.com',
    password: 'Admin@12345Admin',
    role: 'gerente_geral',
    roles: ['gerente_geral'],
    activeRole: 'gerente_geral',
    permissions: ['view_all', 'edit_users', 'edit_stores', 'edit_motoboys', 'manage_support'],
    status: 'active'
  }
];

async function seedUsers() {
  try {
    console.log('🔗 Conectando ao MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado ao MongoDB\n');

    for (const userData of ADMIN_USERS) {
      // Verificar se já existe
      const exists = await User.findOne({ email: userData.email });
      
      if (exists) {
        console.log(`⚠️  ${userData.email} já existe. Atualizando...`);
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        await User.updateOne(
          { email: userData.email },
          {
            name: userData.name,
            passwordHash: hashedPassword,
            role: userData.role,
            roles: userData.roles,
            activeRole: userData.activeRole,
            permissions: userData.permissions,
            status: userData.status,
            updatedAt: new Date()
          }
        );
        console.log(`✅ ${userData.email} atualizado!\n`);
      } else {
        // Criar novo
        const hashedPassword = await bcrypt.hash(userData.password, 10);
        const user = new User({
          name: userData.name,
          email: userData.email,
          passwordHash: hashedPassword,
          role: userData.role,
          roles: userData.roles,
          activeRole: userData.activeRole,
          permissions: userData.permissions,
          status: userData.status,
          createdAt: new Date(),
          updatedAt: new Date()
        });
        await user.save();
        console.log(`✅ ${userData.email} criado!`);
        console.log(`   Senha: ${userData.password}\n`);
      }
    }

    console.log('\n🎉 Seed concluído!');
    console.log('\n═══════════════════════════════════════════════════════════');
    console.log('📝 CONTAS CRIADAS:');
    console.log('═══════════════════════════════════════════════════════════\n');
    
    ADMIN_USERS.forEach(user => {
      console.log(`📧 ${user.email}`);
      console.log(`🔒 ${user.password}`);
      console.log(`👤 ${user.name} (${user.role})\n`);
    });

    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

seedUsers();
