# 🧪 Teste Lojista - Console F12 Logs

## Objetivo
Verificar que o lojista funciona **exatamente igual ao motoboy** com base nos console logs

---

## 📋 Checklist de Testes

### TESTE 1: Login de Lojista e Carregar Carteira de Cliente

**Passos:**
1. Abrir F12 (DevTools)
2. Ir para Console
3. Fazer login como **lojista**
4. Aguardar carteira carregar

**Logs Esperados:**
```
✅ Token set in axios: eyJhbGciOiJIUzI1NiIs...
📍 Loading wallet for role: cliente
💰 Wallet loaded: {
  owner: "userId",
  ownerType: "user",
  balance: X,
  totalIncome: X,
  totalSpent: X,
  history: []
}
```

**Validação:**
- [ ] Token está presente no axios
- [ ] Role é "cliente"
- [ ] Wallet carrega sem erros
- [ ] ownerType é "user"
- [ ] Balance é número (mesmo que 0)

---

### TESTE 2: Mudar Role para LOJISTA

**Passos:**
1. Clique no **avatar na navbar**
2. Selecione **[🏪 Loja]** (store role)
3. Observe os logs no F12

**Logs Esperados:**
```
🔀 handleSwitchRole called with: lojista
🔄 Switching role to: lojista
📡 Request to /auth/switch-role Auth header: present
✅ Role switched successfully
✅ Token set in axios: eyJhbGciOiJIUzI1NiIs...
✅ switchRole completed, redirecting to /my-wallet
📍 Loading wallet for role: lojista
```

**Validação:**
- [ ] handleSwitchRole chamado com "lojista"
- [ ] Request enviado com Auth header
- [ ] Role switched successfully aparece
- [ ] Token atualizado
- [ ] Redireciona para /my-wallet

---

### TESTE 3: Verificar Carteira de LOJISTA

**Passos:**
1. Após mudar para role lojista
2. Aguarde wallet carregar
3. Verifique os logs no F12

**Logs Esperados:**
```
📡 Request to /wallets/my-wallet/by-role/lojista Auth header: present
💰 Wallet loaded: {
  owner: "storeId",
  ownerType: "store",
  role: "lojista",
  balance: X,
  totalIncome: X,
  totalSpent: X,
  history: [...]
}
```

**Validação - CRÍTICA:**
- [ ] Request é para `/wallets/my-wallet/by-role/lojista`
- [ ] ownerType é **"store"** (não "user")
- [ ] owner é **storeId** (não userId)
- [ ] role é **"lojista"**
- [ ] Wallet tem dados de vendas (totalIncome > 0 se teve vendas)
- [ ] History mostra transações de vendas

---

### TESTE 4: Comparar Logs com Motoboy

**Logs do Motoboy (Referência):**
```
📍 Loading wallet for role: motoboy
💰 Wallet loaded: {
  owner: "69b8424d12a3bf236e480d32",
  ownerType: "motoboy",
  role: "motoboy",
  balance: 79.44,
  totalIncome: 79.44,
  totalSpent: 0,
  history: (12) [{…}, {…}, ...]
}
```

**Logs do Lojista (Esperados):**
```
📍 Loading wallet for role: lojista
💰 Wallet loaded: {
  owner: "storeId123",
  ownerType: "store",
  role: "lojista",
  balance: X,
  totalIncome: X,
  totalSpent: X,
  history: [...]
}
```

**Comparação:**
| Campo | Motoboy | Lojista | Iguais? |
|-------|---------|---------|--------|
| Loading message | ✅ Aparece | ✅ Deve aparecer | [ ] |
| ownerType | "motoboy" | "store" | [ ] |
| role | "motoboy" | "lojista" | [ ] |
| balance | Número | Número | [ ] |
| totalIncome | Número | Número | [ ] |
| history | Array | Array | [ ] |
| Request com Auth | ✅ Yes | ✅ Deve sim | [ ] |

---

## 🔍 Se Algo Falhar...

### Erro 1: Não aparece "Loading wallet for role: lojista"
```
CAUSA PROVÁVEL: User.storeId não está preenchido
SOLUÇÃO:
1. Verificar em console: console.log(user.storeId)
2. Se undefined: Executar migration-script
3. Se tem valor: Refresh (F5) e tente novamente
```

### Erro 2: ownerType é "user" em vez de "store"
```
CAUSA PROVÁVEL: API está retornando user wallet ao invés de store wallet
SOLUÇÃO:
1. Verificar backend: walletController.ts linha 260
2. Verificar query: { owner: storeId, ownerType: 'store' }
3. Checar se wallet de loja foi criada
4. No console do backend: verificar logs de /wallets/my-wallet/by-role/lojista
```

### Erro 3: "Auth header: missing"
```
CAUSA PROVÁVEL: Token não está sendo enviado corretamente
SOLUÇÃO:
1. Verificar: console.log(localStorage.getItem('token'))
2. Fazer logout e login novamente
3. Limpar localStorage: localStorage.clear()
4. Recarregar página
```

### Erro 4: Carteira vazia (balance = 0, history = [])
```
CAUSA PROVÁVEL: Lojista nunca recebeu pedidos OU histórico não foi criado
SOLUÇÃO:
1. Criar um pedido como cliente usando essa loja
2. Fazer um delivery para gerar transação
3. Aguardar 2-3 segundos
4. Recarregar wallet (F5)
5. Verificar console do servidor para erros
```

---

## ✅ Validação Final

Se TODOS os checkboxes acima forem marcados ✅, então:

```
🎉 LOJISTA FUNCIONA EXATAMENTE COMO MOTOBOY!

✅ Role switching funciona
✅ Wallet carrega por role
✅ ownerType discrimina corretamente
✅ Auth header é enviado
✅ Histórico é preenchido
✅ Balance é rastreado
✅ Tudo idêntico ao sistema de motoboy
```

---

## 📝 Exemplo Completo de Console

```
// Login
✅ Token set in axios: eyJhbGciOiJIUzI1NiIs...
📍 Loading wallet for role: cliente
👤 Full user object: {id: '69b8424d12a3bf236e480d32', name: 'João', storeId: '12345678', ...}
📡 Request to /wallets/my-wallet/by-role/cliente Auth header: present
💰 Wallet loaded: {_id: '123', owner: '69b8424d12a3bf236e480d32', ownerType: 'user', balance: 0, ...}

// Trocar para lojista
🔀 handleSwitchRole called with: lojista
🔄 Switching role to: lojista
📡 Request to /auth/switch-role Auth header: present
✅ Role switched successfully
✅ Token set in axios: eyJhbGciOiJIUzI1NiIs...
✅ switchRole completed, redirecting to /my-wallet
📍 Loading wallet for role: lojista
👤 Full user object: {id: '69b8424d12a3bf236e480d32', name: 'João', activeRole: 'lojista', storeId: '12345678', ...}
📡 Request to /wallets/my-wallet/by-role/lojista Auth header: present
💰 Wallet loaded: {_id: '456', owner: '12345678', ownerType: 'store', role: 'lojista', balance: 250.50, totalIncome: 500.00, history: [...]}

// ✅ SUCESSO!
```

---

## 🎯 Próximos Passos

1. **Execute este teste** - capture os logs do seu console
2. **Cole os logs** aqui se tiver dúvidas
3. **Compare com motoboy** - veja se é idêntico
4. **Se falhar** - use a seção "Se Algo Falhar" acima

**Status: Pronto para testar!** 🚀
