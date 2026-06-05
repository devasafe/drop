# Socket Flow Real-Time Orders Testing

## Test Scenario
Test that when a customer (cliente) creates an order, a lojista dashboard automatically receives and displays the order via WebSocket without manual refresh.

## Expected Flow

### 1. Lojista Dashboard Loads
```
[Frontend] Store Dashboard opens
  ↓
[Frontend] Calls GET /api/stores/dashboard
  ↓
[Backend] Returns store._id = "67abc123def456..." 
  ↓
[Frontend] setStoreId("67abc123def456...")
  ↓
[Socket] connectSocket(token) → establishes connection
  ↓
[Socket] socket.emit('join', { room: 'store:67abc123def456...' })
  ↓
[Backend] socket.on('join') → socket.join('store:67abc123def456...')
  ✅ [SOCKET][BACKEND] Socket entrou na sala: store:67abc123def456...
```

### 2. Customer Creates Order
```
[Frontend Checkout] Clicks "Finalizar Pedido"
  ↓
[Frontend Checkout] POST /api/orders with storeId="67abc123def456..."
  ↓
[Backend Order] Creates order with storeId="67abc123def456..."
  ↓
[Backend Order] Calls emitOrderCreated(order)
  ↓
[Socket Emitter] Emits to room 'store:67abc123def456...' with event 'new_order'
  ✅ [SOCKET][EMIT] Broadcasting "new_order" to room: store:67abc123def456...
  ↓
[Frontend Dashboard] Receives socket.on('new_order')
  ✅ 📦 [SOCKET] Evento new_order recebido: { orderId, status, ... }
  ↓
[Frontend Dashboard] Fetches full order details
  ↓
[Frontend Dashboard] Updates orders list with setOrders()
  ✅ Order appears in dashboard without refresh!
```

## Testing Steps

### Pre-Test Setup
1. Make sure backend is running on localhost:4000
2. Make sure frontend is running on localhost:3000
3. Open browser DevTools console
4. Open server terminal to watch logs

### Test Execution

#### Step 1: Log in as Lojista
1. Open http://localhost:3000/login
2. Login with lojista account (role=lojista)
3. Navigate to store dashboard
4. **Check server logs:**
   - Should see: `✅ [Socket.io] Conectado: userId=<USERID>, role=lojista`
   - Should see: `[SOCKET][BACKEND] Socket entrou na sala: store:<STOREID>`
5. **Check browser console:**
   - Should see: `✅ [SOCKET] Conectado ao Painel Lojista`
   - Should see: `🔌 [SOCKET] Entrando na sala: store:<STOREID>`

#### Step 2: Create Order as Customer
1. Open new incognito window
2. Login as customer (role=cliente)
3. Add products to cart
4. Go to checkout
5. Fill in delivery address
6. Click "Calcule a distância" and verify distance >= 0.1km
7. Click "Finalizar Pedido"
8. **Check lojista browser console (first window):**
   - Should see: `📦 [SOCKET] Evento new_order recebido: { orderId, status, ... }`
   - Should see: `✅ [SOCKET] novo pedido chegou: <ORDERID>`
   - NEW ORDER SHOULD APPEAR IN DASHBOARD INSTANTLY!
9. **Check server logs:**
   - Should see: `[SOCKET][emitOrderCreated] Novo pedido: { orderId, storeId, ... }`
   - Should see: `[SOCKET][EMIT] Broadcasting "new_order" to room: store:<STOREID>`

#### Step 3: Verify No Manual Refresh Needed
1. Lojista dashboard should show the new order
2. No F5 refresh should be required
3. Order should appear within 1-2 seconds of creation

## Troubleshooting Checklist

If test fails:

- [ ] Check storeId values match in all logs (store-dashboard storeId === order.storeId)
- [ ] Check socket room names match: `store:<STOREID>` (no variations like `store:undefined`)
- [ ] Verify lojista socket actually joined room: look for `Socket entrou na sala: store:...`
- [ ] Verify order emission happened: look for `Broadcasting "new_order" to room: store:...`
- [ ] Check if frontend error in browser console prevents listener from working
- [ ] Make sure same browser window for lojista (different user in new window)
- [ ] Check if token is properly authenticated in both frontend and backend

## Expected Console Logs

### Backend Server Logs (creation)
```
📦 [ORDER][CREATE] Iniciando criação de pedido: { customerId, storeId, ... }
[ORDER][CREATE] ✅ Pedido com distribuição de wallets: { orderId, totalValue, ... }
[SOCKET][emitOrderCreated] Novo pedido: { orderId, storeId, totalValue, ... }
[SOCKET][EMIT] Broadcasting "new_order" to room: store:<STOREID>
```

### Frontend Lojista Console Logs (reception)
```
✅ [SOCKET] Conectado ao Painel Lojista
🔌 [SOCKET] Entrando na sala: store:<STOREID>
📦 [SOCKET] Evento new_order recebido: { orderId, status, totalValue, ... }
✅ [SOCKET] novo pedido chegou: <ORDERID>
[SOCKET] ✅ Novo pedido com dados completos: { id, customer, total, products }
```

## Success Criteria
- ✅ Order appears in lojista dashboard within 1-2 seconds
- ✅ No manual page refresh required
- ✅ All console logs show correct storeId values
- ✅ No errors in browser or server console
- ✅ Socket room joining shows correct storeId
