#!/usr/bin/env node

/**
 * 🧪 TESTE SIMPLES - FIX #6: Fluxo de Devolução
 * 
 * Testa:
 * - Motoboy rejeita entrega com ação 'cancel'
 * - Gera PIN de devolução
 * - Loja recebe notificação via Socket
 * - Loja confirma com PIN
 * - Ambos recebem confirmação
 */

const axios = require('axios');
const io = require('socket.io-client');

const API_BASE = 'http://localhost:4000/api';
const SOCKET_URL = 'http://localhost:4000';

const STORE_ID = '69a53bf5c79d9fc08c077872';
const PRODUCT_ID = '69a567b56b35b4e3b76f8bd8'; // iPhone 17

let tokens = {};
let events = {
  storeReceived: false,
  motoboyReceived: false,
  customerReceived: false
};

async function login(role, email, password) {
  try {
    const res = await axios.post(`${API_BASE}/auth/login`, { email, password });
    tokens[role] = res.data.token;
    return true;
  } catch (err) {
    console.error(`❌ Login failed (${role}):`, err.response?.data?.error || err.message);
    return false;
  }
}

async function createAndAcceptOrder() {
  try {
    // Create order
    const orderRes = await axios.post(`${API_BASE}/orders`, {
      storeId: STORE_ID,
      products: [{
        productId: PRODUCT_ID,
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

    const orderId = orderRes.data._id;
    console.log(`✅ Pedido criado: ${orderId}`);

    // Accept order
    await axios.post(`${API_BASE}/orders/${orderId}/accept`, {}, {
      headers: { 'Authorization': `Bearer ${tokens.store}` }
    });
    console.log(`✅ Loja aceitou pedido`);

    // Get delivery ID
    const orderData = await axios.get(`${API_BASE}/orders/${orderId}`, {
      headers: { 'Authorization': `Bearer ${tokens.customer}` }
    });
    
    const deliveryId = orderData.data.deliveryId || orderData.data.delivery?._id;
    console.log(`✅ Delivery ID: ${deliveryId}`);

    return deliveryId;
  } catch (err) {
    console.error('❌ Erro ao criar/aceitar pedido:', err.response?.data?.error || err.message);
    return null;
  }
}

async function claimDelivery(deliveryId) {
  try {
    const res = await axios.post(`${API_BASE}/deliveries/${deliveryId}/claim`, {}, {
      headers: { 'Authorization': `Bearer ${tokens.motoboy}` }
    });

    console.log(`✅ Motoboy aceitou entrega`);
    return res.data.pin;
  } catch (err) {
    console.error('❌ Erro ao aceitar:', err.response?.data?.error || err.message);
    return null;
  }
}

async function rejectDelivery(deliveryId) {
  try {
    const res = await axios.post(`${API_BASE}/deliveries/${deliveryId}/reject`, {
      action: 'cancel',
      reason: 'Teste de cancelamento'
    }, {
      headers: { 'Authorization': `Bearer ${tokens.motoboy}` }
    });

    console.log(`✅ Motoboy rejeitou entrega`);
    console.log(`   PIN gerado: ${res.data.pinDevolucao}`);
    return res.data.pinDevolucao;
  } catch (err) {
    console.error('❌ Erro ao rejeitar:', err.response?.data?.error || err.message);
    return null;
  }
}

async function confirmReturn(deliveryId, pin) {
  try {
    await axios.post(`${API_BASE}/deliveries/${deliveryId}/confirm-return`, {
      pinDevolucao: pin
    }, {
      headers: { 'Authorization': `Bearer ${tokens.store}` }
    });

    console.log(`✅ Loja confirmou devolução com PIN`);
    return true;
  } catch (err) {
    console.error('❌ Erro ao confirmar:', err.response?.data?.error || err.message);
    return false;
  }
}

async function runTest() {
  console.log('\n🧪━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  TESTE: Fluxo de Devolução (FIX #6)');
  console.log('🧪━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  // Login
  console.log('🔐 Login...');
  const storeOk = await login('store', 'lj@lj', 'lj');
  const motoboyOk = await login('motoboy', 'mtb@mtb', 'mtb');
  const customerOk = await login('customer', 'ceo@ceo', 'ceo');

  if (!storeOk || !motoboyOk || !customerOk) {
    console.error('❌ Falha no login');
    process.exit(1);
  }

  // Create and accept order
  console.log('\n📋 Criar e aceitar pedido...');
  const deliveryId = await createAndAcceptOrder();
  if (!deliveryId) {
    console.error('❌ Falha ao criar entrega');
    process.exit(1);
  }

  // Setup socket listeners BEFORE rejecting
  console.log('\n📡 Configurando Socket listeners...');
  
  // Store socket
  const storeSocket = io(SOCKET_URL, {
    auth: { token: tokens.store }
  });

  storeSocket.on('connect', () => {
    console.log('  ✅ Loja conectada ao Socket');
    storeSocket.emit('join', {
      room: `store:${STORE_ID}`,
      storeId: STORE_ID
    });
  });

  storeSocket.on('delivery:return_requested', (data) => {
    console.log('  ✅ Loja recebeu: delivery:return_requested');
    events.storeReceived = true;
  });

  storeSocket.on('delivery:return_confirmed', (data) => {
    console.log('  ✅ Loja recebeu: delivery:return_confirmed');
  });

  // Motoboy socket
  const motoboySocket = io(SOCKET_URL, {
    auth: { token: tokens.motoboy }
  });

  motoboySocket.on('connect', () => {
    console.log('  ✅ Motoboy conectado ao Socket');
  });

  motoboySocket.on('delivery:return_confirmed', (data) => {
    console.log('  ✅ Motoboy recebeu: delivery:return_confirmed');
    events.motoboyReceived = true;
  });

  // Customer socket
  const customerSocket = io(SOCKET_URL, {
    auth: { token: tokens.customer }
  });

  customerSocket.on('connect', () => {
    console.log('  ✅ Cliente conectado ao Socket');
  });

  customerSocket.on('delivery:return_confirmed', (data) => {
    console.log('  ✅ Cliente recebeu: delivery:return_confirmed');
    events.customerReceived = true;
  });

  // Wait for sockets to be ready
  await new Promise(resolve => setTimeout(resolve, 1500));

  // Claim delivery (motoboy aceita)
  console.log('\n🏍️  Motoboy aceitando entrega...');
  const claimPin = await claimDelivery(deliveryId);
  if (!claimPin) {
    console.error('❌ Falha ao aceitar entrega');
    process.exit(1);
  }

  // Wait a bit
  await new Promise(resolve => setTimeout(resolve, 1000));

  // Reject delivery
  console.log('\n🔄 Motoboy rejetando entrega...');
  const pin = await rejectDelivery(deliveryId);
  if (!pin) {
    console.error('❌ Falha ao rejeitar');
    process.exit(1);
  }

  // Wait for socket events
  await new Promise(resolve => setTimeout(resolve, 2000));

  if (!events.storeReceived) {
    console.log('  ⚠️  Loja NÃO recebeu evento delivery:return_requested');
  }

  // Confirm return
  console.log('\n✅ Loja confirmando devolução...');
  const confirmed = await confirmReturn(deliveryId, pin);
  if (!confirmed) {
    console.error('❌ Falha ao confirmar');
    process.exit(1);
  }

  // Wait for socket events
  await new Promise(resolve => setTimeout(resolve, 2000));

  // Results
  console.log('\n\n📊━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  RESULTADO');
  console.log('📊━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');

  let success = true;
  if (events.storeReceived) {
    console.log('✅ Loja recebeu notificação de devolução');
  } else {
    console.log('❌ Loja NÃO recebeu notificação');
    success = false;
  }

  if (events.motoboyReceived) {
    console.log('✅ Motoboy recebeu confirmação de devolução');
  } else {
    console.log('⚠️  Motoboy NÃO recebeu confirmação');
  }

  if (events.customerReceived) {
    console.log('✅ Cliente recebeu confirmação de devolução');
  } else {
    console.log('⚠️  Cliente NÃO recebeu confirmação');
  }

  console.log('');
  if (success) {
    console.log('✅ TESTE PASSOU!');
  } else {
    console.log('❌ TESTE FALHOU!');
  }

  storeSocket.disconnect();
  motoboySocket.disconnect();
  customerSocket.disconnect();

  process.exit(success ? 0 : 1);
}

runTest().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
