# 🔍 Investigação: Compra não credita na carteira do lojista

## 🎯 Fluxo Esperado

```
1. Cliente em role 'cliente' adiciona produto ao carrinho
   ↓
2. Vai para /checkout
   └─ Valida: activeRole === 'cliente' ✅
   
3. Clica em "Finalizar Compra"
   ↓
4. POST /orders com:
   {
     storeId: "ID_DA_LOJA",
     products: [...],
     deliveryDistanceKm: X,
     paymentMethod: "...",
     address: "...",
     ...
   }
   
5. Backend:
   a) Verifica activeRole === 'cliente' ✅
   b) Calcula distribuição
      └─ storeAmount = subtotal * (1 - commissionPercent)
   c) Debita cliente: clientWallet.balance -= totalValue
   d) Credita loja: storeWallet.balance += storeAmount
   e) Salva ambas as wallets
   f) Cria Order com status='criado'
   
6. Response: Pedido criado ✅

7. Resultado esperado:
   └─ Loja tem saldo = storeAmount
   └─ Cliente tem saldo reduzido
   └─ Wallet da loja tem histórico: 'Venda'
```

---

## 🐛 Possíveis Pontos de Falha

### PONTO 1: Frontend não enviando storeId
```
Frontend pega: const storeId = cart[0].storeId
Problema: Se product.storeId não foi salvito ao adicionar ao carrinho
Solução: Verificar se quando adiciona produto, está salvando storeId
```

### PONTO 2: Backend não encontrando storeId
```
Backend recebe storeId, mas está vazio/undefined
Problema: Frontend enviando { storeId: "" } ou { storeId: null }
Solução: Frontend validar antes de enviar
```

### PONTO 3: Backend buscando wallet com storeId errado
```
Busca: Wallet.findOne({ owner: storeIdStr, ownerType: 'store' })
Problema: storeIdStr tem espaços, tipos errados, etc
Solução: Logs vão mostrar
```

### PONTO 4: Role do usuário errado
```
Se usuario não está em role 'cliente' quando faz compra
Problema: Frontend bloqueia, ou backend rejeita
Solução: Verificar console do browser
```

### PONTO 5: Carteira da loja não criada
```
Se Wallet.findOne retorna null
Sistema cria nova wallet
Problema: Se houver erro ao salvar, transação rollback
Solução: Logs vão mostrar CREATE or UPDATE
```

---

## 📋 Checklist de Investigação

### ANTES DE FAZER COMPRA:

- [ ] Console F12 aberto
- [ ] User está em role 'cliente' (avatar mostra 👤)
- [ ] Carrinho tem produto com storeId preenchido
- [ ] Loja selecionada existe

### DURANTE A COMPRA:

**No Console (F12):**
- [ ] "📦 Enviando pedido:" aparece com storeId preenchido
- [ ] Se erro, qual é a mensagem?

**No Backend (Terminal):**
- [ ] "📦 [ORDER][CREATE] Iniciando criação de pedido:" aparece
- [ ] "🛍️ [ORDER][CREATE] StoreId recebido:" mostra qual valor
- [ ] "💳 [ORDER][WALLET] Procurando wallet da loja:" com storeId
- [ ] "✅ [ORDER][WALLET] Nova wallet criada:" OU "✅ [ORDER][WALLET] Wallet atualizada:"
- [ ] Se erro, qual é a mensagem?

### DEPOIS DA COMPRA:

**Frontend:**
- [ ] "✅ Pedido criado com sucesso!" aparece
- [ ] Redireciona para /store-order/[id]

**Backend:**
- [ ] "✅ Pedido com distribuição de wallets:" aparece
- [ ] Mostra storeAmount correto

**Lojista na My Wallet:**
- [ ] Muda role para lojista
- [ ] ownerType é 'store' (não 'user')
- [ ] Balance > 0
- [ ] Histórico mostra "Venda"

---

## 🔧 Como Fazer o Teste

### PASSO 1: Preparar Logs
```javascript
// No terminal do backend, limpe os logs anteriores
// Ou use > para novo arquivo:
npm run dev > /tmp/server.log 2>&1
```

### PASSO 2: Fazer Compra
1. F12 aberto → Console
2. Variável "user.activeRole" é 'cliente'?
   ```javascript
   // Cole no console do browser:
   console.log(user)  // mostra seu usuário
   ```
3. Adicione produto ao carrinho
4. Vá para /checkout
5. Finalize a compra
6. **Copie todos os logs** do console do browser
7. **Copie todos os logs** do backend

### PASSO 3: Analisar
Cola os logs aqui e procure por:
- "❌" = erro
- "📦" = informações do pedido
- "💳" = informações da wallet

---

## 📝 Template de Resposta

**Quando fizer a compra, me mande:**

```
=== CONSOLE DO BROWSER (F12) ===
[Cole todos os logs aqui]

=== CONSOLE DO BACKEND ===
[Cole todos os logs aqui]

=== RESULTADO ===
Loja viu crédito: SIM / NÃO
Saldo mostrando: R$ X

=== ERRO REPORTADO ===
[Cole qualquer erro aqui]
```

---

## 🚀 Para Começar:

1. Abra terminal onde backend está rodando
2. Procure por logs começando com "📦" ou "💳"
3. Faça uma compra
4. Me mande os logs!

Com os logs, consigo identificar exatamente onde o sistema está falhando.
