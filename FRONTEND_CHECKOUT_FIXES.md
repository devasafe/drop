# 🎯 IMPLEMENTAÇÃO DO FRONTEND - CHECKOUT COM CONFIRMAÇÃO

**Status**: Pronto para implementar  
**Arquivo**: `frontend/pages/checkout.tsx`

---

## ✅ O QUE FOI CORRIGIDO NO BACKEND

```
1. ✅ Validação com Zod completa (price, latitude, longitude, etc)
2. ✅ Race condition no estoque (usando $inc atômico)
3. ✅ Idempotent Key para prevenir duplicação
4. ✅ Reversal automático em caso de falha
```

---

## 🔧 IMPLEMENTAÇÃO NO FRONTEND

### **PASSO 1: Adicionar modal de confirmação**

Encontre a parte onde define `useState` (por volta da linha 30-60):

```typescript
// Adicionar entre os outros useState:
const [showConfirmation, setShowConfirmation] = useState(false);
const [isPlacing, setIsPlacing] = useState(false);
```

---

### **PASSO 2: Modificar função `placeOrder`**

Procure a função `placeOrder` (por volta da linha 275-320) e substitua:

```typescript
const placeOrder = async () => {
  // ✅ VALIDAÇÕES
  if (!storeId) return alert('Carrinho vazio ou produto sem loja');
  if (!street || !number || !neighborhood || !city || !state || !cep || !latitude || !longitude) {
    return alert('Preencha todos os campos de endereço e selecione no mapa');
  }
  
  // ✅ NOVO: Bloquear cliques múltiplos
  if (isPlacing) return;
  setIsPlacing(true);
  
  // ✅ NOVO: Gerar UUID para idempotência
  const generateUUID = () => {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  };
  
  const idempotentKey = generateUUID();
  
  try {
    const address = `${street}, ${number} - ${neighborhood}, ${city} - ${state}, ${cep}`;
    const products = cart.map((c) => ({ 
      productId: c.productId, 
      quantity: c.quantity,
      price: c.price
    }));
    
    // ✅ NOVO: Enviar idempotentKey e cupom
    const res = await api.post('/orders', {
      storeId,
      products,
      deliveryDistanceKm: distanceKm,
      paymentMethod,
      address,
      latitude,
      longitude,
      idempotentKey,  // ← Nova chave
      cupomCode: cupomCode || undefined,  // ← Se implementar cupom depois
    });
    
    // ✅ NOVO: Apenas limpar após sucesso confirmado
    localStorage.removeItem('cart');
    localStorage.removeItem('checkout_draft');  // ← Limpar draft
    clear();
    
    // ✅ NOVO: Modal de sucesso
    setShowConfirmation(false);
    alert('✅ Pedido criado com sucesso!');
    window.location.href = `/store-order/${res.data._id}`;
  } catch (err: any) {
    console.error('Erro ao criar pedido:', err);
    alert(err?.response?.data?.error || 'Falha ao criar pedido. Tente novamente.');
  } finally {
    setIsPlacing(false);
  }
};
```

---

### **PASSO 3: Modificar botão "Finalizar Compra"**

Procure o botão `Finalizar Compra` (por volta da linha 650-750):

```typescript
// ❌ ANTES
<button onClick={placeOrder}>
  Finalizar Compra
</button>

// ✅ DEPOIS
<button 
  onClick={() => {
    // Validar campos antes de abrir modal
    if (!storeId) return alert('Carrinho vazio');
    if (!street || !number || !neighborhood || !city || !state || !cep || !latitude || !longitude) {
      return alert('Preencha todos os campos de endereço');
    }
    setShowConfirmation(true);  // ← Abrir modal
  }}
  disabled={isPlacing}
  style={{
    padding: '16px 32px',
    fontSize: '18px',
    fontWeight: 'bold',
    background: '#10b981',
    color: 'white',
    border: 'none',
    borderRadius: '8px',
    cursor: isPlacing ? 'not-allowed' : 'pointer',
    opacity: isPlacing ? 0.7 : 1,
    width: '100%',
  }}
>
  {isPlacing ? '⏳ Processando...' : '✅ Finalizar Compra'}
</button>
```

---

### **PASSO 4: Adicionar Modal de Confirmação**

Adicione **ANTES** do `</ProtectedRoute>` final (por volta da linha 740):

