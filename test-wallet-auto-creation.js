/**
 * Script de Teste: Auto-criação de Carteira
 * Testa se a carteira é criada automaticamente quando um novo usuário se registra
 */

const API_URL = 'http://localhost:4000/api';

async function testWalletAutoCreation() {
  console.log('🧪 TESTE: Auto-criação de Carteira\n');
  console.log('=' .repeat(60));

  // Gerar email único com timestamp
  const timestamp = Date.now();
  const testUser = {
    name: `Teste Auto Wallet ${timestamp}`,
    email: `test-wallet-${timestamp}@test.com`,
    password: 'Test@12345',
    role: 'cliente'
  };

  try {
    // PASSO 1: Registrar novo usuário
    console.log('\n📝 PASSO 1: Registrando novo usuário...');
    console.log(`Nome: ${testUser.name}`);
    console.log(`Email: ${testUser.email}`);
    
    const registerRes = await fetch(`${API_URL}/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testUser)
    });
    
    const registerData = await registerRes.json();
    
    if (!registerRes.ok) {
      throw new Error(`Erro no registro: ${registerData.error}`);
    }
    
    const userId = registerData.id;
    console.log(`✅ Usuário criado! ID: ${userId}\n`);

    // PASSO 2: Fazer login
    console.log('🔐 PASSO 2: Fazendo login...');
    const loginRes = await fetch(`${API_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: testUser.email,
        password: testUser.password
      })
    });
    
    const loginData = await loginRes.json();
    
    if (!loginRes.ok) {
      throw new Error(`Erro no login: ${loginData.error}`);
    }
    
    const token = loginData.token;
    console.log(`✅ Login bem-sucedido! Token obtido\n`);

    // PASSO 3: Verificar se carteira foi criada
    console.log('💰 PASSO 3: Verificando se carteira foi criada...');
    
    // Buscar carteira do usuário (precisa de token de admin)
    try {
      const walletRes = await fetch(`${API_URL}/wallet`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (walletRes.ok) {
        const walletData = await walletRes.json();
        console.log('✅ Carteira encontrada!');
        console.log(`   Balance: R$ ${walletData.balance}`);
        console.log(`   Total Income: R$ ${walletData.totalIncome}`);
        console.log(`   Total Spent: R$ ${walletData.totalSpent}`);
        console.log(`   History Length: ${walletData.history?.length || 0} transações\n`);
      } else {
        console.log('⚠️  Carteira não acessível via endpoint público\n');
      }
    } catch (err) {
      console.log('⚠️  Erro ao verificar carteira do usuário\n');
    }

    // PASSO 4: Tentar via admin (se credenciais estiverem disponíveis)
    console.log('📊 PASSO 4: Tentando via painel admin...');
    
    try {
      // Fazer login como CEO para acessar dados de todos os usuários
      const adminLoginRes = await fetch(`${API_URL}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'ceo@admin.com',
          password: 'CEO@12345Admin'
        })
      });
      
      const adminLoginData = await adminLoginRes.json();
      
      if (!adminLoginRes.ok) {
        throw new Error('Erro ao fazer login como CEO');
      }
      
      const adminToken = adminLoginData.token;

      // Buscar todas as carteiras
      const walletsRes = await fetch(`${API_URL}/admin/wallets`, {
        headers: { Authorization: `Bearer ${adminToken}` }
      });

      if (!walletsRes.ok) {
        throw new Error('Erro ao buscar carteiras');
      }

      const wallets = await walletsRes.json();

      // Procurar pela carteira do novo usuário
      const userWallet = wallets.find((w) => w.owner === userId);
      
      if (userWallet) {
        console.log('✅ Carteira do novo usuário encontrada no admin!');
        console.log(`   Owner: ${userWallet.owner}`);
        console.log(`   Owner Type: ${userWallet.ownerType}`);
        console.log(`   Balance: R$ ${userWallet.balance}`);
        console.log(`   Total Income: R$ ${userWallet.totalIncome}`);
        console.log(`   Total Spent: R$ ${userWallet.totalSpent}\n`);
      } else {
        console.log('❌ Carteira NÃO encontrada no admin para este usuário\n');
      }
    } catch (adminErr) {
      console.log('⚠️  Erro ao acessar dados de admin\n');
    }

    // RESULTADO FINAL
    console.log('=' .repeat(60));
    console.log('\n🎉 TESTE CONCLUÍDO!\n');
    console.log('Próximos passos:');
    console.log('1. Verifique o console do backend para a mensagem:');
    console.log('   ✅ Carteira criada automaticamente para usuário: <ID>');
    console.log('2. Acesse /admin/wallets e procure pela carteira do novo usuário');
    console.log('3. Verifique se o balance, totalIncome e totalSpent estão corretos\n');

  } catch (error) {
    console.error('\n❌ ERRO:');
    console.error('Mensagem:', error.message);
  }
}

// Executar teste
testWalletAutoCreation();
