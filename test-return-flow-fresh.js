#!/usr/bin/env node

/**
 * Script para testar o fluxo de devolução com uma entrega NOVA
 * 1. Cria um novo pedido
 * 2. Aceita o pedido na loja
 * 3. Atribui motoboy
 * 4. Motoboy faz pickup
 * 5. Motoboy rejeita entrega
 * 6. Verifica se evento Socket chegou na loja
 */

const io = require('socket.io-client');
const axios = require('axios');

const API_BASE = 'http://localhost:4000/api';
const SOCKET_URL = 'http://localhost:4000';

// Usuários de teste (precisam existir no banco)
const STORE_USER = {
  email: 'lj@lj',
  password: 'lj'
};

const MOTOBOY_USER = {
  email: 'mtb@mtb',
  password: 'mtb'
};

const CUSTOMER_USER = {
  email: 'ceo@ceo',
  password: 'ceo'
};

const STORE_ID = '69a53bf5c79d9fc08c077872';

let STORE_TOKEN = '';
let MOTOBOY_TOKEN = '';
let CUSTOMER_TOKEN = '';
let ORDER_ID = '';
let DELIVERY_ID = '';

let eventReceived = false;
let eventData = null;

async function login(email, password) {
  try {
    const res = await axios.post(`${API_BASE}/auth/login`, {
      email,
      password
    });
    return res.data.token;
  } catch (err) {
    console.error(`❌ Login failed (${email}):`, err.response?.data?.error || err.message);
    return null;
  }
}

async function createOrder() {
  try {
    console.log('📦 Criando novo pedido via API...');
    
    const orderData = {
      storeId: STORE_ID,
      products: [
        {
          productId: '507f1f77bcf86cd799439011',
          productName: 'Test Product',
          quantity: 1,
          price: 50.00
        }
      ],
      deliveryDistanceKm: 5.5,
      paymentMethod: 'pix',
      address: 'Rua Test, 123 - Teste, RJ',
      latitude: -22.8853519,
      longitude: -42.038915
    };

    const res = await axios.post(`${API_BASE}/orders`, orderData, {
      headers: { 'Authorization': `Bearer ${CUSTOMER_TOKEN}` }
    });

    ORDER_ID = res.data._id;
    console.log(`✅ Pedido criado: ${ORDER_ID}`);
    return ORDER_ID;
  } catch (err) {
    console.error('❌ Erro ao criar pedido:', err.response?.data?.error || err.message);
    if (err.response?.data) {
      console.log('Response:', err.response.data);
    }
    return null;
  }
}

async function acceptOrder(orderId) {
  try {
    console.log('✅ Aceitando pedido na loja...');
    
    const res = await axios.post(`${API_BASE}/orders/${orderId}/accept`, {}, {
      headers: { 'Authorization': `Bearer ${STORE_TOKEN}` }
    });
    
    console.log(`✅ Pedido aceito`);
    return true;
  } catch (err) {
    console.error('❌ Erro ao aceitar pedido:', err.response?.data?.error || err.message);
    return false;
  }
}

