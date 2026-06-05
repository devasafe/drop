# 🧪 TESTE DO FIX: Sincronização de Endereços

**Status**: ✅ Backend rodando na porta 4000  
**Status**: ✅ Frontend rodando na porta 3000

---

## 📋 Teste 1: Dashboard - Adicionar Endereço como Padrão

### Passos:
1. Ir em `http://localhost:3000/user-dashboard`
2. Fazer login com conta **cliente**
3. Clicar na aba **"📍 Endereços"**
4. Clicar em **"➕ Novo Endereço"**
5. Preencher formulário:
   - Apelido: **Casa**
   - CEP: **28910-240** (Cabo Frio)
   - Rua: **Rua Taquari**
   - Número: **100**
   - Bairro: **Jardim Caiçara**
   - Cidade: **Cabo Frio**
   - Estado: **RJ**
6. Clicar no mapa para preencher Latitude/Longitude
7. **MARCAR** checkbox: ⭐ **Usar como endereço padrão**
8. Clicar **"✓ Salvar"**

### Verificar:
- ✅ Endereço aparece na lista?
- ✅ Tem badge "✓ Padrão" ao lado do apelido?
- ✅ No console do navegador (F12), checar se `res.data.mainAddress` foi retornado?

---

## 📋 Teste 2: Checkout - Criar Novo Pedido com Novo Endereço

### Passos:
1. Ir em `http://localhost:3000/store-products/[store_id]` (ou qualquer loja)
2. Adicionar produtos ao carrinho
3. Ir em `http://localhost:3000/checkout`
4. Na seção "📍 Endereço de Entrega":
   - Clicar em **"Novo Endereço"** (se AddressSelector tiver esse botão)
   - OU preencher manualmente os campos de endereço
5. Preencher com dados diferentes:
   - Rua: **Estrada São Pedro Cabo Frio**
   - Número: **8205**
   - Bairro: **Baixo Grande**
   - Cidade: **São Pedro da Aldeia**
6. Clicar no mapa para preencher coordenadas
7. Clicar **"Finalizando Pedido"** (ou "Confirmar Pedido")

### Verificar:
- ✅ Mensagem: "Endereço salvo e marcado como padrão!"
- ✅ Endereço aparece no combo de seleção?
- ✅ Order é criado com sucesso?
- ✅ Você é redirecionado para `/store-order/[order_id]`?

### Backend Check:
No console do backend, verificar:
```
📦 [ORDER][CREATE] Iniciando criação de pedido:
  customerId: ...
  storeId: ...
  address: "Estrada São Pedro Cabo Frio, 8205 - Baixo Grande, São Pedro da Aldeia - RJ"
  latitude: NUMBER
  longitude: NUMBER
```

---

## 📋 Teste 3: Motoboy - Verificar Endereço Correto

### Passos:
1. Após criar o pedido, aceitar como **Motoboy**
2. Ir em `http://localhost:3000/motoboy/delivery/[delivery_id]`

### Verificar (O IMPORTANTE!):
- ✅ Seção "🚚 Entrega no Cliente" mostra:
  - **Endereço CORRETO**: "Estrada São Pedro Cabo Frio, 8205 - Baixo Grande, São Pedro da Aldeia - RJ"
  - **NÃO** deve mostrar: "Rua Antônio Pinto Bacalhau" (o mainAddress antigo)
- ✅ Mapa renderiza corretamente?
- ✅ Rota aparece no mapa (se tiver MapPicker)?
- ✅ Coordenadas estão corretas?

### Backend Check:
No console, chamar:
```
GET /api/deliveries/[delivery_id]
```

Verificar resposta:
```json
{
  "deliveryAddress": "Estrada São Pedro Cabo Frio, 8205...",  // ← DEVE SER DO ORDER
  "deliveryLat": 22.8123...,  // ← COORDENADAS DO ORDER
  "deliveryLng": -42.1234...,
  "delivery": {
    "customerAddress": "Estrada São Pedro Cabo Frio, 8205...",  // ← SNAPSHOT
    "customerLatitude": 22.8123,  // ← SNAPSHOT
    "customerLongitude": -42.1234
  }
}
```

---

## 🔍 Debugging (Se algo der errado)

### Ver Banco de Dados:
```bash
# Via MongoDB Atlas / Studio 3T
db.users.findOne({_id: ObjectId("...")})
  → Verificar campo `mainAddress`
  → Verificar array `addresses`

db.orders.findOne({_id: ObjectId("...")})
  → Verificar campo `customerAddress`
  → Verificar campos `customerLatitude`, `customerLongitude`

db.deliveries.findOne({_id: ObjectId("...")})
  → Verificar se tem `customerAddress` (snapshot)
  → Verificar se tem `customerLatitude`, `customerLongitude` (snapshot)
```

### Ver Logs do Backend:
```
[ORDER][CREATE] ✅ Pedido com distribuição de wallets:
  orderId: ...
  totalValue: ...
```

### Ver Logs do Frontend (F12 Console):
```javascript
// Checkout
"📦 Enviando pedido:", payload
// Deve conter:
{
  address: "Estrada São Pedro Cabo Frio, 8205...",
  latitude: 22.8123,
  longitude: -42.1234
}
```

---

## ✅ Checklist de Sucesso

- [ ] Dashboard: Adicionar endereço com checkbox marcado
- [ ] Dashboard: Endereço mostra badge "✓ Padrão"
- [ ] Checkout: Criar novo endereço (automático `setAsDefault: true`)
- [ ] Checkout: Mensagem "Endereço salvo e marcado como padrão!"
- [ ] Motoboy: Vê endereço CORRETO (não o mainAddress antigo)
- [ ] Motoboy: Mapa renderiza com coordenadas corretas
- [ ] Banco: Order tem `customerAddress` + coords
- [ ] Banco: Delivery tem `customerAddress` + coords (snapshot)

---

## 🚀 Próximas Correções (Se necessário)

1. **Se mapa não renderizar**: Verificar se `deliveryLat/Lng` está null
2. **Se endereço estiver errado**: Verificar se `delivery.customerAddress` é null (snapshot não foi copiado)
3. **Se get /deliveries retorna erro**: Verificar logs do backend em `deliveryController.getDelivery()`

---

**Testado em**: 12/03/2026  
**Ambiente**: Windows PowerShell, Node 16+, MongoDB Atlas

