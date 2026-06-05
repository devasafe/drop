import mongoose from 'mongoose';
import User from '../models/User';
import crypto from 'crypto';

// Simular bcrypt com crypto (alternativa)
const hashPassword = (password: string) => {
  return crypto.createHash('sha256').update(password).digest('hex');
};

const ROLES = {
  CEO: {
    name: 'CEO',
    email: 'ceo@admin.com',
    password: 'CEO@12345Admin',
    permissions: ['view_all', 'edit_all', 'delete_all', 'manage_users', 'manage_roles', 'view_financials', 'manage_rates'],
    description: 'Acesso total ao sistema. Gerencia tudo.'
  },
  MARKETING: {
    name: 'MARKETING',
    email: 'marketing@admin.com',
    password: 'Marketing@12345Admin',
    permissions: ['view_all', 'edit_promotions', 'view_financials', 'manage_campaigns'],
    description: 'Gerencia promoções, campanhas e analytics.'
  },
  ADMIN: {
    name: 'ADMIN',
    email: 'admin@admin.com',
    password: 'Admin@12345Admin',
    permissions: ['view_all', 'edit_users', 'edit_stores', 'edit_motoboys', 'manage_support'],
    description: 'Suporte avançado. Edita usuários, lojas e motoboys.'
  },
  SUPORTE: {
    name: 'SUPORTE',
    email: 'suporte@admin.com',
    password: 'Suporte@12345Admin',
    permissions: ['view_users', 'view_orders', 'respond_tickets', 'view_reports'],
    description: 'Atende clientes e resolve problemas.'
  },
  FINANCEIRO: {
    name: 'FINANCEIRO',
    email: 'financeiro@admin.com',
    password: 'Financeiro@12345Admin',
    permissions: ['view_financials', 'view_wallets', 'export_reports', 'manage_payouts'],
    description: 'Gerencia finanças, wallets e pagamentos.'
  }
};

const seedRoles = async () => {
  try {
    // Conectar ao MongoDB
    await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/ifood-admin');
    
    console.log('🌱 Iniciando seed de roles...\n');

    for (const [key, roleData] of Object.entries(ROLES)) {
      // Verificar se já existe
      const exists = await User.findOne({ role: roleData.name });
      
      if (exists) {
        console.log(`⚠️  Role "${roleData.name}" já existe. Pulando...`);
        continue;
      }

      // Hash de senha
      const hashedPassword = hashPassword(roleData.password);

      // Criar usuário
      const user = new User({
        name: roleData.name,
        email: roleData.email,
        password: hashedPassword,
        role: roleData.name,
        permissions: roleData.permissions,
        isAdmin: true,
        status: 'active'
      });

      await user.save();
      
      console.log(`✅ Role criada: ${roleData.name}`);
      console.log(`   Email: ${roleData.email}`);
      console.log(`   Senha: ${roleData.password}`);
      console.log(`   Descrição: ${roleData.description}`);
      console.log(`   Permissões: ${roleData.permissions.join(', ')}\n`);
    }

    console.log('🎉 Seed de roles concluído!\n');
    console.log('═══════════════════════════════════════════════════════════');
    console.log('📝 ACESSO AOS PAINÉIS DE ADMINISTRAÇÃO');
    console.log('═══════════════════════════════════════════════════════════\n');

    console.log('👑 CEO - Acesso Total');
    console.log('   Email: ceo@admin.com');
    console.log('   Senha: CEO@12345Admin');
    console.log('   URL: /admin/dashboard (Dashboard Principal)');
    console.log('   URL: /admin/users (Gerenciar Usuários)');
    console.log('   URL: /admin/stores (Gerenciar Lojas)');
    console.log('   URL: /admin/motoboys (Gerenciar Motoboys)');
    console.log('   URL: /admin/settings (Configurações do Sistema)\n');

    console.log('📢 MARKETING - Campanhas e Promoções');
    console.log('   Email: marketing@admin.com');
    console.log('   Senha: Marketing@12345Admin');
    console.log('   URL: /admin/campaigns (Gerenciar Campanhas)');
    console.log('   URL: /admin/promotions (Gerenciar Promoções)');
    console.log('   URL: /admin/analytics (Analytics)\n');

    console.log('⚙️  ADMIN - Suporte Avançado');
    console.log('   Email: admin@admin.com');
    console.log('   Senha: Admin@12345Admin');
    console.log('   URL: /admin/users (Gerenciar Usuários)');
    console.log('   URL: /admin/stores (Gerenciar Lojas)');
    console.log('   URL: /admin/motoboys (Gerenciar Motoboys)\n');

    console.log('💰 FINANCEIRO - Gestão de Finanças');
    console.log('   Email: financeiro@admin.com');
    console.log('   Senha: Financeiro@12345Admin');
    console.log('   URL: /admin/financials (Finanças)');
    console.log('   URL: /admin/wallets (Wallets)');
    console.log('   URL: /admin/payouts (Pagamentos)\n');

    console.log('🎧 SUPORTE - Atendimento');
    console.log('   Email: suporte@admin.com');
    console.log('   Senha: Suporte@12345Admin');
    console.log('   URL: /admin/support (Tickets)');
    console.log('   URL: /admin/orders (Pedidos)\n');

    console.log('═══════════════════════════════════════════════════════════');
    console.log('🚀 Para testar:');
    console.log('   1. Abra o frontend: http://localhost:3000/login');
    console.log('   2. Faça login com um dos emails acima');
    console.log('   3. Acesse o painel correspondente');
    console.log('═══════════════════════════════════════════════════════════\n');

    process.exit(0);
  } catch (error) {
    console.error('❌ Erro ao fazer seed de roles:', error);
    process.exit(1);
  }
};

seedRoles();
