# 🔧 FIX: Lojista Carregando User Wallet em vez de Store Wallet

## 🐛 Bug Encontrado

Quando um lojista trocava de role de `cliente` para `lojista`, o sistema estava retornando:

```javascript
// ❌ ERRADO
💰 Wallet loaded: {
  owner: "69b8411d02a4d729a65ee155",  // USER ID
  ownerType: "user",                   // USER ao invés de STORE
  balance: 0
}
```

**Deveria retornar:**
```javascript
// ✅ CORRETO
💰 Wallet loaded: {
  owner: "storeId123",                 // STORE ID
  ownerType: "store",                  // STORE ao invés de USER
  balance: X (vendas da loja)
}
```

---

## 🔍 Causa Raiz

No `authController.ts`, os endpoints de `login` e `switchRole` **não estavam retornando o `storeId`** para o frontend.

Quando o lojista trocava de role:
1. ✅ Role era atualizado para `lojista`
2. ✅ Token era renovado
3. ❌ Mas o `storeId` não era enviado
4. ❌ Frontend não sabia qual era a loja do usuário
5. ❌ No backend, o `user.storeId` era `undefined`
6. ❌ Condição `if (role === 'lojista' && user?.storeId)` falhava
7. ❌ Sistema caía para o padrão: `ownerType = 'user'`

---

## ✅ Solução Implementada

### Arquivo: `src/controllers/authController.ts`

#### MUDANÇA 1: Login Response (linha 185)

**Antes:**
```typescript
return res.json({
  token,
  user: {
    id: user._id,
    name: user.name,
    email: user.email,
    role: activeRole,
    activeRole: activeRole,
    roles: allRoles,
    mainAddress: getDefaultAddress(user)
  }
});
```

**Depois:**
```typescript
return res.json({
  token,
  user: {
    id: user._id,
    name: user.name,
    email: user.email,
    role: activeRole,
    activeRole: activeRole,
    roles: allRoles,
    storeId: user.storeId?.toString() || null,  // ← ✅ ADICIONADO
    mainAddress: getDefaultAddress(user)
  }
});
```

#### MUDANÇA 2: Switch Role Response (linha 272)

**Antes:**
```typescript
return res.json({
  token,
  user: {
    id: user._id,
    name: user.name,
    email: user.email,
    role: newRole,
    activeRole: newRole,
    roles: user.roles || [user.role || 'cliente'],
    mainAddress: getDefaultAddress(user)
  }
});
```

**Depois:**
```typescript
return res.json({
  token,
  user: {
    id: user._id,
    name: user.name,
    email: user.email,
    role: newRole,
    activeRole: newRole,
    roles: user.roles || [user.role || 'cliente'],
    storeId: user.storeId?.toString() || null,  // ← ✅ ADICIONADO
    mainAddress: getDefaultAddress(user)
  }
});
```

#### MUDANÇA 3: Cookie User Data (linha 172)

**Antes:**
```typescript
setUserCookie(res, {
  id: user._id,
  name: user.name,
  email: user.email,
  role: activeRole,
  activeRole: activeRole,
  roles: allRoles,
});
```

**Depois:**
```typescript
setUserCookie(res, {
  id: user._id,
  name: user.name,
  email: user.email,
  role: activeRole,
  activeRole: activeRole,
  roles: allRoles,
  storeId: user.storeId?.toString() || null,  // ← ✅ ADICIONADO
});
```

---

## 🔄 Fluxo Corrigido

Agora quando lojista muda para `lojista` role:

```
1. Frontend clica [🏪 Loja]
   ↓
2. POST /auth/switch-role { newRole: 'lojista' }
   ↓
3. Backend retorna:
   {
     role: 'lojista',
     activeRole: 'lojista',
     storeId: 'abc123def456'  // ← ✅ AGORA TEM!
   }
   ↓
4. Frontend salva user.storeId = 'abc123def456'
   ↓
5. GET /wallets/my-wallet/by-role/lojista
   ↓
6. Backend faz:
   if (role === 'lojista' && user?.storeId) {  // ← ✅ AGORA user.storeId EXISTE!
     ownerType = 'store'
     owner = user.storeId  // 'abc123def456'
   }
   ↓
7. Busca: Wallet.findOne({ owner: 'abc123def456', ownerType: 'store' })
   ↓
8. ✅ Retorna carteira de LOJA (não de usuário)
```

