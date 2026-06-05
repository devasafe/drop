#!/usr/bin/env node

/**
 * Test Script: Store Dashboard Button Rendering
 * 
 * This script tests the conditional button rendering logic in store-dashboard.tsx
 * based on the delivery status.
 * 
 * Test Flow:
 * 1. Create a new order
 * 2. Accept the order (delivery status becomes 'assigned')
 * 3. Verify buttons change from [Aceitar, Rejeitar, Detalhes] to [Detalhes, Cancelar]
 * 4. Complete the delivery
 * 5. Verify order moves to history
 */

const axios = require('axios');
const WebSocket = require('ws');

const BASE_URL = 'http://localhost:3000';
const SOCKET_URL = 'http://localhost:3000';

let testResults = {
  created: false,
  accepted: false,
  buttonsChanged: false,
  completed: false,
  movedToHistory: false
};

// Helper to get authorization header
const getAuthHeader = (token) => ({
  headers: { 'Authorization': `Bearer ${token}` }
});

async function testStoreButtonRendering() {
  console.log('🧪 Starting Store Dashboard Button Rendering Test\n');

  try {
    // Step 1: Login as store owner
    console.log('📝 Step 1: Logging in as store owner...');
    const loginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'store@test.com',
      password: 'password123'
    });

    const storeToken = loginRes.data.token;
    const storeId = loginRes.data.user.storeId;
    console.log(`✅ Logged in. Token: ${storeToken.substring(0, 20)}...`);
    console.log(`✅ Store ID: ${storeId}\n`);

    // Step 2: Login as customer
    console.log('📝 Step 2: Logging in as customer...');
    const customerLoginRes = await axios.post(`${BASE_URL}/auth/login`, {
      email: 'customer@test.com',
      password: 'password123'
    });

    const customerToken = customerLoginRes.data.token;
    const customerId = customerLoginRes.data.user._id;
    console.log(`✅ Customer logged in. Token: ${customerToken.substring(0, 20)}...`);
    console.log(`✅ Customer ID: ${customerId}\n`);

    // Step 3: Create an order
    console.log('📝 Step 3: Creating a new order...');
    const orderRes = await axios.post(`${BASE_URL}/orders`, {
      storeId: storeId,
      items: [
        {
          productId: 'test-product-1',
          quantity: 1,
          price: 50
        }
      ],
      deliveryAddress: {
        street: 'Test Street',
        number: '123',
        neighborhood: 'Test Hood',
        city: 'Test City',
        state: 'TS',
        zip: '12345-000'
      }
    }, getAuthHeader(customerToken));

    const orderId = orderRes.data._id;
    console.log(`✅ Order created. Order ID: ${orderId}`);
    console.log(`✅ Delivery Status: ${orderRes.data.delivery?.status || 'pending'}\n`);
    testResults.created = true;

    // Step 4: Accept the order as store
    console.log('📝 Step 4: Accepting order as store...');
    const acceptRes = await axios.post(
      `${BASE_URL}/orders/${orderId}/accept`,
      {},
      getAuthHeader(storeToken)
    );

    console.log(`✅ Order accepted`);
    console.log(`✅ Delivery Status: ${acceptRes.data.delivery?.status || 'pending'}`);
    console.log(`✅ Delivery ID: ${acceptRes.data.delivery?._id}\n`);
    testResults.accepted = true;

    // Step 5: Verify button rendering logic
    console.log('📝 Step 5: Verifying button rendering logic...');
    const getOrderRes = await axios.get(
      `${BASE_URL}/orders/${orderId}`,
      getAuthHeader(storeToken)
    );

    const order = getOrderRes.data;
    console.log(`Order Data:`);
    console.log(`  - _id: ${order._id}`);
    console.log(`  - status: ${order.status}`);
    console.log(`  - delivery._id: ${order.delivery?._id}`);
    console.log(`  - delivery.status: ${order.delivery?.status}\n`);

    // Check rendering condition
    const shouldShowAcceptReject = !order.delivery || order.delivery.status === 'pending';
    console.log(`Rendering Logic Check:`);
    console.log(`  - Condition: !delivery || delivery.status === 'pending'`);
    console.log(`  - Result: ${shouldShowAcceptReject}`);
    
    if (shouldShowAcceptReject) {
      console.log(`  ❌ ERROR: Should show [Detalhes, Cancelar] but showing [Aceitar, Rejeitar, Detalhes]`);
      console.log(`     Delivery status is '${order.delivery?.status}', not 'pending'`);
      testResults.buttonsChanged = false;
    } else {
      console.log(`  ✅ CORRECT: Showing [Detalhes, Cancelar] buttons`);
      testResults.buttonsChanged = true;
    }
    console.log();

    // Step 6: Complete the delivery
    console.log('📝 Step 6: Completing delivery...');
    const completeRes = await axios.post(
      `${BASE_URL}/deliveries/${order.delivery._id}/complete`,
      { proofUrl: 'test-proof.jpg' },
      getAuthHeader(customerToken)
    );

    console.log(`✅ Delivery completed`);
    console.log(`✅ Delivery Status: ${completeRes.data.status}\n`);
    testResults.completed = true;

    // Step 7: Verify order moved to history
    console.log('📝 Step 7: Verifying order in history...');
    const dashRes = await axios.get(
      `${BASE_URL}/stores/dashboard`,
      getAuthHeader(storeToken)
    );

    const inOrders = dashRes.data.orders.find((o) => o._id === orderId);
    const inHistory = dashRes.data.history.find((o) => o._id === orderId);

    console.log(`Dashboard Data:`);
    console.log(`  - Order in 'orders' array: ${inOrders ? '✅ Yes' : '❌ No'}`);
    console.log(`  - Order in 'history' array: ${inHistory ? '✅ Yes' : '❌ No'}\n`);

    if (inHistory && !inOrders) {
      console.log(`✅ CORRECT: Order moved to history`);
      testResults.movedToHistory = true;
    } else {
      console.log(`❌ ERROR: Order not properly moved to history`);
      testResults.movedToHistory = false;
    }

  } catch (error) {
    console.error(`\n❌ Test failed with error:`);
    console.error(`   ${error.response?.data?.message || error.message}`);
    if (error.response?.data) {
      console.error(`   Details:`, error.response.data);
    }
  }

  // Print summary
  console.log('\n' + '='.repeat(60));
  console.log('📊 TEST SUMMARY');
  console.log('='.repeat(60));
  console.log(`✅ Order Created: ${testResults.created ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Order Accepted: ${testResults.accepted ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Buttons Changed: ${testResults.buttonsChanged ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Delivery Completed: ${testResults.completed ? 'PASS' : 'FAIL'}`);
  console.log(`✅ Moved to History: ${testResults.movedToHistory ? 'PASS' : 'FAIL'}`);
  
  const allPassed = Object.values(testResults).every(v => v === true);
  console.log('='.repeat(60));
  console.log(allPassed ? '\n🎉 ALL TESTS PASSED!\n' : '\n❌ SOME TESTS FAILED\n');
}

// Run tests
testStoreButtonRendering().catch(console.error);
