#!/usr/bin/env node

/**
 * Simple test - just check if Socket.IO is working
 * This test assumes you have a delivery in 'em_transito' or 'enviado' state
 */

const io = require('socket.io-client');
const axios = require('axios');

const API_BASE = 'http://localhost:4000/api';
const SOCKET_URL = 'http://localhost:4000';

// Use credentials from the environment
const STORE_ID = '69a53bf5c79d9fc08c077872'; // lj's store
const DELIVERY_ID = process.env.DELIVERY_ID || '69a6b53995cdc8476aa508ac';

let STORE_TOKEN = '';
let MOTOBOY_TOKEN = '';
let eventReceived = {
  returnRequested: false,
  data: null
};

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

async function resetDeliveryState() {
  try {
    console.log('🔧 Tentando resetar delivery para estado válido...');
    // Try to update delivery to 'em_transito' state
    const res = await axios.put(
      `${API_BASE}/deliveries/${DELIVERY_ID}`,
      { status: 'em_transito' },
      { headers: { 'Authorization': `Bearer ${STORE_TOKEN}` } }
    );
    console.log('✅ Delivery atualizado para estado válido');
    return true;
  } catch (err) {
    console.log('⚠️  Não conseguiu atualizar delivery, continuando...');
    return false;
  }
}

async function run() {
  console.log('\n🔧━━━━━━━━━━━━━ TESTE SOCKET - DEVOLUÇÃO ━━━━━━━━━━━━━━');
  console.log(`📍 API: ${API_BASE}`);
  console.log(`📍 Socket: ${SOCKET_URL}`);
  console.log(`📍 Store: ${STORE_ID}`);
  console.log(`📍 Delivery: ${DELIVERY_ID}\n`);

  // ===== LOGIN =====
  console.log('▶︎ STEP 1: Login dos usuários');
  
  STORE_TOKEN = await login('lj@lj', 'lj');
  if (!STORE_TOKEN) {
    console.error('❌ Falha ao fazer login da loja');
    process.exit(1);
  }
  console.log('  ✅ Loja logada');

  MOTOBOY_TOKEN = await login('mtb@mtb', 'mtb');
  if (!MOTOBOY_TOKEN) {
    console.error('❌ Falha ao fazer login do motoboy');
    process.exit(1);
  }
  console.log('  ✅ Motoboy logado\n');

  // ===== CONNECT STORE SOCKET =====
  console.log('▶︎ STEP 2: Loja conecta Socket.IO');
  const storeSocket = io(SOCKET_URL, {
    auth: { token: STORE_TOKEN },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
  });

  let socketConnected = false;
  await new Promise(resolve => {
    storeSocket.on('connect', () => {
      console.log(`  ✅ Socket conectado (ID: ${storeSocket.id})`);
      socketConnected = true;
      resolve();
    });

    storeSocket.on('connect_error', (err) => {
      console.error('  ❌ Socket erro:', err);
      resolve();
    });

    setTimeout(() => {
      console.error('  ❌ Timeout no connect');
      resolve();
    }, 5000);
  });

  if (!socketConnected) {
    process.exit(1);
  }
  console.log('');

  // ===== JOIN ROOM =====
  console.log('▶︎ STEP 3: Loja entra na sala');
  storeSocket.emit('join', {
    room: `store:${STORE_ID}`,
    storeId: STORE_ID
  });
  console.log(`  🔌 Sala: store:${STORE_ID}`);
  
  await new Promise(resolve => setTimeout(resolve, 1000));
  console.log('');

  // ===== REGISTER LISTENER =====
  console.log('▶︎ STEP 4: Registrar listener');
  storeSocket.on('delivery:return_requested', (data) => {
    console.log('\n🎉━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('  ✅✅✅  EVENTO RECEBIDO!  ✅✅✅');
    console.log('🎉━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
    console.log('  📡 delivery:return_requested chegou na loja!');
    console.log('  📦 Delivery ID:', data.deliveryId);
    console.log('  📋 Order ID:', data.orderId);
    console.log('  🔐 PIN:', data.pinDevolucao);
    console.log('  🏍️ Motoboy:', data.motoboyId);
    console.log('  ');
    eventReceived.returnRequested = true;
    eventReceived.data = data;
  });

  console.log('  📡 Aguardando: delivery:return_requested\n');

  // ===== MOTOBOY REJECTS =====
  console.log('▶︎ STEP 5: Motoboy rejeita entrega');
  console.log(`  📤 POST /deliveries/${DELIVERY_ID}/reject\n`);

  try {
    const res = await axios.post(
      `${API_BASE}/deliveries/${DELIVERY_ID}/reject`,
      { action: 'cancel' },
      { headers: { 'Authorization': `Bearer ${MOTOBOY_TOKEN}` } }
    );
    
    console.log('  ✅ Rejeição OK');
    console.log(`      Status: ${res.status}`);
    console.log(`      Status Devolução: ${res.data.statusDevolucao}`);
    console.log(`      PIN gerado: ${res.data.pinDevolucao}\n`);
  } catch (err) {
    const errMsg = err.response?.data?.error || err.message;
    if (errMsg.includes('cancelled') || errMsg.includes('confirmado')) {
      console.log(`  ⚠️  Delivery já em estado final: ${errMsg}`);
      console.log(`  💡 Para novo teste, use outro delivery_id\n`);
    } else {
      console.error(`  ❌ Erro: ${errMsg}\n`);
    }
  }

  // ===== WAIT FOR EVENT =====
  console.log('▶︎ STEP 6: Aguardando evento Socket');
  await new Promise(resolve => {
    setTimeout(() => {
      console.log('');
      resolve();
    }, 6000);
  });

  // ===== RESULT =====
  console.log('━━━━━━━━━━━━━━━━ RESULTADO ━━━━━━━━━━━━━━\n');
  
  if (eventReceived.returnRequested) {
    console.log('✅ SUCESSO!');
    console.log('O sistema está funcionando corretamente.');
    console.log('Evento Socket chegou na loja conforme esperado.\n');
    process.exit(0);
  } else {
    console.log('❌ FALHA');
    console.log('Evento Socket não foi recebido na loja.');
    console.log('Verifique os logs do backend e frontend.\n');
    process.exit(1);
  }
}

run().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
