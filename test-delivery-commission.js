#!/usr/bin/env node

/**
 * Script para testar o fluxo completo de comissão de entrega
 * Cria um pedido completo e verifica se a comissão foi registrada
 */

const axios = require('axios');

const API_BASE = 'http://localhost:3001';

// Mock tokens (você precisará ajustar conforme necessário)
const CLIENTE_TOKEN = process.env.CLIENTE_TOKEN || 'your-cliente-token';
const STORE_OWNER_TOKEN = process.env.STORE_OWNER_TOKEN || 'your-store-owner-token';
const CEO_TOKEN = process.env.CEO_TOKEN || 'your-ceo-token';

async function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function testDeliveryCommission() {
  try {
    console.log('\n🚀 INICIANDO TESTE DE COMISSÃO DE ENTREGA\n');

    // 1️⃣ Criar um novo pedido
    console.log('1️⃣  Criando novo pedido...');
    const orderResponse = await axios.post(
      `${API_BASE}/orders`,
      {
        clientId: 'test-client-id',
        storeId: 'test-store-id',
        products: [{ productId: 'prod-123', price: 100, quantity: 1 }],
        addressId: 'addr-123'
      },
      { headers: { Authorization: `Bearer ${CLIENTE_TOKEN}` } }
    );

    const orderId = orderResponse.data._id;
    console.log(`   ✅ Pedido criado: ${orderId}`);
    console.log(`   💰 Valor do produto: R$ 100.00`);

    // 2️⃣ Aguardar um pouco
    await sleep(1000);

    // 3️⃣ Criar uma entrega para o pedido
    console.log('\n2️⃣  Criando entrega para o pedido...');
    const deliveryResponse = await axios.post(
      `${API_BASE}/deliveries`,
      {
        orderId: orderId,
        distance: 5
      },
      { headers: { Authorization: `Bearer ${STORE_OWNER_TOKEN}` } }
    );

    const deliveryId = deliveryResponse.data._id;
    console.log(`   ✅ Entrega criada: ${deliveryId}`);
    console.log(`   🚗 Taxa de entrega: R$ ${deliveryResponse.data.fee}`);

    // 4️⃣ Aguardar um pouco
    await sleep(1000);

    // 5️⃣ Verificar o saldo do caixa do app
    console.log('\n3️⃣  Verificando saldo do caixa do app...');
    const cashboxResponse = await axios.get(
      `${API_BASE}/admin/app-cashbox/overview`,
      { headers: { Authorization: `Bearer ${CEO_TOKEN}` } }
    );

    const cashbox = cashboxResponse.data;
    console.log(`   💰 Saldo atual: R$ ${cashbox.balance}`);
    console.log(`   📊 Histórico (últimas 5 entradas):`);
    
    cashbox.history.slice(-5).forEach((entry, idx) => {
      const type = entry.type === 'income' ? '📥' : '📤';
      const source = entry.source.replace(/_/g, ' ').toUpperCase();
      const amount = entry.amount > 0 ? `+ R$ ${entry.amount.toFixed(2)}` : `- R$ ${Math.abs(entry.amount).toFixed(2)}`;
      console.log(`      ${idx + 1}. ${type} ${source}: ${amount}`);
    });

    // 6️⃣ Validação
    console.log('\n4️⃣  VALIDAÇÃO:\n');
    const hasDeliveryCommission = cashbox.history.some(h => h.source === 'delivery_commission');
    
    if (hasDeliveryCommission) {
      console.log('   ✅ Comissão de entrega REGISTRADA com sucesso!');
    } else {
      console.log('   ❌ Comissão de entrega NÃO FOI REGISTRADA!');
      console.log('   🔍 Verifique os logs do servidor para mais informações.');
    }

  } catch (error) {
    console.error('\n❌ ERRO durante o teste:');
    if (error.response) {
      console.error(`   Status: ${error.response.status}`);
      console.error(`   Mensagem: ${error.response.data.error || error.response.data.message}`);
    } else {
      console.error(`   ${error.message}`);
    }
  }
}

// Executar teste
testDeliveryCommission().then(() => {
  console.log('\n✅ Teste finalizado!\n');
  process.exit(0);
}).catch(err => {
  console.error('\n❌ Erro fatal:', err);
  process.exit(1);
});
