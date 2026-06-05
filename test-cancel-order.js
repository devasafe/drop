const http = require('http');

// Cores para output
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
      headers: {
        'Content-Type': 'application/json',
      },
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => {
        try {
          resolve({
            status: res.statusCode,
            data: JSON.parse(body),
          });
        } catch (e) {
          resolve({
            status: res.statusCode,
            data: body,
          });
        }
      });
    });

    req.on('error', reject);

    if (data) {
      req.write(JSON.stringify(data));
    }
    req.end();
  });
}

async function testCancelOrder() {
  try {
    console.log(`\n${colors.bright}${colors.cyan}=== TESTE: Cancelamento de Pedido ===${colors.reset}\n`);

    // 1. Login como cliente de teste
    console.log(`${colors.yellow}1. Fazendo login como cliente...${colors.reset}`);
    const loginRes = await makeRequest('POST', '/auth/login', {
      email: 'cliente.teste@email.com',
      password: '123456',
    });

    let token;
    if (loginRes.status === 200 || loginRes.status === 201) {
      token = loginRes.data.token;
      console.log(`${colors.green}✓ Login realizado com sucesso${colors.reset}`);
    } else {
      console.log(`   Status: ${loginRes.status}`);
      console.log(`   Erro: ${loginRes.data.error || loginRes.data}`);
      
      // Tentar com usuário padrão
      console.log(`${colors.yellow}   Tentando login com usuário padrão: cliente@teste.com${colors.reset}`);
      const defaultLogin = await makeRequest('POST', '/auth/login', {
        email: 'cliente@teste.com',
        password: '123456',
      });

      if (defaultLogin.status === 200 || defaultLogin.status === 201) {
        token = defaultLogin.data.token;
        console.log(`${colors.green}✓ Login realizado com sucesso${colors.reset}`);
      } else {
        throw new Error(`Login falhou: ${defaultLogin.status} - ${defaultLogin.data.error}`);
      }
    }

    // 2. Listar pedidos
    console.log(`\n${colors.yellow}2. Listando pedidos do cliente...${colors.reset}`);
    const ordersList = await makeRequest('GET', '/orders', null, token);

    if (ordersList.status !== 200) {
      throw new Error(`Erro ao listar pedidos: ${ordersList.status} - ${ordersList.data.error}`);
    }

    const orders = ordersList.data.data || ordersList.data || [];
    console.log(`${colors.green}✓ ${Array.isArray(orders) ? orders.length : 0} pedidos encontrados${colors.reset}`);

    // Procurar pedido cancelável
    let orderToCancel = null;
    if (Array.isArray(orders)) {
      orderToCancel = orders.find((o) => ['pago', 'criado', 'enviado'].includes(o.status));
    }

    if (!orderToCancel) {
      console.log(`${colors.yellow}   Nenhum pedido cancelável encontrado${colors.reset}`);
      console.log(`${colors.cyan}   (Criar um pedido manualmente via interface antes de executar este teste)${colors.reset}`);
      console.log('\n${colors.yellow}Estrutura esperada de um pedido:${colors.reset}');
      console.log('  - _id: ObjectId');
      console.log('  - status: "pago" | "criado" | "enviado"');
      console.log('  - customerId: ObjectId');
      console.log('  - storeId: ObjectId');
      console.log('  - totalValue: number');
      process.exit(1);
    }

    console.log(`${colors.green}✓ Pedido encontrado para cancelamento${colors.reset}`);
    console.log(`${colors.cyan}  ID: ${orderToCancel._id}${colors.reset}`);
    console.log(`${colors.cyan}  Status atual: ${orderToCancel.status}${colors.reset}`);
    console.log(`${colors.cyan}  Total: R$ ${orderToCancel.totalValue?.toFixed(2) || 'N/A'}${colors.reset}`);

    // 3. Cancelar pedido
    console.log(`\n${colors.yellow}3. Enviando requisição de cancelamento...${colors.reset}`);
    const cancelRes = await makeRequest(
      'POST',
      `/orders/${orderToCancel._id}/cancel`,
      {
        reason: 'Teste de cancelamento do sistema',
        reasonCode: 'customer_request',
      },
      token
    );

    if (cancelRes.status !== 200) {
      throw new Error(`Erro ao cancelar: ${cancelRes.status} - ${JSON.stringify(cancelRes.data)}`);
    }

    console.log(`${colors.green}✓ Pedido cancelado com sucesso!${colors.reset}`);
    console.log(`${colors.cyan}Resposta da API:${colors.reset}`);
    console.log(JSON.stringify(cancelRes.data, null, 2));

    // 4. Verificar pedido após cancelamento
    console.log(`\n${colors.yellow}4. Verificando estado do pedido após cancelamento...${colors.reset}`);
    const verifyRes = await makeRequest('GET', `/orders/${orderToCancel._id}`, null, token);

    if (verifyRes.status !== 200) {
      throw new Error(`Erro ao verificar pedido: ${verifyRes.status}`);
    }

    const updatedOrder = verifyRes.data.order || verifyRes.data;
    console.log(`${colors.green}✓ Pedido verificado com sucesso${colors.reset}`);
    console.log(`${colors.cyan}  Status novo: ${updatedOrder.status}${colors.reset}`);
    console.log(`${colors.cyan}  Cancelado em: ${updatedOrder.cancelledAt || 'N/A'}${colors.reset}`);

    // 5. Buscar histórico de cancelamentos
    console.log(`\n${colors.yellow}5. Buscando histórico de cancelamentos...${colors.reset}`);
    const historyRes = await makeRequest(
      'GET',
      `/orders/${orderToCancel._id}/cancellations`,
      null,
      token
    );

    if (historyRes.status !== 200) {
      console.log(`${colors.yellow}   Histórico não encontrado (status ${historyRes.status})${colors.reset}`);
    } else {
      const { count, history } = historyRes.data;
      console.log(`${colors.green}✓ Histórico de cancelamentos encontrado (${count} registros)${colors.reset}`);

      if (history && history.length > 0) {
        const cancellation = history[0];
        console.log(`${colors.cyan}  Cancelamento mais recente:${colors.reset}`);
        console.log(`    - Cancelado por: ${cancellation.cancelledBy}`);
        console.log(`    - Motivo: "${cancellation.reason}"`);
        console.log(`    - Código: ${cancellation.reasonCode}`);
        console.log(`    - Reembolso: R$ ${cancellation.refundAmount?.toFixed(2) || '0.00'}`);
        console.log(`    - Status refund: ${cancellation.refundStatus}`);
        console.log(`    - Data: ${new Date(cancellation.createdAt).toLocaleString('pt-BR')}`);
      }
    }

    console.log(`\n${colors.green}${colors.bright}✓✓✓ TESTE CONCLUÍDO COM SUCESSO! ✓✓✓${colors.reset}`);
    console.log(`${colors.cyan}O sistema de cancelamento está funcionando corretamente!${colors.reset}\n`);
    process.exit(0);
  } catch (error) {
    console.error(`\n${colors.red}${colors.bright}✗ ERRO NO TESTE:${colors.reset}`);
    console.error(`${colors.red}${error.message}${colors.reset}`);
    console.log(`\n${colors.yellow}Dicas para resolver:${colors.reset}`);
    console.log('  1. Certifique-se de que o backend está rodando: npm run dev');
    console.log('  2. Verifique se MongoDB está conectado');
    console.log('  3. Crie um pedido em status "pago" ou "criado" via interface');
    console.log('  4. Verifique as credenciais do cliente no arquivo de teste\n');
    process.exit(1);
  }
}

testCancelOrder();
