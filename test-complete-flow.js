#!/usr/bin/env node

/**
 * 🧪 TESTE COMPLETO DO SISTEMA - TODOS OS CENÁRIOS
 * 
 * Testa:
 * 1. Fluxo completo: Compra → Aceita → Motoboy pega → Entrega → Sucesso
 * 2. Cancelamento pela loja (antes de motoboy pegar)
 * 3. Cancelamento pelo cliente
 * 4. Cancelamento pelo motoboy (antes de pegar o produto)
 * 5. Cancelamento pelo motoboy (depois de pegar - com PIN)
 */

const axios = require('axios');
const io = require('socket.io-client');

const API_BASE = 'http://localhost:4000/api';
const SOCKET_URL = 'http://localhost:4000';

const USERS = {
  store: { email: 'lj@lj', password: 'lj' },
  motoboy: { email: 'mtb@mtb', password: 'mtb' },
  customer: { email: 'ceo@ceo', password: 'ceo' }
};

const STORE_ID = '69a53bf5c79d9fc08c077872';
const MOTOBOY_ID = '69a567db6b35b4e3b76f8be3';

let tokens = {};
let testResults = {
  total: 0,
  passed: 0,
  failed: 0,
  tests: []
};

// ============================================
// HELPER FUNCTIONS
// ============================================

function logTest(name, passed, message = '') {
  testResults.total++;
  if (passed) {
    testResults.passed++;
    console.log(`  ✅ ${name}`);
  } else {
    testResults.failed++;
    console.log(`  ❌ ${name} - ${message}`);
  }
  testResults.tests.push({ name, passed, message });
}

async function login(role) {
  try {
    const user = USERS[role];
    const res = await axios.post(`${API_BASE}/auth/login`, {
      email: user.email,
      password: user.password
    });
    tokens[role] = res.data.token;
    return true;
  } catch (err) {
    console.error(`❌ Login failed (${role}):`, err.response?.data?.error || err.message);
    return false;
  }
}

async function createOrder() {
  try {
    const res = await axios.post(`${API_BASE}/orders`, {
      storeId: STORE_ID,
      products: [{
        productId: '69a567b56b35b4e3b76f8bd8',  // iPhone 17 - produto válido
        productName: 'iPhone 17',
        quantity: 1,
        price: 150.00
      }],
      deliveryDistanceKm: 5.5,
      paymentMethod: 'pix',
      address: 'Rua Test, 123 - Teste, RJ',
      latitude: -22.8853519,
      longitude: -42.038915
    }, {
      headers: { 'Authorization': `Bearer ${tokens.customer}` }
    });
    return res.data._id;
  } catch (err) {
    console.error('Order creation failed:', err.response?.data?.error || err.message);
    return null;
  }
}

async function acceptOrder(orderId) {
  try {
    const res = await axios.post(`${API_BASE}/orders/${orderId}/accept`, {}, {
      headers: { 'Authorization': `Bearer ${tokens.store}` }
    });
    return res.data?.deliveryId || true;
  } catch (err) {
    console.error('Accept order failed:', err.response?.data?.error);
    return false;
  }
}

async function rejectOrder(orderId) {
  try {
    await axios.post(`${API_BASE}/orders/${orderId}/reject`, {
      reason: 'Teste de rejeição'
    }, {
      headers: { 'Authorization': `Bearer ${tokens.store}` }
    });
    return true;
  } catch (err) {
    console.error('Reject order failed:', err.response?.data?.error);
    return false;
  }
}

async function getDelivery(orderId) {
  try {
    const res = await axios.get(`${API_BASE}/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${tokens.customer}` }
    });
    return res.data.deliveryId || res.data.delivery?._id;
  } catch (err) {
    console.error('Get delivery failed:', err.message);
    return null;
  }
}

async function claimDelivery(deliveryId) {
  try {
    const res = await axios.post(`${API_BASE}/deliveries/${deliveryId}/claim`, {}, {
      headers: { 'Authorization': `Bearer ${tokens.motoboy}` }
    });
    return {
      pin: res.data.pin,                // PIN para entrega final (cliente)
      pinRetirada: res.data.pinRetirada // PIN de retirada (loja confirma que pegou)
    };
  } catch (err) {
    console.error('Claim delivery failed:', err.response?.data?.error);
    return null;
  }
}

async function validatePickupPin(deliveryId, pinRetirada) {
  try {
    await axios.post(`${API_BASE}/deliveries/${deliveryId}/validar-pin-retirada`, {
      pinRetirada: pinRetirada
    }, {
      headers: { 'Authorization': `Bearer ${tokens.store}` }
    });
    return true;
  } catch (err) {
    console.error('Validate pickup PIN failed:', err.response?.data?.error);
    return false;
  }
}

