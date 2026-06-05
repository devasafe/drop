const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });

const MONGO_URI = process.env.MONGO_URI;

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  passwordHash: String,
  role: String,
  roles: [String],
  activeRole: String,
  permissions: [String],
  status: String,
  createdAt: Date,
  updatedAt: Date
}, { collection: 'users' });

const User = mongoose.model('User', userSchema);

const ACCOUNTS = [
  { email: 'ceo@admin.com', password: 'CEO@12345Admin' },
  { email: 'marketing@admin.com', password: 'Marketing@12345Admin' },
  { email: 'admin@admin.com', password: 'Admin@12345Admin' }
];

async function fixPasswords() {
  try {
    console.log('🔗 Conectando ao MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('✅ Conectado\n');

    for (const account of ACCOUNTS) {
      console.log(`🔄 Atualizando ${account.email}...`);
      const hashedPassword = await bcrypt.hash(account.password, 10);
      
      const result = await User.updateOne(
        { email: account.email },
        { $set: { passwordHash: hashedPassword } }
      );
      
      console.log(`✅ ${account.email} atualizado!`);
      console.log(`   Senha: ${account.password}`);
      console.log(`   Hash: ${hashedPassword.substring(0, 30)}...\n`);
    }

    // Verificar se as contas existem
    const users = await User.find({ email: { $in: ACCOUNTS.map(a => a.email) } });
    console.log('\n📋 CONTAS NO BANCO:');
    users.forEach(u => {
      console.log(`📧 ${u.email}`);
      console.log(`🔑 passwordHash: ${u.passwordHash ? '✅ Existe' : '❌ Vazio'}`);
      console.log(`   Hash: ${u.passwordHash?.substring(0, 30) || 'NULL'}...\n`);
    });

    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

fixPasswords();
