# 🧪 Teste Frontend: Verificar Atualização de Carteira

## 🎯 Objetivo
Verificar se o frontend está atualizando corretamente quando muda de role

---

## ✅ Checklist de Verificação

### PASSO 1: Abrir Console (F12)
- [ ] Pressione F12
- [ ] Vá para aba **Console**
- [ ] Limpe logs anteriores (cmd+K ou ctrl+K)

### PASSO 2: Fazer Login
- [ ] Faça login como lojista
- [ ] Veja logs no console:
  ```
  ✅ Token set in axios: ...
  📍 Loading wallet for role: cliente
  💰 Wallet loaded: { balance: 0, totalIncome: 0, ... }
  ```

### PASSO 3: Clicar no Avatar da Navbar
- [ ] Clique no avatar (foto/nome) na navbar
- [ ] Menu deve abrir com opções de role

### PASSO 4: Selecionar LOJISTA
- [ ] Clique em **[🏪 Loja]** ou **Lojista**
- [ ] Observe os logs:
  ```
  🔀 handleSwitchRole called with: lojista
  🔄 Switching role to: lojista
  📡 Request to /auth/switch-role Auth header: present
  ✅ Role switched successfully
  ✅ Token set in axios: ...
  ✅ switchRole completed, redirecting to /my-wallet
  📍 Loading wallet for role: lojista
  🔔 ROLE CHANGED DETECTED: { activeRole: 'lojista', ... }
  💰 Wallet loaded: { balance: X, ownerType: 'store', ... }
  ```

### PASSO 5: VERIFICAR OS DADOS

**✅ ESPERADO:**
```javascript
// Logs devem aparecer NESTA ORDEM:
1. 🔀 handleSwitchRole called with: lojista
2. 🔄 Switching role to: lojista
3. ✅ Role switched successfully
4. 📍 Loading wallet for role: lojista  // ← NOVA role
5. 🔔 ROLE CHANGED DETECTED: { activeRole: 'lojista' }
6. 💰 Wallet loaded: {
     owner: "storeId",          // ✅ Store ID
     ownerType: "store",        // ✅ STORE
     balance: X,                // ✅ Saldo real
     totalIncome: X,
     history: [...]
   }
```

**❌ SE APARECER ISSO, TEM BUG:**
```javascript
// Logs não aparecem nesta ordem
1. 🔀 handleSwitchRole called with: lojista
2. (nada)
3. 📍 Loading wallet for role: cliente  // ← ERRADO! Ainda é cliente
4. 💰 Wallet loaded: {
     owner: "userId",           // ❌ USER ID
     ownerType: "user",         // ❌ USER
     balance: 0
   }
```

---

## 🔍 Troubleshooting

### Problema 1: "ROLE CHANGED DETECTED" não aparece
```
SIGNIFICA: Quando muda role, o useEffect não está sendo acionado
CAUSA: Dependency array errado
SOLUÇÃO: Verificar se [user?.id, user?.activeRole] está no useEffect
```

### Problema 2: "Loading wallet for role: cliente" em vez de "lojista"
```
SIGNIFICA: O user.activeRole não foi atualizado
CAUSA: AuthContext não atualizou o user corretamente
SOLUÇÃO: 
1. Verificar localStorage.getItem('user')
2. Vê se tem storeId? 
3. console.log(localStorage.getItem('user'))
```

### Problema 3: ownerType é "user" em vez de "store"
```
SIGNIFICA: Backend não achou a carteira de loja
CAUSA: user.storeId é undefined no backend
SOLUÇÃO:
1. No login, verificar se estou retornando storeId
2. Verificar se o usuário foi criado com storeId
3. Executar migration-script se necessário
```

### Problema 4: Balance fica 0 mesmo tendo vendas
```
SIGNIFICA: Não há histórico de vendas cadastrado
CAUSA: Nenhum pedido foi feito para esta loja
SOLUÇÃO:
1. Como cliente, fazer um pedido nesta loja
2. Aguardar 2-3 segundos
3. Voltar para role lojista
4. Recarregar a página (F5)
5. Balance deve aumentar
```

---

## 📝 Teste Completo (Funcional)

Se tudo funciona, siga este teste:

```
1. Login como lojista (email/senha)
   Esperado: Cliente wallet balance = 0

2. Clique no avatar → [🏪 Loja]
   Esperado: Store wallet aparece (pode estar vazio)

3. Como cliente, faça um pedido nesta loja (R$ 100)
   Esperado: Pedido criado

4. Volte para role lojista
   Esperado: Wallet mostra +R$ 80 (80% do pedido)

5. Clique [↙️ Enviar para Usuário] (R$ 50)
   Esperado: 
   - Store: -R$ 50 (agora R$ 30)
   - User: +R$ 50 (agora R$ 50)

6. Mude role para cliente
   Esperado: User wallet mostra R$ 50

7. Clique [💳 Depositar] (R$ 100)
   Esperado: User wallet agora R$ 150

8. Clique [💸 Transferir] (R$ 40) para loja
   Esperado:
   - User: -R$ 40 (agora R$ 110)
   - Store: +R$ 40 (agora R$ 70)

9. Mude role para lojista
   Esperado: Store wallet mostra R$ 70
```

---

## 🎯 Se tudo passar:

Seu sistema está funcionando corretamente! ✅

```javascript
// Esperados finais:
- Store wallet: R$ 70
- User wallet: R$ 110
- Total movimentado: R$ 180
- Histórico: 6 transações
```

---

## 💾 Copie os logs do console

Para ajudar com debug:

1. Selecione todos os logs (Ctrl+A)
2. Copie (Ctrl+C)
3. Cole aqui para análise

```
[Cole aqui os logs]
```

---

**Status: Pronto para testar!** 🚀