async function rejectDelivery(deliveryId, action = 'reassign') {
  try {
    const res = await axios.post(`${API_BASE}/deliveries/${deliveryId}/reject`, {
      action,
      reason: 'Teste de rejeição'
    }, {
      headers: { 'Authorization': `Bearer ${tokens.motoboy}` }
    });
    return res.data;
  } catch (err) {
    console.error('Reject delivery failed:', err.response?.data?.error);
    return null;
  }
}

async function finalizeDelivery(deliveryId, pin) {
  try {
    const res = await axios.post(`${API_BASE}/deliveries/${deliveryId}/finalizar`, {
      pin
    }, {
      headers: { 'Authorization': `Bearer ${tokens.motoboy}` }
    });
    return res.data;
  } catch (err) {
    console.error('Finalize delivery failed:', err.response?.data?.error);
    return null;
  }
}

async function confirmReturn(deliveryId, pinDevolucao) {
  try {
    const res = await axios.post(`${API_BASE}/deliveries/${deliveryId}/confirm-return`, {
      pinDevolucao
    }, {
      headers: { 'Authorization': `Bearer ${tokens.store}` }
    });
    return res.data;
  } catch (err) {
    console.error('Confirm return failed:', err.response?.data?.error);
    return null;
  }
}

async function getOrderStatus(orderId) {
  try {
    const res = await axios.get(`${API_BASE}/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${tokens.customer}` }
    });
    return res.data;
  } catch (err) {
    console.error('Get order status failed:', err.response?.data?.error);
    return null;
  }
}

// ============================================
// SCENARIO TESTS
// ============================================

async function testScenario1_CompleteDelivery() {
  console.log('\n📋 CENÁRIO 1: Fluxo Completo (Compra → Aceita → Entrega)');
  
  const orderId = await createOrder();
  if (!orderId) {
    logTest('Criar pedido', false, 'Falha ao criar');
    return;
  }
  logTest('Criar pedido', true);

  const accepted = await acceptOrder(orderId);
  if (!accepted) {
    logTest('Loja aceita pedido', false);
    return;
  }
  logTest('Loja aceita pedido', true);

  const deliveryId = await getDelivery(orderId);
  if (!deliveryId) {
    logTest('Obter delivery ID', false);
    return;
  }
  logTest('Obter delivery ID', true);

  // Motoboy claims delivery
  const pins = await claimDelivery(deliveryId);
  if (!pins) {
    logTest('Motoboy aceita entrega', false);
    return;
  }
  logTest('Motoboy faz pickup', true);

  // Loja valida PIN de retirada (confirma que foi entregue)
  const pinValidated = await validatePickupPin(deliveryId, pins.pinRetirada);
  if (!pinValidated) {
    logTest('Loja valida PIN', false);
    return;
  }
  logTest('Loja valida PIN', true);

  // Finalize delivery
  const finalizeResult = await finalizeDelivery(deliveryId, pins.pin);
  if (!finalizeResult) {
    logTest('Finalizar entrega', false, 'Talvez PIN incorreto ou delivery inválido');
  } else {
    logTest('Finalizar entrega', true);
  }
}

async function testScenario2_StoreRejectsOrder() {
  console.log('\n📋 CENÁRIO 2: Cancelamento pela Loja');
  
  const orderId = await createOrder();
  if (!orderId) {
    logTest('Criar pedido', false);
    return;
  }
  logTest('Criar pedido', true);

  const rejected = await rejectOrder(orderId);
  if (!rejected) {
    logTest('Loja rejeita pedido', false);
  } else {
    logTest('Loja rejeita pedido', true);
  }
}

async function testScenario3_CustomerCancelsOrder() {
  console.log('\n📋 CENÁRIO 3: Cancelamento pelo Cliente');
  
  const orderId = await createOrder();
  if (!orderId) {
    logTest('Criar pedido', false);
    return;
  }
  logTest('Criar pedido', true);

  // Accept order first
  await acceptOrder(orderId);

  // Customer cancels
  try {
    const res = await axios.post(`${API_BASE}/orders/${orderId}/cancel`, {
      reason: 'Teste de cancelamento'
    }, {
      headers: { 'Authorization': `Bearer ${tokens.customer}` }
    });
    logTest('Cliente cancela pedido', true);
  } catch (err) {
    logTest('Cliente cancela pedido', false, err.response?.data?.error);
  }
}

