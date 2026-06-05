/**
 * Test: Motoboy Cancellation Notification in Real-time
 * 
 * Scenario:
 * 1. Cliente creates an order
 * 2. Lojista accepts the order → creates delivery
 * 3. Motoboy accepts delivery (claims it)
 * 4. Lojista rejects the order → cancels delivery
 * 5. Motoboy receives 'delivery:cancelled' event via socket in real-time
 * 
 * Expected: Motoboy page shows cancellation immediately WITHOUT refresh
 */

const http = require('http');
const io = require('socket.io-client');
const axios = require('axios');

const API_BASE = 'http://localhost:4000';
const SOCKET_URL = 'http://localhost:4000';

// Test users
let tokens = {
  cliente: null,
  lojista: null,
  motoboy: null,
};

let ids = {
  clienteId: null,
  lojaId: null,
  motoboyId: null,
  orderId: null,
  deliveryId: null,
  storeId: null,
};

// Socket clients
let sockets = {
  lojista: null,
  motoboy: null,
};

// Test results
let testResults = {
  clienteOrder: false,
  lojistaAccepted: false,
  motoboyAccepted: false,
  cancelledNotificationSent: false,
  motoboyReceivedNotification: false,
};

async function login(email, password) {
  const res = await axios.post(`${API_BASE}/auth/login`, {
    email,
    password,
  });
  return res.data.token;
}