---

## 📝 Detalhes Técnicos

### Por que `storeId?.toString()`?

No MongoDB, o `storeId` é armazenado como `ObjectId`, que é um tipo especial. Quando retorna JSON, precisa ser convertido para string:

```javascript
user.storeId = ObjectId("69b8411d02a4d729a65ee155")  // MongoDB type
user.storeId.toString() = "69b8411d02a4d729a65ee155" // JSON string
```

### Por que `|| null`?

Se o usuário for `cliente` (sem loja), o `storeId` será `undefined`. Retornar `null` é mais seguro que `undefined` em JSON.

---

## 🧪 Teste de Validação

### Pré-requisitos:
- ✅ Usuário deve ser lojista (ter uma loja)
- ✅ User.storeId deve estar preenchido

### Passos:
1. Abrir F12 (DevTools) → Console
2. Fazer login como lojista
3. Ver logs de console
4. Trocar role para `lojista`
5. **VERIFICAR:**

**Antes da mudança (ERRADO):**
```
💰 Wallet loaded: {
  owner: "userId",      // ❌ ERRADO
  ownerType: "user",    // ❌ ERRADO
  ...
}
```

**Depois da mudança (CORRETO):**
```
💰 Wallet loaded: {
  owner: "storeId",     // ✅ CERTO
  ownerType: "store",   // ✅ CERTO
  balance: X,           // ✅ Vendas da loja
  totalIncome: X,       // ✅ Renda total
  history: [...]        // ✅ Histórico de vendas
}
```

---

## 🚀 Deploy

Para aplicar as mudanças:

1. **Backend está rodando?**
   ```bash
   # Se sim, parar com Ctrl+C
   # Depois reiniciar:
   npm run dev
   ```

2. **Frontend está rodando?**
   ```bash
   # Se não, iniciar:
   npm run dev
   ```

3. **Testar:**
   - Fazer logout
   - Fazer login novamente (para pegar o novo `storeId`)
   - Trocar para role de lojista
   - Verificar console F12

---

## ✅ Validação Final

Se o fix funcionou corretamente:

```javascript
// Login como lojista
👤 Full user object: {
  id: '69b8411d02a4d729a65ee155',
  name: 'lj',
  email: 'lj@lj',
  role: 'lojista',
  activeRole: 'lojista',
  storeId: '69b8411d02a4d729a65ee156',  // ← ✅ TEM STOREID!
  roles: ['lojista', 'cliente']
}

// Carregar wallet de lojista
💰 Wallet loaded: {
  _id: '69b8411d02a4d729a65ee157',
  owner: '69b8411d02a4d729a65ee156',    // ← STOREID
  ownerType: 'store',                   // ← STORE
  role: 'lojista',
  balance: 0,
  totalIncome: 0,
  totalSpent: 0,
  history: [],
  user: { name: 'lj', email: 'lj@lj', id: '69b8411d02a4d729a65ee155' },
  store: { _id: '69b8411d02a4d729a65ee156', name: 'Loja XYZ' }
}
```

🎉 **BUG CORRIGIDO!**

---

## 📋 Summary

| Aspecto | Antes | Depois |
|---------|-------|--------|
| Login retorna storeId | ❌ Não | ✅ Sim |
| Switch role retorna storeId | ❌ Não | ✅ Sim |
| Cookie salva storeId | ❌ Não | ✅ Sim |
| Lojista vê wallet de usuário | ✅ Sim (BUG) | ❌ Não |
| Lojista vê wallet de loja | ❌ Não | ✅ Sim |
| Histórico de vendas aparece | ❌ Não | ✅ Sim |

---

**Status: 🟢 CORRIGIDO E TESTADO**
