# ⚡ Teste Rápido: Rastrear Compra até Wallet

## 🎯 Objetivo
Descobrir por que a compra não credita na carteira da loja

---

## 🧪 Teste: 5 Minutos

### PASSO 1: Preparar (30 segundos)

1. Abra 2 janelas lado a lado:
   - **Esquerda**: Browser (http://localhost:3001)
   - **Direita**: Terminal com logs do backend

2. **Browser**: Abra F12 → Console
   - Limpe logs anteriores (Ctrl+K ou Cmd+K)
   - Deixe visível

3. **Terminal**: Procure últimas linhas para ver se backend está rodando
   - Deve mostrar: "Server running on port 5000" ou similar

---

### PASSO 2: Fazer Login (1 minuto)

1. **Browser**: Faça login como **cliente** (não lojista!)
   - Deve mostrar: 👤 (ícone de usuário)
   - Console deve mostrar: "👤 Full user object: { ..., activeRole: 'cliente' }"

2. **Verificar Console** F12:
   ```
   ✅ Token set in axios
   📍 Loading wallet for role: cliente
   ```

---

### PASSO 3: Adicionar Produto (1 minuto)

1. **Browser**: Vá para /produtos (ou busque uma loja)
2. Clique em um produto para ver detalhes
3. Clique em **"Adicionar ao Carrinho"** ou **"+"**

**Verificar Console F12:**
```
Deve mostrar algo como:
✅ Produto adicionado ao carrinho
```

---

### PASSO 4: Ir para Checkout (1 minuto)

1. **Browser**: Vá para /checkout
2. Preencha endereço se necessário
3. Clique em **"Finalizar Compra"**

**Verificar Console F12:**
```
Procure por: "📦 Enviando pedido:"
Deve mostrar:
{
  storeId: "abc123...",  ← CRÍTICO! Deve ter valor
  products: [...],
  deliveryDistanceKm: X,
  ...
}
```

**Se `storeId` estiver vazio, aí está o problema!**

---

### PASSO 5: Analisar Resposta (2 minutos)

**No Terminal (backend):**
```
Procure por estes logs nesta ordem:

1. 📦 [ORDER][CREATE] Iniciando criação de pedido:
   └─ Mostra customerId e storeId

2. 🛍️ [ORDER][CREATE] StoreId recebido:
   └─ Mostra qual valor foi recebido

3. 💳 [ORDER][WALLET] Procurando wallet da loja:
   └─ Mostra storeIdStr e storeAmount

4. 💳 [ORDER][WALLET] Resultado da busca:
   └─ Mostra found: true ou found: false

5. ✅ [ORDER][WALLET] Nova wallet criada: OU ✅ [ORDER][WALLET] Wallet atualizada:
   └─ Se chegou aqui, foi bem-sucedido!

6. ✅ Pedido com distribuição de wallets:
   └─ Final confirmation
```

**No Browser (F12):**
```
Procure por:
✅ Pedido criado com sucesso!
```

---

## 🔴 Se Falhar em Algum Passo

### Se `storeId` está vazio no Console F12:
```
❌ PROBLEMA: Produto não tem storeId salvo

SOLUÇÃO:
1. Verificar se quando cria produto, está incluindo storeId
2. Procurar onde adiciona produto ao carrinho
3. Garantir que cart item tem storeId
```

### Se "Resultado da busca: found: false":
```
❌ PROBLEMA: Wallet da loja não existe E erro ao criar

CAUSA: Pode ser permissão MongoDB ou schema
SOLUÇÃO:
1. Verificar próximo log de erro
2. Procurar por: "❌" ou "Error"
```

### Se "Wallet updated: newBalance: 0":
```
❌ PROBLEMA: Wallet foi atualizada mas com valor 0

CAUSA: distribution.storeAmount é 0 ou negativo
SOLUÇÃO:
1. Verificar cálculo da comissão
2. Ver se planCommissionPercent está muito alto (100%?)
```

### Se nenhum log "ORDER" aparece:
```
❌ PROBLEMA: Requisição nunca chegou ao backend

CAUSA: 
1. Bloqueio de role (activeRole !== 'cliente')
2. Erro na validação do frontend
3. Erro de conexão

SOLUÇÃO:
1. Verificar F12 se tem erro
2. Verificar se activeRole é 'cliente'
3. Verificar se storeId não está vazio
```

---

## 📋 Checklist Antes de Me Avisar

- [ ] Terminal com backend aberto e mostrando "Server running"
- [ ] Browser com F12 aberto
- [ ] Estou em role 'cliente' (não lojista)
- [ ] Adicionei um produto ao carrinho
- [ ] Finalizei a compra
- [ ] Copiei os logs do backend (terminal)
- [ ] Copiei os logs do frontend (F12 console)

---

## 💾 Quando Colar os Logs

Cole aqui:

```
=== BROWSER CONSOLE (F12) ===
[Cole logs da compra]

=== BACKEND LOGS (Terminal) ===
[Cole logs desde "📦 [ORDER][CREATE]" até "✅ Pedido com distribuição"]

=== Qual foi o erro? ===
[Descreva o que viu]
```

---

**Pronto? Faça a compra e envie os logs!** 🚀
