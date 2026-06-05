/**
 * Script de teste automatizado:
 * 1. Fazer login com credenciais
 * 2. Obter token JWT
 * 3. Criar um novo produto
 * 4. Verificar se socket event é disparado
 */

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  test: (msg) => console.log(`${colors.yellow}→${colors.reset} ${msg}`),
};

async function testFullFlow() {
  try {
    // 1. Login
    log.test('Fazendo login com xxx@gmail.com...');
    const loginRes = await fetch('http://localhost:4000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'xxx@gmail.com',
        password: '123456'
      })
    });

    if (!loginRes.ok) {
      log.error(`Login falhou: ${loginRes.status}`);
      const data = await loginRes.json();
      console.log(data);
      process.exit(1);
    }

    const { token, user } = await loginRes.json();
    log.success(`Login realizado! Token: ${token.substring(0, 20)}...`);
    log.success(`Usuário: ${user.name} (${user.email})`);
    log.success(`Role: ${user.role}`);

    if (user.role !== 'seller' && user.role !== 'lojista') {
      log.error('Usuário não é seller/lojista!');
      process.exit(1);
    }

    // 2. Buscar store do usuário
    log.test('Buscando store do usuário...');
    const storesRes = await fetch('http://localhost:4000/stores', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const stores = await storesRes.json();
    const store = stores.find((s) => s.ownerId === user.id);
    
    if (!store) {
      log.error('Nenhuma store encontrada para este usuário!');
      process.exit(1);
    }

    log.success(`Store encontrada: ${store.name} (ID: ${store._id})`);

    // 3. Criar arquivo de token para usar em outros testes
    const fs = require('fs');
    fs.writeFileSync(
      'd:\\PROJETOS\\Drop\\test-token.txt',
      `TOKEN=${token}\nSTORE_ID=${store._id}\nUSER_ID=${user.id}`
    );

    // 4. Criar produto
    log.test('Criando novo produto...');
    const productRes = await fetch('http://localhost:4000/products', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        storeId: store._id,
        name: `Teste Produto ${Date.now()}`,
        price: 29.99,
        quantity: 10,
        category: 'Teste',
        description: 'Produto criado por teste automatizado'
      })
    });

    if (!productRes.ok) {
      log.error(`Criação de produto falhou: ${productRes.status}`);
      const data = await productRes.json();
      console.log(data);
      process.exit(1);
    }

    const product = await productRes.json();
    log.success(`Produto criado com sucesso!`);
    log.success(`ID: ${product._id}`);
    log.success(`Nome: ${product.name}`);
    log.success(`Preço: R$ ${product.price}`);

    console.log('\n' + colors.green + '═══════════════════════════════════════' + colors.reset);
    console.log(colors.green + '✓ TESTE PASSOU! Verifique o socket listener' + colors.reset);
    console.log(colors.green + '  para confirmar se event "product:created" foi capturado' + colors.reset);
    console.log(colors.green + '═══════════════════════════════════════' + colors.reset + '\n');

    process.exit(0);

  } catch (err) {
    log.error(`Erro: ${err.message}`);
    process.exit(1);
  }
}

testFullFlow();