```typescript
{/* MODAL DE CONFIRMAÇÃO */}
{showConfirmation && (
  <div style={{
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 1000,
  }}>
    <div style={{
      background: 'white',
      borderRadius: '12px',
      padding: '32px',
      maxWidth: '500px',
      boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
      animation: 'slideUp 0.3s ease-out',
    }}>
      <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 24px 0' }}>
        ✅ Resumo do Pedido
      </h2>
      
      {/* PRODUTOS */}
      <div style={{ 
        marginBottom: '20px', 
        borderBottom: '1px solid #eee', 
        paddingBottom: '20px',
        maxHeight: '300px',
        overflowY: 'auto'
      }}>
        <h3 style={{ fontSize: '14px', color: '#666', marginBottom: '12px', fontWeight: 'bold' }}>
          📦 Produtos ({cart.length})
        </h3>
        {cart.map((item, idx) => (
          <div key={idx} style={{ 
            display: 'flex', 
            justifyContent: 'space-between', 
            marginBottom: '10px',
            fontSize: '14px'
          }}>
            <span>{item.name} x{item.quantity}</span>
            <strong>R${((item.price || 0) * item.quantity).toFixed(2)}</strong>
          </div>
        ))}
      </div>
      
      {/* ENDEREÇO */}
      <div style={{ 
        marginBottom: '20px', 
        borderBottom: '1px solid #eee', 
        paddingBottom: '20px' 
      }}>
        <h3 style={{ fontSize: '14px', color: '#666', marginBottom: '10px', fontWeight: 'bold' }}>
          📍 Endereço de Entrega
        </h3>
        <p style={{ margin: '0', fontSize: '14px', lineHeight: '1.6' }}>
          <strong>{street}, {number}</strong><br/>
          {neighborhood}, {city} - {state}<br/>
          CEP: {cep}
        </p>
        <p style={{ 
          margin: '8px 0 0 0', 
          fontSize: '12px', 
          color: '#666',
          fontWeight: '500'
        }}>
          📏 Distância: {distanceKm.toFixed(1)} km
        </p>
      </div>
      
      {/* VALORES */}
      <div style={{ 
        marginBottom: '20px', 
        borderBottom: '1px solid #eee', 
        paddingBottom: '20px',
        background: '#f9fafb',
        padding: '12px',
        borderRadius: '6px'
      }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          marginBottom: '10px',
          fontSize: '14px'
        }}>
          <span>Subtotal</span>
          <span>R${subtotal.toFixed(2)}</span>
        </div>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          marginBottom: '10px',
          fontSize: '14px'
        }}>
          <span>Taxa de Entrega</span>
          <span>R${deliveryFee.toFixed(2)}</span>
        </div>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          fontSize: '18px', 
          fontWeight: 'bold',
          color: '#10b981',
          paddingTop: '10px',
          borderTop: '1px solid #e5e7eb'
        }}>
          <span>Total</span>
          <span>R${total.toFixed(2)}</span>
        </div>
      </div>
      
      {/* PAGAMENTO */}
      <div style={{ marginBottom: '20px' }}>
        <p style={{ fontSize: '12px', color: '#666', margin: '0 0 8px 0', fontWeight: '500' }}>
          💳 FORMA DE PAGAMENTO
        </p>
        <div style={{
          background: '#f3f4f6',
          padding: '12px',
          borderRadius: '6px',
          fontSize: '14px',
          fontWeight: 'bold'
        }}>
          {paymentMethod === 'pix' && '📱 PIX'} 
          {paymentMethod === 'credit_card' && '💳 Cartão de Crédito'}
          {paymentMethod === 'money' && '💵 Dinheiro na Entrega'}
        </div>
      </div>
      
      {/* BOTÕES */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '16px' }}>
        <button
          onClick={() => setShowConfirmation(false)}
          disabled={isPlacing}
          style={{
            padding: '12px',
            border: '1px solid #ddd',
            borderRadius: '6px',
            background: 'white',
            cursor: isPlacing ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            transition: 'all 0.2s',
            opacity: isPlacing ? 0.5 : 1,
          }}
          onMouseEnter={(e) => !isPlacing && (e.currentTarget.style.background = '#f3f4f6')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'white')}
        >
          ← Voltar
        </button>
        <button
          onClick={placeOrder}
          disabled={isPlacing}
          style={{
            padding: '12px',
            border: 'none',
            borderRadius: '6px',
            background: '#10b981',
            color: 'white',
            cursor: isPlacing ? 'not-allowed' : 'pointer',
            fontSize: '14px',
            fontWeight: 'bold',
            transition: 'all 0.2s',
            opacity: isPlacing ? 0.7 : 1,
          }}
          onMouseEnter={(e) => !isPlacing && (e.currentTarget.style.background = '#059669')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#10b981')}
        >
          {isPlacing ? '⏳ Processando...' : '✅ Confirmar Pedido'}
        </button>
      </div>
      
      {/* AVISO */}
      <p style={{
        fontSize: '12px',
        color: '#6b7280',
        textAlign: 'center',
        margin: '0',
        background: '#fff3cd',
        padding: '8px 12px',
        borderRadius: '6px',
        lineHeight: '1.5'
      }}>
        💡 Você poderá cancelar este pedido nos próximos 10 minutos pelo app.
      </p>
    </div>
  </div>
)}
```

