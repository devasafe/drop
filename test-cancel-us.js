const http = require('http');

const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  cyan: '\x1b[36m',
  red: '\x1b[31m',
};

function makeRequest(method, path, data = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'localhost',
      port: 4000,
      path: path,
      method: method,
      headers: { 'Content-Type': 'application/json' },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(body) });
        } catch (e) {
          resolve({ status: res.statusCode, data: body });
        }
      });
    });

    req.on('error', reject);
    if (data) req.write(JSON.stringify(data));
    req.end();
  });
}

async function testCancel() {
  try {
    console.log(`\n${colors.bright}${colors.cyan}=== TESTE: Cancelamento com us@us ===${colors.reset}\n`);

    // 1. Login
    console.log(`${colors.yellow}1. Fazendo login com us@us...${colors.reset}`);
    const login = await makeRequest('POST', '/auth/login', {
      email: 'us@us',
      password: 'us',
    });

    if (login.status !== 200 && login.status !== 201) {
      console.log(`${colors.red}✗ Login falhou (${login.status})${colors.reset}`);
      console.log(`Erro: ${JSON.stringify(login.data)}`);
      process.exit(1);
    }

    const token = login.data.token;
    console.log(`${colors.green}✓ Login bem-sucedido${colors.reset}`);

    // 2. Listar pedidos
    console.log(`\n${colors.yellow}2. Buscando pedidos do cliente...${colors.reset}`);
    const ordersRes = await makeRequest('GET', '/orders', null, token);
    
    if (ordersRes.status !== 200) {
      console.log(`${colors.red}✗ Erro ao listar pedidos (${ordersRes.status})${colors.reset}`);
      process.exit(1);
    }

    const orderList = ordersRes.data.data || ordersRes.data || [];
    console.log(`${colors.green}✓ ${Array.isArray(orderList) ? orderList.length : 0} pedidos encontrados${colors.reset}`);

    if (Array.isArray(orderList) && orderList.length > 0) {
      console.log(`\n${colors.cyan}Pedidos disponíveis:${colors.reset}`);
      orderList.slice(0, 3).forEach((o, i) => {
        console.log(`  ${i + 1}. ${o._id} | Status: ${o.status} | R$ ${o.totalValue?.toFixed(2) || 'N/A'}`);
      });
    }

    // 3. Encontrar pedido para cancelar
    const orderToCancel = orderList.find(o => 
      ['pago', 'criado', 'enviado', 'preparando'].includes(o.status)
    );
    
    if (!orderToCancel) {
      console.log(`\n${colors.yellow}⚠ Nenhum pedido em status cancelável${colors.reset}`);
      console.log(`   (Status válidos: pago, criado, enviado, preparando)`);
      process.exit(0);
    }

    // 4. Cancelar pedido
    console.log(`\n${colors.yellow}3. Cancelando pedido ${orderToCancel._id}...${colors.reset}`);
    console.log(`   Status atual: ${orderToCancel.status}`);

    const cancelRes = await makeRequest(
      'POST',
      `/orders/${orderToCancel._id}/cancel`,
      { 
        reason: 'Teste automático do sistema',
        reasonCode: 'customer_request' 
      },
      token
    );

    console.log(`\n${colors.cyan}Resposta (Status ${cancelRes.status}):${colors.reset}`);
    console.log(JSON.stringify(cancelRes.data, null, 2));

    if (cancelRes.status === 200) {
      console.log(`\n${colors.green}${colors.bright}✓✓✓ CANCELAMENTO BEM-SUCEDIDO! ✓✓✓${colors.reset}`);
      
      // 5. Verificar histórico
      console.log(`\n${colors.yellow}4. Buscando histórico de cancelamento...${colors.reset}`);
      const historyRes = await makeRequest(
        'GET',
        `/orders/${orderToCancel._id}/cancellations`,
        null,
        token
      );

      if (historyRes.status === 200) {
        const { count, history } = historyRes.data;
        console.log(`${colors.green}✓ ${count} cancelamento(s) registrado(s)${colors.reset}`);
        if (history && history[0]) {
          const c = history[0];
          console.log(`  - Motivo: ${c.reason}`);
          console.log(`  - Reembolso: R$ ${c.refundAmount?.toFixed(2) || '0.00'}`);
          console.log(`  - Status: ${c.refundStatus}`);
        }
      }
    } else {
      console.log(`\n${colors.red}✗ Erro ao cancelar (status ${cancelRes.status})${colors.reset}`);
    }

    process.exit(0);
  } catch (err) {
    console.error(`${colors.red}✗ Erro: ${err.message}${colors.reset}`);
    process.exit(1);
  }
}

testCancel();