async function run() {
  console.log('🔧 Teste de Devolução com PIN via Socket.IO');
  console.log(`📍 API: ${API_BASE}`);
  console.log(`📍 Socket: ${SOCKET_URL}`);
  console.log('');

  // ===== LOGIN =====
  console.log('===== STEP 1: Login =====');
  
  STORE_TOKEN = await login(STORE_USER.email, STORE_USER.password);
  if (!STORE_TOKEN) {
    console.error('❌ Falha ao fazer login da loja');
    process.exit(1);
  }
  console.log(`✅ Loja logada`);

  MOTOBOY_TOKEN = await login(MOTOBOY_USER.email, MOTOBOY_USER.password);
  if (!MOTOBOY_TOKEN) {
    console.error('❌ Falha ao fazer login do motoboy');
    process.exit(1);
  }
  console.log(`✅ Motoboy logado`);

  CUSTOMER_TOKEN = await login(CUSTOMER_USER.email, CUSTOMER_USER.password);
  if (!CUSTOMER_TOKEN) {
    console.error('❌ Falha ao fazer login do cliente');
    process.exit(1);
  }
  console.log(`✅ Cliente logado`);

  // ===== CREATE ORDER =====
  console.log('\n===== STEP 2: Criar novo pedido =====');
  ORDER_ID = await createOrder();
  if (!ORDER_ID) {
    console.error('❌ Falha ao criar pedido');
    process.exit(1);
  }

  // ===== ACCEPT ORDER =====
  console.log('\n===== STEP 3: Loja aceita pedido =====');
  const accepted = await acceptOrder(ORDER_ID);
  if (!accepted) {
    console.error('❌ Falha ao aceitar pedido');
    process.exit(1);
  }

  // ===== CONNECT STORE SOCKET =====
  console.log('\n===== STEP 4: Loja conecta Socket.IO =====');
  const storeSocket = io(SOCKET_URL, {
    auth: { token: STORE_TOKEN },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
  });

  await new Promise(resolve => {
    storeSocket.on('connect', () => {
      console.log(`✅ Socket conectado (ID: ${storeSocket.id})`);
      resolve();
    });

    storeSocket.on('connect_error', (err) => {
      console.error('❌ Socket erro:', err);
    });

    setTimeout(() => {
      console.error('❌ Timeout no connect');
      process.exit(1);
    }, 5000);
  });

  // ===== JOIN ROOM =====
  console.log('\n===== STEP 5: Loja entra na sala =====');
  storeSocket.emit('join', {
    room: `store:${STORE_ID}`,
    storeId: STORE_ID
  });
  console.log(`🔌 Sala: store:${STORE_ID}`);
  
  await new Promise(resolve => setTimeout(resolve, 500));

  // ===== REGISTER LISTENER =====
  console.log('\n===== STEP 6: Registrar listener =====');
  storeSocket.on('delivery:return_requested', (data) => {
    console.log('\n🎉 ✨ EVENTO RECEBIDO! ✨ 🎉');
    console.log('📡 delivery:return_requested chegou na loja!');
    console.log('Data:', JSON.stringify(data, null, 2));
    eventReceived = true;
    eventData = data;
    DELIVERY_ID = data.deliveryId || data.deliveryId;
  });

  console.log('📡 Aguardando: delivery:return_requested');

  // ===== GET DELIVERY ID =====
  console.log('\n===== STEP 7: Buscar delivery ID =====');
  try {
    const res = await axios.get(`${API_BASE}/orders/${ORDER_ID}`, {
      headers: { 'Authorization': `Bearer ${STORE_TOKEN}` }
    });
    DELIVERY_ID = res.data.deliveryId || res.data.delivery?._id;
    console.log(`📦 Delivery ID: ${DELIVERY_ID}`);
    
    if (!DELIVERY_ID) {
      console.warn('⚠️  Delivery não foi criado ainda. Pode ser que precisamos atribuir motoboy primeiro.');
      console.log('Aguardando um pouco...');
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Tentar novamente
      const res2 = await axios.get(`${API_BASE}/orders/${ORDER_ID}`, {
        headers: { 'Authorization': `Bearer ${STORE_TOKEN}` }
      });
      DELIVERY_ID = res2.data.deliveryId || res2.data.delivery?._id;
      console.log(`📦 Delivery ID (2ª tentativa): ${DELIVERY_ID}`);
    }
  } catch (err) {
    console.error('❌ Erro ao buscar delivery:', err.message);
  }

  if (!DELIVERY_ID) {
    console.error('❌ Não conseguiu obter delivery ID');
    process.exit(1);
  }

  // ===== MOTOBOY REJECTS =====
  console.log('\n===== STEP 8: Motoboy rejeita entrega =====');
  console.log(`🚚 POST /deliveries/${DELIVERY_ID}/reject`);
  console.log('   Body: { action: "cancel" }');

  try {
    const res = await axios.post(
      `${API_BASE}/deliveries/${DELIVERY_ID}/reject`,
      { action: 'cancel' },
      { headers: { 'Authorization': `Bearer ${MOTOBOY_TOKEN}` } }
    );
    console.log(`\n✅ Rejeição enviada com sucesso`);
    console.log(`   Status: ${res.status}`);
    console.log(`   PIN gerado: ${res.data.pinDevolucao}`);
  } catch (err) {
    console.error(`❌ Erro ao rejeitar:`, err.response?.data?.error || err.message);
    process.exit(1);
  }

  // ===== WAIT FOR EVENT =====
  console.log('\n===== STEP 9: Aguardando evento Socket (5 segundos) =====');
  
  await new Promise(resolve => {
    setTimeout(() => {
      resolve();
    }, 5000);
  });

  // ===== RESULTADO =====
  console.log('\n===== RESULTADO =====');
  if (eventReceived) {
    console.log('✅✅✅ SUCESSO! ✅✅✅');
    console.log('O evento delivery:return_requested foi recebido na loja!');
    console.log('Dados:', eventData);
  } else {
    console.log('❌ FALHA: Evento não foi recebido na loja');
  }

  storeSocket.disconnect();
  process.exit(eventReceived ? 0 : 1);
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
