/**
 * Teste 3: Aceitar entrega e validar delivery:status_changed event
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

async function testDeliveries() {
  try {
    // 1. Login como motoboy
    log.test('Fazendo login como motoboy...');
    const loginRes = await fetch('http://localhost:4000/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: 'motoboy@example.com',
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
    log.success(`Login realizado como motoboy: ${user.name}`);

    if (user.role !== 'motoboy') {
      log.error('Usuário não é motoboy!');
      process.exit(1);
    }

    // 2. Buscar deliveries disponíveis
    log.test('Buscando entregas disponíveis...');
    const deliveriesRes = await fetch('http://localhost:4000/deliveries/available', {
      headers: { 'Authorization': `Bearer ${token}` }
    });

    const deliveries = await deliveriesRes.json();
    const delivery = deliveries[0];

    if (!delivery) {
      log.error('Nenhuma entrega disponível!');
      log.info('Nota: Execute test-order-creation.js primeiro para criar uma entrega');
      process.exit(1);
    }

    log.success(`Entrega encontrada: ${delivery._id}`);
    log.success(`Status: ${delivery.status}`);
    log.success(`Taxa: R$ ${delivery.fee}`);

    // 3. Aceitar (claim) entrega
    log.test('Aceitando entrega...');
    const claimRes = await fetch(`http://localhost:4000/deliveries/${delivery._id}/claim`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      }
    });

    if (!claimRes.ok) {
      log.error(`Não foi possível aceitar entrega: ${claimRes.status}`);
      const data = await claimRes.json();
      console.log(data);
      process.exit(1);
    }

    const claimed = await claimRes.json();
    log.success(`Entrega aceita!`);
    log.success(`Status atualizado: ${claimed.status}`);

    // 4. Atualizar status para 'picked'
    log.test('Atualizando status para "picked"...');
    const updateRes = await fetch(`http://localhost:4000/deliveries/${delivery._id}/status`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ status: 'picked' })
    });

    if (!updateRes.ok) {
      log.error(`Não foi possível atualizar status: ${updateRes.status}`);
      const data = await updateRes.json();
      console.log(data);
      process.exit(1);
    }

    const updated = await updateRes.json();
    log.success(`Status atualizado para: ${updated.status}`);

    console.log('\n' + colors.green + '═══════════════════════════════════════' + colors.reset);
    console.log(colors.green + '✓ TESTE 3 PASSOU!' + colors.reset);
    console.log(colors.green + '  Verifique o socket listener para' + colors.reset);
    console.log(colors.green + '  confirmar se "delivery:status_changed" foi capturado' + colors.reset);
    console.log(colors.green + '═══════════════════════════════════════' + colors.reset + '\n');

    process.exit(0);

  } catch (err) {
    log.error(`Erro: ${err.message}`);
    process.exit(1);
  }
}

testDeliveries();
