# 🔧 FIX: Carteira da Loja Não Aparecia em "Minha Carteira"

## 📋 Problema Identificado

**Sintoma:**
- ✅ **Métrica da Loja** mostrava "Receita: R$ 18.00" (correto)
- ❌ **"Minha Carteira"** mostrava "Saldo: R$ 0,00" (errado)

**Raiz do Problema:**

O usuario `lj` não tinha `user.storeId` preenchido no banco de dados.

Quando a carteira é carregada no endpoint `GET /wallets/my-wallet/by-role/lojista`:

```typescript
if (role === 'lojista' && user?.storeId) {
  ownerType = 'store';
  owner = user.storeId.toString();  // ← Isso era undefined!
} else {
  // Fallback para user wallet
  ownerType = 'user';
  owner = userId;
}
```

Como `user.storeId` era undefined:
- ❌ Carregava a carteira do **usuario** (R$ 0,00)
- ❌ Não carregava a carteira da **loja** (R$ 18,00)

## 🔍 Causa Raiz

No `storeController.ts`, quando um usuario cria uma store:

```typescript
export const createStore = async (req: AuthenticatedRequest, res: Response) => {
  // ... validações ...
  
  const store = new Store({ ownerId, name, address, cnpj, latitude, longitude });
  await store.save();
  
  // ❌ PROBLEMA: Não estava atualizando user.storeId!
  
  return res.status(201).json(store);
};
```

A store era criada corretamente, **MAS** `user.storeId` não era atualizado.

Isso significava:
- `Store.ownerId` → Points to user ✅
- `User.storeId` → Not set ❌

## ✅ Solução Aplicada

### 1️⃣ Fix no Backend (storeController.ts)

Após criar a store, agora atualizamos `user.storeId`:

```typescript
export const createStore = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { name, address, cnpj, latitude, longitude } = req.body;
    const ownerId = req.user?.id;
    if (!ownerId) return res.status(401).json({ error: 'Not authenticated' });
    if (!name) return res.status(400).json({ error: 'Missing name' });
    
    const existing = await Store.findOne({ ownerId });
    if (existing) return res.status(400).json({ error: 'User already has a store' });

    const store = new Store({ ownerId, name, address, cnpj, latitude, longitude });
    await store.save();
    
    // ✅ FIX: Atualizar user.storeId para que o wallet funcione
    const User = require('../models/User').default;
    await User.findByIdAndUpdate(ownerId, { storeId: store._id }, { new: true });
    console.log('✅ [CREATE_STORE] User.storeId atualizado:', { ownerId, storeId: store._id });
    
    emitStoreCreated(store.toObject());
    
    return res.status(201).json(store);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'Failed to create store' });
  }
};
```

**O que muda:**
- Quando novo usuario cria uma store → `user.storeId` é preenchido automaticamente
- Frontend agora consegue encontrar a carteira da loja corretamente

### 2️⃣ Fix para Usuario Existente (lj)

Script `fix-lj-storeid.js` foi executado:

```
👤 Usuario "lj" encontrado
🏪 Store "AsapStore" encontrada
📝 Atualizando user.storeId...
✅ storeId atualizado: 69b978d620f0d5c949d691b0
```

Agora o usuario `lj` tem:
```
{
  _id: ObjectId("69b9783b20f0d5c949d691a9"),
  name: 'lj',
  storeId: ObjectId("69b978d620f0d5c949d691b0")  // ✅ PREENCHIDO!
}
```

## 🧪 Como Testar

1. **Login como "lj"**
   ```
   Email: lj@example.com
   Senha: [sua senha]
   ```

2. **Ir em "Minha Carteira"**
   - Roledown para garantir que está na role "lojista"
   - Deve mostrar: **Saldo: R$ 18,00** ✅

3. **Comparar com métricas**
   - Dashboard > "Métricas da Loja"
   - Deve mostrar: **Receita: R$ 18.00** ✅
   - Agora ambos terão o mesmo valor!

## 📊 Impacto

| Situação | Antes | Depois |
|----------|-------|--------|
| **Usuario lj - Minha Carteira** | R$ 0,00 ❌ | R$ 18,00 ✅ |
| **Usuario lj - Métricas** | R$ 18,00 ✅ | R$ 18,00 ✅ |
| **Novos usuarios criando loja** | storeId undefined ❌ | storeId auto-preenchido ✅ |

## 🎯 Próximos Passos (Opcional)

Se quiser garantir que não há mais usuarios com esse problema:

```bash
# Script para encontrar todos os usuarios sem storeId
node find-users-without-storeid.js

# Se encontrar, pode usar o script de fix genérico
node fix-all-users-storeid.js
```

---

**Status:** ✅ **RESOLVIDO**

O usuario `lj` agora consegue ver a carteira da loja corretamente em "Minha Carteira" com saldo R$ 18,00.

Todos os novos usuarios que criarem stores terão `storeId` preenchido automaticamente.
