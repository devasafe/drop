/**
 * Teste 2: Criar pedido e validar order:created event
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

async function testOrders() {
  try {
    // 1. Login como cliente (não seller)
    log.test('Fazendo login como cliente...');
    const loginRes = await fetch('http://localhost:4000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'cliente@example.com',
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
    log.success(`Login realizado como cliente: ${user.name}`);

    if (user.role !== 'client') {
      log.error('Usuário não é cliente!');
      process.exit(1);
    }

    // 2. Buscar produtos
    log.test('Buscando produtos disponíveis...');
    const productsRes = await fetch('http://localhost:4000/products', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const products = await productsRes.json();
    const product = products.find((p) => p.price && p.storeId);

    if (!product) {
      log.error('Nenhum produto encontrado!');
      process.exit(1);
    }

    log.success(`Produto encontrado: ${product.name} (ID: ${product._id})`);

    // 3. Buscar endereço do cliente
    log.test('Buscando endereço do cliente...');
    const addressRes = await fetch('http://localhost:4000/addresses', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const addresses = await addressRes.json();
    let address = addresses[0];

    if (!address) {
      log.error('Nenhum endereço encontrado!');
      log.test('Criando endereço padrão...');
      const createAddrRes = await fetch('http://localhost:4000/addresses', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          label: 'Casa',
          street: 'Rua Teste',
          number: '123',
          neighborhood: 'Bairro',
          city: 'São Paulo',
          state: 'SP',
          zip: '01234-567',
          latitude: '-23.550520',
          longitude: '-46.633309'
        })
      });

      const newAddr = await createAddrRes.json();
      address = newAddr;
      log.success(`Endereço criado: ${address.label}`);
    } else {
      log.success(`Endereço encontrado: ${address.label}`);
    }

    // 4. Criar pedido
    log.test('Criando novo pedido...');
    const orderRes = await fetch('http://localhost:4000/orders', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        storeId: product.storeId,
        products: [
          {
            productId: product._id,
            quantity: 1,
            price: product.price
          }
        ],
        addressId: address._id,
        totalValue: product.price
      })
    });

    if (!orderRes.ok) {
      log.error(`Criação de pedido falhou: ${orderRes.status}`);
      const data = await orderRes.json();
      console.log(data);
      process.exit(1);
    }

    const order = await orderRes.json();
    log.success(`Pedido criado com sucesso!`);
    log.success(`ID: ${order._id}`);
    log.success(`Status: ${order.status}`);
    log.success(`Total: R$ ${order.totalValue}`);

    console.log('\n' + colors.green + '═══════════════════════════════════════' + colors.reset);
    console.log(colors.green + '✓ TESTE 2 PASSOU!' + colors.reset);
    console.log(colors.green + '  Verifique o socket listener para' + colors.reset);
    console.log(colors.green + '  confirmar se "order:created" foi capturado' + colors.reset);
    console.log(colors.green + '═══════════════════════════════════════' + colors.reset + '\n');

    process.exit(0);

  } catch (err) {
    log.error(`Erro: ${err.message}`);
    process.exit(1);
  }
}

testOrders();
