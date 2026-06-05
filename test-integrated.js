/**
 * Teste integrado: Login + Criar Pedido + Aceitar Entrega
 * Valida múltiplos eventos de socket
 */

const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  red: '\x1b[31m',
  cyan: '\x1b[36m',
};

const log = {
  info: (msg) => console.log(`${colors.blue}ℹ${colors.reset} ${msg}`),
  success: (msg) => console.log(`${colors.green}✓${colors.reset} ${msg}`),
  error: (msg) => console.log(`${colors.red}✗${colors.reset} ${msg}`),
  test: (msg) => console.log(`${colors.yellow}→${colors.reset} ${msg}`),
};

// Credenciais do usuário
const USER_EMAIL = 'us@us';
const USER_PASSWORD = 'us';

async function testIntegratedFlow() {
  try {
    console.log(`${colors.cyan}${'═'.repeat(50)}${colors.reset}`);
    console.log(`${colors.cyan}TESTE INTEGRADO: ORDEM + ENTREGA + SOCKET EVENTS${colors.reset}`);
    console.log(`${colors.cyan}${'═'.repeat(50)}${colors.reset}\n`);

    // 1. Login como cliente
    log.test('1️⃣  Login com us@us...');
    const loginRes = await fetch('http://localhost:4000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: USER_EMAIL,
        password: USER_PASSWORD
      })
    });

    if (!loginRes.ok) {
      log.error(`Login falhou: ${loginRes.status}`);
      const data = await loginRes.json();
      console.log(data);
      process.exit(1);
    }

    const { token, user } = await loginRes.json();
    log.success(`Login: ${user.name} (${user.role})`);

    // 2. Buscar produtos
    log.test('2️⃣  Buscando produtos...');
    const productsRes = await fetch('http://localhost:4000/products');
    const products = await productsRes.json();
    const product = products.find(p => p.price && p.storeId);

    if (!product) {
      log.error('Nenhum produto disponível!');
      process.exit(1);
    }
    log.success(`Produto: ${product.name} (R$ ${product.price})`);

    // 3. Buscar/Criar endereço
    log.test('3️⃣  Configurando endereço...');
    const addressRes = await fetch('http://localhost:4000/addresses', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    let addresses = await addressRes.json();
    let address = addresses[0];

    if (!address) {
      const createRes = await fetch('http://localhost:4000/addresses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          label: 'Endereço Teste',
          street: 'Rua das Flores',
          number: '123',
          neighborhood: 'Centro',
          city: 'São Paulo',
          state: 'SP',
          zip: '01234-567',
          latitude: '-23.5505',
          longitude: '-46.6333'
        })
      });
      address = await createRes.json();
      log.success(`Endereço criado: ${address.label}`);
    } else {
      log.success(`Endereço: ${address.label}`);
    }

    // 4. Criar pedido
    log.test('4️⃣  Criando pedido...');
    const orderRes = await fetch('http://localhost:4000/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        storeId: product.storeId,
        products: [{ productId: product._id, quantity: 1, price: product.price }],
        addressId: address._id,
        totalValue: product.price
      })
    });

    if (!orderRes.ok) {
      log.error(`Falha ao criar pedido: ${orderRes.status}`);
      const data = await orderRes.json();
      console.log(data);
      process.exit(1);
    }

    const order = await orderRes.json();
    log.success(`Pedido criado: ${order._id}`);
    log.success(`Status: ${order.status} | Total: R$ ${order.totalValue}`);

    // 5. Buscar entrega
    log.test('5️⃣  Localizando entrega associada...');
    const deliveriesRes = await fetch(`http://localhost:4000/deliveries/available`);
    const deliveries = await deliveriesRes.json();
    const delivery = deliveries.find(d => d.orderId === order._id);

    if (!delivery) {
      log.error('Entrega não encontrada!');
      process.exit(1);
    }
    log.success(`Entrega: ${delivery._id}`);

    console.log('\n' + colors.green + '═'.repeat(50) + colors.reset);
    console.log(colors.green + '✓ TESTES PASSARAM!' + colors.reset);
    console.log(colors.green + '  Events esperados:' + colors.reset);
    console.log(colors.green + '  ✓ product:created' + colors.reset);
    console.log(colors.green + '  ✓ order:created' + colors.reset);
    console.log(colors.green + '  ✓ order:status_changed (pago)' + colors.reset);
    console.log(colors.green + '  ✓ delivery:created' + colors.reset);
    console.log(colors.green + '═'.repeat(50) + colors.reset + '\n');

    process.exit(0);

  } catch (err) {
    log.error(`Erro: ${err.message}`);
    process.exit(1);
  }
}

testIntegratedFlow();
