# ✅ Fluxo Completo: Do Pedido ao Crédito na Carteira

## 🎬 Cena 1: Cliente Fazendo Compra

### Estado Inicial:
```javascript
Cliente: mtb (usuário novo que testou antes)
Lojista: lj (novo lojista criado)
Loja: Tem storeId preenchido

Saldo Cliente: R$ 100 (hipotético)
Saldo Lojista: R$ 0
```

### Ação:
1. Cliente adiciona produto (R$ 50) ao carrinho
2. Produto tem `storeId = "ID_DA_LOJA_LJ"`
3. Vai para checkout
4. Finaliza compra

### Console do Browser Esperado:
```javascript
✅ Token set in axios: eyJhbGciOiJIUzI1NiIs...
📍 Loading wallet for role: cliente
👤 Full user object: {id: 'mtb_id', name: 'mtb', activeRole: 'cliente', ...}
📡 Request to /wallets/my-wallet/by-role/cliente Auth header: present
💰 Wallet loaded: {owner: 'mtb_id', ownerType: 'user', balance: 100, ...}
📦 Enviando pedido: {
  storeId: "lj_store_id",     ← IMPORTANTE!
  products: [{productId: '...', quantity: 1, price: 50}],
  deliveryDistanceKm: 2,
  paymentMethod: "pix",
  address: "Rua...",
  latitude: -23.xxx,
  longitude: -46.xxx
}
```

---

## 🔄 Cena 2: Backend Processando Compra

### Console do Backend Esperado:

```
📦 [ORDER][CREATE] Iniciando criação de pedido: {
  customerId: 'mtb_id',
  storeId: 'lj_store_id',
  productsCount: 1,
  paymentMethod: 'pix',
  user: {...}
}

🔍 [ORDER][CREATE] Verificando role: activeRole=cliente, role=cliente

🛍️ [ORDER][CREATE] StoreId recebido: {
  storeId: 'lj_store_id',
  storeIdStr: 'lj_store_id',
  type: 'string'
}

[ORDER][CREATE][PRODUTO] {
  input: {productId: '...', quantity: 1, price: 50},
  found: 'Nome do Produto',
  priceFromCart: 50,
  priceFromDB: 50
}

✅ [ORDER] Estoque atualizado: quantity = 4 (era 5)

💳 [ORDER][WALLET] Procurando wallet da loja: {
  storeIdStr: 'lj_store_id',
  ownerType: 'store',
  distribution: 40  ← 50 * 0.8 (20% comissão)
}

💳 [ORDER][WALLET] Resultado da busca: {
  found: true,  ← Encontrou wallet existente
  storeIdStr: 'lj_store_id',
  storeAmount: 40
}

💳 [ORDER][WALLET] Atualizando wallet existente: {
  walletId: 'wallet_lj_id',
  oldBalance: 0,
  addingAmount: 40
}

✅ [ORDER][WALLET] Wallet atualizada: {
  walletId: 'wallet_lj_id',
  newBalance: 40  ← ✅ SUCESSO!
}

[ORDER][CREATE] ✅ Pedido com distribuição de wallets: {
  orderId: 'new_order_id',
  totalValue: 52.8,  ← 50 + 2.8 de entrega
  storeAmount: 40,   ← Crédito na loja
  appCommission: 10
}
```

### O que Aconteceu:
```
1. ✅ Cliente débito: 100 - 52.8 = 47.2
2. ✅ Loja crédito: 0 + 40 = 40
3. ✅ App comissão: 10
4. ✅ Pedido criado
5. ✅ Wallets salvas
```

---

## 📱 Cena 3: Lojista Checando Carteira

### Ação:
1. Lojista "lj" faz login
2. Clica no avatar
3. Seleciona [🏪 Loja]

### Console do Browser Esperado:
```javascript
🔀 handleSwitchRole called with: lojista
🔄 Switching role to: lojista
📡 Request to /auth/switch-role Auth header: present
✅ Role switched successfully
✅ Token set in axios: eyJhbGciOiJIUzI1NiIs...
✅ switchRole completed, redirecting to /my-wallet

🔔 ROLE CHANGED DETECTED: {
  oldRole: 'cliente',
  activeRole: 'lojista',
  currentRole: 'lojista'
}

📍 Loading wallet for role: lojista
👤 Full user object: {
  id: 'lj_id',
  name: 'lj',
  email: 'lj@lj',
  role: 'lojista',
  activeRole: 'lojista',
  storeId: 'lj_store_id',  ← ✅ TEM STOREID!
  roles: ['lojista', 'cliente']
}

🔍 Debug - user.activeRole: lojista user.role: lojista

📡 Request to /user/bank-info Auth header: present
✅ [Socket] Conectado ao servidor
📡 Request to /wallets/my-wallet/by-role/lojista Auth header: present

💰 Wallet loaded: {
  _id: 'wallet_lj_id',
  owner: 'lj_store_id',     ← ✅ STOREID
  ownerType: 'store',        ← ✅ STORE
  role: 'lojista',
  balance: 40,               ← ✅ CRÉDITO APARECEU!
  totalIncome: 40,
  totalSpent: 0,
  history: [{
    date: '2026-03-17T...',
    type: 'credit',
    category: 'payment',
    amount: 40,
    reason: 'Venda',  ← ✅ Descrição clara
    paymentMethod: 'wallet',
    relatedId: 'mtb_id'  ← ✅ ID do cliente
  }],
  user: {name: 'lj', email: 'lj@lj', id: 'lj_id'},
  store: {_id: 'lj_store_id', name: 'Loja LJ'}
}
```

### Frontend Mostrado:
```
💰 Minha Carteira
lj • 🏪 Loja

Saldo Disponível
R$ 40,00  ← ✅ MOSTRANDO O CRÉDITO!

💰 Total Entrada
R$ 40,00  ← ✅ Entrada de venda

💸 Total Gasto
R$ 0,00

...

📋 Histórico de Transações
✅ Venda - R$ 40,00 - de mtb

[↙️ Enviar para Usuário]  ← Pode transferir agora!
```

---

## 🎯 Resumo: O Que Deve Acontecer

| Ponto | Antes | Depois |
|-------|-------|--------|
| Cliente balance | R$ 100 | R$ 47,20 |
| Loja balance | R$ 0 | R$ 40,00 |
| Loja ownerType | (n/a) | 'store' ✅ |
| Histórico loja | [] | [1 transação] ✅ |
| Pedido status | (novo) | 'criado' ✅ |

---

## ❌ Se Não Acontecer Assim...

Se a carteira da loja continuar em R$ 0:

1. **Verificar backend logs** - procure por "❌" ou "ERROR"
2. **Verificar se storeId é enviado** - veja no payload "📦 Enviando pedido"
3. **Verificar se wallet foi criada** - procure por "Nova wallet criada" ou "Wallet atualizada"
4. **Verificar se lojista tem storeId** - console F12 quando trocade role

---

## 🔍 Logs Críticos

Se algo falhar, procure por:

| Log | Significa |
|-----|-----------|
| `found: false` | Wallet não existe, deveria criar |
| `storeAmount: 0` | Cálculo de comissão deu 0 |
| `❌ [ORDER]` | Erro explícito |
| `newBalance: 0` | Wallet atualizada mas saldo zerado |

---

**Status Esperado: 🟢 SISTEMA FUNCIONANDO CORRETAMENTE**

Se não vir isso, envie os logs e debugamos!