async function testScenario4_MotoboyRejectsBeforePickup() {
  console.log('\n📋 CENÁRIO 4: Cancelamento por Motoboy (Antes de Pegar)');
  
  const orderId = await createOrder();
  if (!orderId) {
    logTest('Criar pedido', false);
    return;
  }
  logTest('Criar pedido', true);

  const accepted = await acceptOrder(orderId);
  if (!accepted) {
    logTest('Loja aceita pedido', false);
    return;
  }
  logTest('Loja aceita pedido', true);

  const deliveryId = await getDelivery(orderId);
  if (!deliveryId) {
    logTest('Obter delivery ID', false);
    return;
  }
  logTest('Obter delivery ID', true);

  // Motoboy claims delivery
  const pin = await claimDelivery(deliveryId);
  if (!pin) {
    logTest('Motoboy aceita entrega', false);
    return;
  }
  logTest('Motoboy aceita entrega', true);

  // Motoboy rejects with 'reassign' (antes de pegar)
  const result = await rejectDelivery(deliveryId, 'reassign');
  if (!result) {
    logTest('Motoboy rejeita (reassign)', false);
  } else {
    logTest('Motoboy rejeita (reassign)', true);
  }
}

async function testScenario5_MotoboyRejectsAfterPickup() {
  console.log('\n📋 CENÁRIO 5: Rejeição por Motoboy (Depois de Pegar - com PIN)');
  
  const orderId = await createOrder();
  if (!orderId) {
    logTest('Criar pedido', false);
    return;
  }
  logTest('Criar pedido', true);

  const accepted = await acceptOrder(orderId);
  if (!accepted) {
    logTest('Loja aceita pedido', false);
    return;
  }
  logTest('Loja aceita pedido', true);

  const deliveryId = await getDelivery(orderId);
  if (!deliveryId) {
    logTest('Obter delivery ID', false);
    return;
  }
  logTest('Obter delivery ID', true);

  // Motoboy claims delivery
  const pins = await claimDelivery(deliveryId);
  if (!pins) {
    logTest('Motoboy aceita entrega', false);
    return;
  }
  logTest('Motoboy aceita entrega', true);

  // Loja valida PIN de retirada (motoboy pegou o produto)
  const pinValidated = await validatePickupPin(deliveryId, pins.pinRetirada);
  if (!pinValidated) {
    logTest('Loja valida PIN (pegou)', false);
    return;
  }
  logTest('Loja valida PIN (pegou)', true);

  // Motoboy rejects with 'cancel' (com PIN) - AFTER picking up
  const result = await rejectDelivery(deliveryId, 'cancel');
  if (!result) {
    logTest('Motoboy rejeita (cancel com PIN)', false);
  } else {
    logTest('Motoboy rejeita (cancel com PIN)', true);
    
    // Check if PIN was generated
    if (result.pinDevolucao) {
      logTest('PIN de devolução gerado', true);
      
      // 🆕 Loja confirma devolução com PIN
      const confirmResult = await confirmReturn(deliveryId, result.pinDevolucao);
      if (confirmResult) {
        logTest('Loja confirma devolução', true);
        
        // 🆕 Verificar se ordem foi cancelada
        const orderStatus = await getOrderStatus(orderId);
        if (orderStatus && orderStatus.status === 'cancelado') {
          logTest('Ordem automaticamente cancelada', true);
        } else {
          logTest('Ordem automaticamente cancelada', false, `Status: ${orderStatus?.status}`);
        }
      } else {
        logTest('Loja confirma devolução', false);
      }
    } else {
      logTest('PIN de devolução gerado', false, 'PIN não retornado');
    }
  }
}

// ============================================
// MAIN EXECUTION
// ============================================

async function runAllTests() {
  console.log('\n🧪━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  TESTE COMPLETO DO SISTEMA');
  console.log('🧪━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Login
  console.log('🔐 Fazendo login...');
  const storeOk = await login('store');
  const motoboyOk = await login('motoboy');
  const customerOk = await login('customer');

  if (!storeOk || !motoboyOk || !customerOk) {
    console.error('❌ Falha ao fazer login');
    process.exit(1);
  }
  console.log('✅ Login completo\n');

  // Run all test scenarios
  await testScenario1_CompleteDelivery();
  await testScenario2_StoreRejectsOrder();
  await testScenario3_CustomerCancelsOrder();
  await testScenario4_MotoboyRejectsBeforePickup();
  await testScenario5_MotoboyRejectsAfterPickup();

  // Print summary
  console.log('\n\n📊━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  RESUMO DOS TESTES');
  console.log('📊━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
  
  console.log(`Total de testes: ${testResults.total}`);
  console.log(`✅ Passaram: ${testResults.passed}`);
  console.log(`❌ Falharam: ${testResults.failed}`);
  console.log(`Taxa de sucesso: ${((testResults.passed / testResults.total) * 100).toFixed(1)}%\n`);

  if (testResults.failed > 0) {
    console.log('Testes que falharam:');
    testResults.tests
      .filter(t => !t.passed)
      .forEach(t => {
        console.log(`  ❌ ${t.name}: ${t.message}`);
      });
  }

  process.exit(testResults.failed > 0 ? 1 : 0);
}

// Run with error handling
runAllTests().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