---

### **PASSO 5: Adicionar localStorage draft (OPCIONAL mas recomendado)**

Adicione este `useEffect` próximo aos outros `useEffect` (por volta da linha 100-150):

```typescript
// ✅ NOVO: Salvar draft automaticamente
useEffect(() => {
  const draft = {
    storeId,
    products: cart,
    address: {
      street, number, neighborhood, city, state, cep,
      latitude, longitude
    },
    paymentMethod,
    distanceKm,
    deliveryFee,
    timestamp: new Date().toISOString(),
  };
  
  if (cart.length > 0) {
    localStorage.setItem('checkout_draft', JSON.stringify(draft));
  }
}, [storeId, cart, street, number, neighborhood, city, state, cep, latitude, longitude, paymentMethod, distanceKm, deliveryFee]);

// ✅ NOVO: Recuperar draft ao entrar em checkout
useEffect(() => {
  const draft = localStorage.getItem('checkout_draft');
  if (draft && cart.length === 0) {  // Só recupera se carrinho está vazio
    try {
      const parsed = JSON.parse(draft);
      setStreet(parsed.address.street);
      setNumber(parsed.address.number);
      setNeighborhood(parsed.address.neighborhood);
      setCity(parsed.address.city);
      setState(parsed.address.state);
      setCep(parsed.address.cep);
      setLatitude(parsed.address.latitude);
      setLongitude(parsed.address.longitude);
      setPaymentMethod(parsed.paymentMethod);
      console.log('✅ Checkout recuperado de rascunho');
    } catch (e) {
      console.error('Erro ao restaurar draft', e);
      localStorage.removeItem('checkout_draft');
    }
  }
}, []);
```

---

## 🧪 TESTE

### **1. Testar idempotência (clique 2x)**

```bash
# Terminal 1: Iniciar server
npm run dev

# Terminal 2: Testar com curl
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "storeId": "507f1f77bcf86cd799439011",
    "products": [{"productId": "507f1f77bcf86cd799439012", "quantity": 1, "price": 50}],
    "deliveryDistanceKm": 5,
    "paymentMethod": "pix",
    "idempotentKey": "12345678-1234-1234-1234-123456789012"
  }'

# Executar novamente com MESMO idempotentKey
# Resultado: Deve retornar MESMO order (status 200, não 201)
```

### **2. Testar validação**

```bash
# Enviar dados inválidos
curl -X POST http://localhost:3000/api/orders \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "storeId": "invalid",
    "products": [{"productId": "xyz", "quantity": "abc"}],
    "deliveryDistanceKm": -5,
    "latitude": 999
  }'

# Resultado: 400 Bad Request com mensagens claras
```

### **3. Testar race condition**

```bash
# Rodar 100 pedidos simultâneos do mesmo produto
for i in {1..100}; do
  curl -X POST http://localhost:3000/api/orders \
    -H "Content-Type: application/json" \
    -H "Authorization: Bearer YOUR_TOKEN" \
    -d "{...}" &
done
wait

# Resultado: Apenas os que têm estoque suficiente passam
# Nenhum fica com estoque negativo
```

---

## 📊 RESULTADO ESPERADO

| Antes | Depois |
|-------|--------|
| ❌ Cliente clica 2x = 2 pedidos | ✅ Cliente clica 2x = 1 pedido |
| ❌ Estoque pode ficar negativo | ✅ Estoque nunca fica negativo |
| ❌ Sem confirmação visual | ✅ Modal de confirmação |
| ❌ Perde dados se falhar | ✅ Draft auto-save em localStorage |
| ❌ Sem validação clara | ✅ Mensagens de erro específicas |

---

## 🚀 PRÓXIMAS MELHORIAS

- [ ] Implementar Bull Queue para processamento assíncrono
- [ ] Adicionar Cupom com validação
- [ ] Webhook para payment gateway
- [ ] Analytics de abandono
- [ ] A/B test do modal

---

**Pronto? Copie os trechos acima para seu checkout.tsx!** 🎉
