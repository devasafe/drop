#!/usr/bin/env node

/**
 * Script para testar o fluxo de devolução Socket.IO:
 * 1. Primeiro faz login para pegar tokens válidos
 * 2. Loja conecta ao Socket.IO e entra na sala
 * 3. Motoboy faz rejeição de entrega (simula via API)
 * 4. Verifica se o evento chegou na loja
 */

const io = require('socket.io-client');
const axios = require('axios');

const API_BASE = 'http://localhost:4000/api';
const SOCKET_URL = 'http://localhost:4000';

// Usuários de teste (precisam existir no banco)
const STORE_USER = {
  email: 'lj@lj',
  password: 'lj',
  role: 'lojista'
};

const MOTOBOY_USER = {
  email: 'mtb@mtb',
  password: 'mtb',
  role: 'motoboy'  
};

// IDs do banco (teste)
let STORE_ID = '69a53bf5c79d9fc08c077872'; // ✅ Valor descoberto nos logs
let DELIVERY_ID = '69a6b53995cdc8476aa508ac'; // Pode variar

let STORE_TOKEN = '';
let MOTOBOY_TOKEN = '';

let serverEventsReceived = {
  'delivery:return_requested': null
};

async function login(email, password) {
  try {
    const res = await axios.post(`${API_BASE}/auth/login`, {
      email,
      password
    });
    return res.data.token;
  } catch (err) {
    console.error(`❌ Erro ao fazer login (${email}):`, err.response?.data?.error || err.message);
    return null;
  }
}

async function getStoreInfo(token) {
  try {
    const res = await axios.get(`${API_BASE}/users/me`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    return res.data.storeId || res.data._id;
  } catch (err) {
    console.error('❌ Erro ao buscar info do usuário:', err.response?.data?.error || err.message);
    return null;
  }
}

async function getActiveDelivery(token, storeId) {
  try {
    const res = await axios.get(`${API_BASE}/deliveries?storeId=${storeId}&status=enviado`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    if (res.data && res.data.length > 0) {
      return res.data[0]._id;
    }
    // Se não achar, retorna o ID hardcoded
    return DELIVERY_ID;
  } catch (err) {
    console.log('⚠️  Não conseguiu buscar delivery ativo, usando ID hardcoded');
    return DELIVERY_ID;
  }
}

async function run() {
  console.log('🔧 Iniciando teste de Socket.IO para devolução');
  console.log(`📍 API Base: ${API_BASE}`);
  console.log(`📍 Socket URL: ${SOCKET_URL}`);
  console.log('');

  // ===== PASSO 1: Login para pegar tokens válidos =====
  console.log('===== PASSO 1: Login dos usuários =====');
  
  STORE_TOKEN = await login(STORE_USER.email, STORE_USER.password);
  if (!STORE_TOKEN) {
    console.error('❌ Não conseguiu fazer login da loja');
    process.exit(1);
  }
  console.log('✅ Loja logada');

  MOTOBOY_TOKEN = await login(MOTOBOY_USER.email, MOTOBOY_USER.password);
  if (!MOTOBOY_TOKEN) {
    console.error('❌ Não conseguiu fazer login do motoboy');
    process.exit(1);
  }
  console.log('✅ Motoboy logado');

  // ===== PASSO 2: Buscar IDs =====
  console.log('\n===== PASSO 2: Preparar IDs =====');
  // DEIXAR STORE_ID já definido acima
  
  console.log(`📋 Store ID (hardcoded): ${STORE_ID}`);
  console.log(`📋 Delivery ID: ${DELIVERY_ID}`);

  // ===== PASSO 3: Loja conecta ao Socket.IO =====
  console.log('\n===== PASSO 3: Loja conecta ao Socket.IO =====');
  const storeSocket = io(SOCKET_URL, {
    auth: { token: STORE_TOKEN },
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    reconnectionAttempts: 5
  });

  await new Promise(resolve => {
    storeSocket.on('connect', () => {
      console.log('✅ Loja conectada ao Socket.IO');
      console.log(`   Socket ID: ${storeSocket.id}`);
      resolve();
    });

    storeSocket.on('connect_error', (err) => {
      console.error('❌ Erro ao conectar loja:', err);
    });

    setTimeout(() => {
      console.error('❌ Timeout ao conectar');
      process.exit(1);
    }, 5000);
  });

  // ===== PASSO 4: Loja entra na sala =====
  console.log('\n===== PASSO 4: Loja entra na sala =====');
  storeSocket.emit('join', {
    room: `store:${STORE_ID}`,
    storeId: STORE_ID
  });
  console.log(`🔌 [SOCKET] Loja entrou na sala: store:${STORE_ID}`);

  // Aguardar um pouco
  await new Promise(resolve => setTimeout(resolve, 500));

  // ===== PASSO 5: Loja registra listener =====
  console.log('\n===== PASSO 5: Loja registra listener =====');
  storeSocket.on('delivery:return_requested', (data) => {
    console.log('🎉 ✅ EVENTO RECEBIDO NA LOJA!');
    console.log('📨 Dados do evento:', JSON.stringify(data, null, 2));
    serverEventsReceived['delivery:return_requested'] = data;
  });
  console.log('📡 Loja aguardando evento "delivery:return_requested"');

  // Aguardar um pouco para o listener estar pronto
  await new Promise(resolve => setTimeout(resolve, 1000));

  // ===== PASSO 6: Motoboy rejeita a entrega (via API) =====
  console.log('\n===== PASSO 6: Motoboy rejeita a entrega =====');
  try {
    console.log(`📤 POST /deliveries/${DELIVERY_ID}/reject`);
    console.log('   Body: { action: "cancel" }');
    
    const response = await axios.post(
      `${API_BASE}/deliveries/${DELIVERY_ID}/reject`,
      { action: 'cancel' },
      {
        headers: {
          'Authorization': `Bearer ${MOTOBOY_TOKEN}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log(`✅ Resposta da API: Status ${response.status}`);
    console.log('   Resposta:', JSON.stringify(response.data, null, 2));
  } catch (err) {
    console.error('❌ Erro ao rejeitar entrega:');
    console.error('   Status:', err.response?.status);
    console.error('   Erro:', err.response?.data || err.message);
  }

  // ===== PASSO 7: Aguardar evento =====
  console.log('\n===== PASSO 7: Aguardando evento (5 segundos) =====');
  await new Promise(resolve => setTimeout(resolve, 5000));

  // ===== RESULTADOS =====
  console.log('\n===== 📊 RESULTADOS =====');
  if (serverEventsReceived['delivery:return_requested']) {
    console.log('✅ 🎉 SUCESSO! Evento chegou na loja');
    console.log('   Dados recebidos:', JSON.stringify(serverEventsReceived['delivery:return_requested'], null, 2));
  } else {
    console.log('❌ FALHA: Evento NÃO chegou na loja');
    console.log('   Verifique os logs do servidor para mais detalhes');
  }

  // ===== CLEANUP =====
  console.log('\n🧹 Limpando conexões...');
  storeSocket.disconnect();
  process.exit(serverEventsReceived['delivery:return_requested'] ? 0 : 1);
}

// Executar
run().catch(err => {
  console.error('Erro:', err);
  process.exit(1);
});
