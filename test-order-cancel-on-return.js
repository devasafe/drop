/**
 * Test: Verificar que Order é cancelado quando devolução é confirmada
 * Versão simplificada - usando IDs conhecidos
 */
const axios = require('axios');

const API_URL = 'http://localhost:4000/api';

async function test() {
  console.log(`\n╔═══════════════════════════════════════════════════════════╗
║ TEST: Order é cancelada quando devolução é confirmada      ║
╚═══════════════════════════════════════════════════════════╝\n`);

  try {
    const api = axios.create({ baseURL: API_URL, validateStatus: () => true });

    const customerId = '67a1a1a1a1a1a1a1a1a1a1a1';
    const storeId = '67a1c1c1c1c1c1c1c1c1c1c1';
    const motoboyId = '67a1b1b1b1b1b1b1b1b1b1b1';

    // 1. Cliente cria pedido
    console.log('📝 1. Cliente criando pedido...');
    const orderRes = await api.post('/orders', {
      customerId,
      storeId,
      deliveryType: 'delivery',
      products: [{ productId: '123', quantity: 1, price: 100 }],
      totalValue: 100
    });
    const orderId = orderRes.data._id;
    console.log(`   ✅ Pedido criado: ${orderId}`);
    console.log(`   Status: ${orderRes.data.status}\n`);

    // 2. Lojista aceita
    console.log('📋 2. Lojista aceitando pedido...');
    const acceptRes = await api.post(`/orders/${orderId}/accept`, { storeId });
    const deliveryId = acceptRes.data.deliveryId;
    console.log(`   ✅ Entrega criada: ${deliveryId}\n`);

    // 3. Motoboy clama
    console.log('📦 3. Motoboy aclamando entrega...');
    const claimRes = await api.post(`/deliveries/${deliveryId}/claim`, { motoboyId });
    const { pin: pinEntrega, pinRetirada } = claimRes.data;
    console.log(`   ✅ PINs: entrega=${pinEntrega}, retirada=${pinRetirada}\n`);

    // 4. Lojista valida retirada
    console.log('✔️ 4. Lojista validando PIN de retirada...');
    await api.post(`/deliveries/${deliveryId}/validar-pin-retirada`, { pinRetirada });
    console.log(`   ✅ Validado\n`);

    // 5. Motoboy rejeita
    console.log('❌ 5. Motoboy rejeitando pós-retirada...');
    const rejectRes = await api.post(`/deliveries/${deliveryId}/reject`, {
      action: 'cancel',
      reason: 'Teste'
    });
    const pinDevolucao = rejectRes.data.pinDevolucao;
    console.log(`   ✅ PIN devolução: ${pinDevolucao}\n`);

    // ANTES
    console.log('📊 Status ANTES de confirmar devolução:');
    let orderChk = await api.get(`/orders/${orderId}`);
    console.log(`   Order Status: ${orderChk.data.status}`);
    console.log(`   Delivery Status: ${orderChk.data.delivery?.status}\n`);

    // 6. Lojista confirma devolução COM PIN
    console.log('✅ 6. Lojista confirmando DEVOLUÇÃO com PIN...');
    const confirmRes = await api.post(`/deliveries/${deliveryId}/confirm-return`, {
      pinDevolucao
    });
    console.log(`   Response Status: ${confirmRes.status}`);
    console.log(`   Order Status na response: ${confirmRes.data.orderStatus || 'N/A'}`);
    console.log(`   Devolução Status: ${confirmRes.data.statusDevolucao}\n`);

    // DEPOIS
    console.log('📊 Status DEPOIS de confirmar devolução:');
    orderChk = await api.get(`/orders/${orderId}`);
    console.log(`   Order Status: ${orderChk.data.status}`);
    console.log(`   Delivery Status: ${orderChk.data.delivery?.status}`);
    console.log(`   Cancel Reason: ${orderChk.data.cancelReason || 'N/A'}\n`);

    // RESULTADO
    console.log('═══════════════════════════════════════════════════════════');
    if (orderChk.data.status === 'cancelled') {
      console.log('✅✅✅ SUCESSO!');
      console.log('Order foi CANCELADO automaticamente!');
      console.log('Cliente não vai ficar esperando atoa.');
    } else {
      console.log(`❌ FALHA - Order status: ${orderChk.data.status}`);
    }
    console.log('═══════════════════════════════════════════════════════════\n');

  } catch (err) {
    console.error(`\n❌ ERRO: ${err.message}`);
    if (err.response?.data) {
      console.error(`   Response:`, err.response.data);
    }
  }

  process.exit(0);
}

test();
