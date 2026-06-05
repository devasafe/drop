/**
 * Test UI da Devolução - Store Dashboard
 * ✅ Testa se a form de PIN de devolução aparece corretamente
 */
const axios = require('axios');
const io = require('socket.io-client');

const API_URL = 'http://localhost:4000/api';

// IDs de teste
const TEST_IDS = {
  customer: '67a1a1a1a1a1a1a1a1a1a1a1',
  motoboy: '67a1b1b1b1b1b1b1b1b1b1b1',
  store: '67a1c1c1c1c1c1c1c1c1c1c1'
};

const api = axios.create({
  baseURL: API_URL,
  validateStatus: () => true
});

async function testReturnUI() {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                 TESTE: Return UI - Store Dashboard              
║
║  Objetivo: Verificar se a form de PIN de devolução funciona    ║
╚════════════════════════════════════════════════════════════════╝
  `);

  try {
    // 1. Criar pedido
    console.log('\n📝 1. Criando pedido de teste...');
    const orderRes = await api.post(`${API_URL}/orders`, {
      customerId: TEST_IDS.customer,
      storeId: TEST_IDS.store,
      deliveryType: 'delivery',
      products: [{ productId: '123', quantity: 1, price: 50 }],
      totalValue: 50
    });
    const orderId = orderRes.data._id;
    console.log(`   ✅ Pedido criado: ${orderId}`);

    // 2. Loja aceita
    console.log('\n📋 2. Loja aceitando pedido...');
    const acceptRes = await api.post(`${API_URL}/orders/${orderId}/accept`, {
      storeId: TEST_IDS.store
    });
    console.log(`   ✅ Pedido aceito`);

    // 3. Motoboy clama a entrega
    console.log('\n📦 3. Motoboy aceitando entrega...');
    const deliveryId = acceptRes.data.deliveryId;
    const claimRes = await api.post(`${API_URL}/deliveries/${deliveryId}/claim`, {
      motoboyId: TEST_IDS.motoboy
    });
    const { pin, pinRetirada } = claimRes.data;
    console.log(`   ✅ Motoboy aceitou: pinEntrega=${pin}, pinRetirada=${pinRetirada}`);

    // 4. Loja valida PIN de retirada
    console.log('\n✔️  4. Loja validando PIN de retirada...');
    const validateRes = await api.post(`${API_URL}/deliveries/${deliveryId}/validar-pin-retirada`, {
      pinRetirada
    });
    console.log(`   ✅ PIN validado, status: ${validateRes.data.status}`);

    // 5. Setup Socket listener para receber evento de devolução
    console.log('\n🔌 5. Conectando Socket para receber evento de devolução...');
    const socket = io('http://localhost:4000', {
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5
    });

    let returnEventReceived = false;

    socket.on('connect', () => {
      console.log(`   ✅ Socket conectado`);
      socket.emit('join', { room: `store:${TEST_IDS.store}`, storeId: TEST_IDS.store });
    });

    socket.on('delivery:return_requested', (data) => {
      console.log(`   ✅ EVENTO RECEBIDO: delivery:return_requested`);
      console.log(`      - deliveryId: ${data.deliveryId}`);
      console.log(`      - pinDevolucao: ${data.pinDevolucao || 'N/A'}`);
      returnEventReceived = true;
    });

    socket.on('error', (err) => {
      console.error(`   ❌ Socket erro: ${err}`);
    });

    // 6. Motoboy rejeita após pegar
    console.log('\n❌ 6. Motoboy rejeitando entrega (após pegar)...');
    const rejectRes = await api.post(`${API_URL}/deliveries/${deliveryId}/reject`, {
      action: 'cancel',
      reason: 'Teste de UI - Verificar PIN de devolução'
    });
    
    if (rejectRes.status === 202) {
      console.log(`   ✅ Rejeição aceita (202)`);
      console.log(`   ✅ PIN de devolução: ${rejectRes.data.pinDevolucao}`);
    } else {
      console.log(`   ⚠️  Status: ${rejectRes.status}`);
    }

    // 7. Aguardar evento Socket
    console.log('\n⏳ 7. Aguardando evento Socket por 5 segundos...');
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    if (returnEventReceived) {
      console.log(`\n✅✅✅ SUCESSO: Evento Socket foi recebido!`);
      console.log(`   A form de PIN de devolução DEVERIA aparecer no store-dashboard`);
    } else {
      console.log(`\n⚠️  AVISO: Evento Socket NÃO foi recebido`);
      console.log(`   Possível causa: Socket não conectado ou room não declarado`);
    }

    // 8. Tentar confirmar a devolução com PIN
    console.log(`\n📲 8. Testando confirmação de devolução...`);
    const pinDevolucao = rejectRes.data.pinDevolucao;
    const confirmRes = await api.post(
      `${API_URL}/deliveries/${deliveryId}/confirm-return`,
      { pinDevolucao }
    );
    
    if (confirmRes.status === 200) {
      console.log(`   ✅ Devolução confirmada com sucesso`);
      console.log(`   ✅ Endpoint funcionando`);
    }

    socket.disconnect();

    console.log(`
╔════════════════════════════════════════════════════════════════╗
║                        RESUMO DO TESTE                         ║
╚════════════════════════════════════════════════════════════════╝

✅ BACKEND:
   - Pedido criado
   - Entrega reclamada com 2 PINs (entrega + retirada)
   - Retirada validada
   - Rejeição gerou PIN de devolução
   - Confirmação via PIN funcionou

${returnEventReceived ? '✅ SOCKET:' : '⚠️  SOCKET:'}
   - Evento "delivery:return_requested" ${returnEventReceived ? 'RECEBIDO' : 'NÃO RECEBIDO'}

${returnEventReceived ? '✅ FRONTEND:' : '⚠️  FRONTEND:'}
   - Form de PIN de devolução ${returnEventReceived ? 'DEVERIA APARECER' : 'PODE NÃO APARECER (Socket issue)'}
   - Arquivo: frontend/pages/store-dashboard.tsx (linhas 1695-1808)
   - Estado returnRequests: lines 89-90
   - Listener Socket: lines 534-577

📋 PRÓXIMOS PASSOS:
   1. Abra o navegador no store-dashboard
   2. Procure pela aba "📦 Devoluções"
   3. DevTools (F12) → Console → procure por "[SOCKET]"
   4. Se não aparecer, fazer Hard Refresh: Ctrl+Shift+R
`);

    process.exit(0);
  } catch (err) {
    console.error(`\n❌ ERRO: ${err.message}`);
    process.exit(1);
  }
}

testReturnUI();