async function getUserById(token, userId) {
  const res = await axios.get(`${API_BASE}/users/${userId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

async function createOrder(token, storeId, products) {
  const res = await axios.post(`${API_BASE}/orders`, {
    storeId,
    products,
  }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data._id;
}

async function acceptOrder(token, orderId) {
  const res = await axios.post(`${API_BASE}/orders/${orderId}/accept`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

async function rejectOrder(token, orderId, reason) {
  const res = await axios.post(`${API_BASE}/orders/${orderId}/reject`, {
    reason,
    reasonCode: 'lojista_cancellation',
  }, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

async function claimDelivery(token, deliveryId) {
  const res = await axios.post(`${API_BASE}/deliveries/${deliveryId}/claim`, {}, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

async function getDelivery(token, deliveryId) {
  const res = await axios.get(`${API_BASE}/deliveries/${deliveryId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

async function getOrder(token, orderId) {
  const res = await axios.get(`${API_BASE}/orders/${orderId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

async function getAvailableDeliveries(token) {
  const res = await axios.get(`${API_BASE}/deliveries/available`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  return res.data;
}

function connectSocket(token, userId, role) {
  return new Promise((resolve) => {
    const socket = io(SOCKET_URL, {
      auth: { token },
      reconnection: true,
    });

    socket.on('connect', () => {
      console.log(`✅ [${role}] Socket connected: ${socket.id}`);
      resolve(socket);
    });

    socket.on('connect_error', (err) => {
      console.error(`❌ [${role}] Socket error:`, err);
    });

    socket.on('disconnect', (reason) => {
      console.warn(`⚠️ [${role}] Socket disconnected:`, reason);
    });
  });
}

async function runTest() {
  try {
    console.log('\n🚀 Starting Motoboy Cancellation Notification Test\n');
    console.log(`📍 API: ${API_BASE}`);
    console.log(`📍 Socket: ${SOCKET_URL}\n`);

    // ============ STEP 1: Login all users ============
    console.log('📝 Step 1: Logging in users...');
    tokens.cliente = await login('cliente1@test.com', 'senha123');
    tokens.lojista = await login('loja1@test.com', 'senha123');
    tokens.motoboy = await login('moto1@test.com', 'senha123');
    console.log('✅ All users logged in\n');

    // ============ STEP 2: Get user IDs and store ============
    console.log('📝 Step 2: Getting user info...');
    const clienteUser = await getUserById(tokens.cliente, 'me');
    const lojistaUser = await getUserById(tokens.lojista, 'me');
    const motoboyUser = await getUserById(tokens.motoboy, 'me');

    ids.clienteId = clienteUser._id;
    ids.lojaId = lojistaUser.storeId;
    ids.motoboyId = motoboyUser._id;
    ids.storeId = lojistaUser.storeId;

    console.log(`  ✓ Cliente ID: ${ids.clienteId}`);
    console.log(`  ✓ Lojista ID: ${ids.lojaId}`);
    console.log(`  ✓ Motoboy ID: ${ids.motoboyId}\n`);

    // ============ STEP 3: Cliente creates order ============
    console.log('📝 Step 3: Cliente creating order...');
    ids.orderId = await createOrder(tokens.cliente, ids.storeId, [
      {
        productId: '507f1f77bcf86cd799439011', // Dummy ID
        quantity: 1,
        price: 50.00,
      },
    ]);
    console.log(`✅ Order created: ${ids.orderId}\n`);
    testResults.clienteOrder = true;

    // ============ STEP 4: Connect sockets for lojista and motoboy ============
    console.log('📝 Step 4: Connecting socket clients...');
    sockets.lojista = await connectSocket(tokens.lojista, ids.lojaId, 'LOJISTA');
    sockets.motoboy = await connectSocket(tokens.motoboy, ids.motoboyId, 'MOTOBOY');
    console.log('');

    // ============ STEP 5: Lojista accepts order → creates delivery ============
    console.log('📝 Step 5: Lojista accepting order...');
    const acceptResult = await acceptOrder(tokens.lojista, ids.orderId);
    ids.deliveryId = acceptResult.deliveryId;
    console.log(`✅ Order accepted, Delivery created: ${ids.deliveryId}\n`);
    testResults.lojistaAccepted = true;

    // Wait a moment for socket events
    await new Promise(resolve => setTimeout(resolve, 500));

    // ============ STEP 6: Motoboy claims delivery ============
    console.log('📝 Step 6: Motoboy claiming delivery...');
    await claimDelivery(tokens.motoboy, ids.deliveryId);
    console.log(`✅ Motoboy claimed delivery\n`);
    testResults.motoboyAccepted = true;

    // Wait a moment for socket events
    await new Promise(resolve => setTimeout(resolve, 500));

    // ============ STEP 7: Setup listener for 'delivery:cancelled' on motoboy socket ============
    console.log('📝 Step 7: Setting up motoboy listener for delivery:cancelled...');
    let cancellationReceived = false;
    let cancellationData = null;

    sockets.motoboy.on('delivery:cancelled', (data) => {
      console.log('🎯 [MOTOBOY] Received delivery:cancelled event:', data);
      cancellationReceived = true;
      cancellationData = data;
      testResults.motoboyReceivedNotification = true;
    });

    console.log('✅ Listener registered\n');

    // ============ STEP 8: Lojista rejects order → delivery should be cancelled ============
    console.log('📝 Step 8: Lojista rejecting order (cancelling delivery)...');
    const rejectResult = await rejectOrder(tokens.lojista, ids.orderId, 'Test rejection');
    console.log(`✅ Order rejected: ${rejectResult.orderId}`);
    console.log(`✅ Cancellation ID: ${rejectResult.cancellationId}\n`);
    testResults.cancelledNotificationSent = true;

    // Wait for socket event to reach motoboy
    console.log('⏳ Waiting for socket event...');
    let waitCounter = 0;
    while (!cancellationReceived && waitCounter < 20) {
      await new Promise(resolve => setTimeout(resolve, 100));
      waitCounter++;
    }

    if (cancellationReceived) {
      console.log(`\n✅ MOTOBOY RECEIVED CANCELLATION NOTIFICATION!`);
      console.log(`   Event data: ${JSON.stringify(cancellationData, null, 2)}`);
    } else {
      console.log(`\n❌ TIMEOUT: Motoboy did not receive notification after 2 seconds`);
    }

    // ============ STEP 9: Verify delivery status ============
    console.log('\n📝 Step 9: Verifying delivery status...');
    const finalDelivery = await getDelivery(tokens.motoboy, ids.deliveryId);
    console.log(`  Delivery status: ${finalDelivery.status}`);
    console.log(`  Expected: cancelled\n`);

    // ============ TEST SUMMARY ============
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY');
    console.log('='.repeat(60));
    console.log(`✅ Cliente Order Created: ${testResults.clienteOrder}`);
    console.log(`✅ Lojista Accepted Order: ${testResults.lojistaAccepted}`);
    console.log(`✅ Motoboy Claimed Delivery: ${testResults.motoboyAccepted}`);
    console.log(`✅ Cancellation Sent: ${testResults.cancelledNotificationSent}`);
    console.log(`✅ Motoboy Received Notification: ${testResults.motoboyReceivedNotification}`);
    
    const allPassed = Object.values(testResults).every(val => val === true);
    console.log('\n' + (allPassed ? '🎉 ALL TESTS PASSED!' : '❌ SOME TESTS FAILED'));
    console.log('='.repeat(60) + '\n');

    // Cleanup
    sockets.lojista.disconnect();
    sockets.motoboy.disconnect();

    process.exit(allPassed ? 0 : 1);

  } catch (error) {
    console.error('\n❌ Test failed with error:', error.message);
    if (error.response?.data) {
      console.error('API Response:', error.response.data);
    }
    process.exit(1);
  }
}

// Run the test
runTest();
