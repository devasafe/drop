# 🔍 Debug: Verificar storeId no Banco de Dados

## 🎯 Problema Identificado

Os logs mostram:
```javascript
👤 Full user object: {id: '69b8411d02a4d729a65ee155', name: 'lj', email: 'lj@lj', role: 'lojista', activeRole: 'lojista'}
// ❌ NÃO TEM storeId!
```

Isso significa que o **usuário "lj" não tem um `storeId` preenchido** no MongoDB!

---

## 🧪 Como Verificar

### Opção 1: MongoDB Compass (GUI)

1. Abra MongoDB Compass
2. Conecte ao seu banco
3. Vá para: `Database` → `drop` → `users`
4. Procure pelo usuário **"lj"** (email: lj@lj)
5. Verifique se tem campo `storeId`

**Esperado:**
```json
{
  "_id": "69b8411d02a4d729a65ee155",
  "name": "lj",
  "email": "lj@lj",
  "role": "lojista",
  "roles": ["lojista", "cliente"],
  "storeId": "69b8411d02a4d729a65ee156",  ← DEVE ESTAR AQUI
  ...
}
```

**Problema:**
```json
{
  "_id": "69b8411d02a4d729a65ee155",
  "name": "lj",
  "email": "lj@lj",
  "role": "lojista",
  "roles": ["lojista", "cliente"],
  // ❌ SEM storeId!
  ...
}
```

---

### Opção 2: Terminal/MongoDB CLI

```bash
mongosh
use drop
db.users.findOne({ email: 'lj@lj' })
```

**Procure por:**
```json
"storeId": ObjectId("69b8411d02a4d729a65ee156")
```

---

### Opção 3: Script Node.js

Cole em um terminal na pasta do projeto:

```bash
npm run dev
# Em outro terminal:
node
```

Depois:
```javascript
const mongoose = require('mongoose');
const User = require('./src/models/User').default;

mongoose.connect('mongodb://localhost:27017/drop').then(async () => {
  const user = await User.findOne({ email: 'lj@lj' });
  console.log('User:', JSON.stringify(user, null, 2));
  process.exit(0);
});
```

---

## 🛠️ Soluções

### Solução 1: Criar uma Loja para o Usuário

Se o usuário existe mas não tem loja:

1. Vá para o **dashboard da loja** (como lojista)
2. Clique em **"Criar Nova Loja"** ou **"Settings"**
3. Preencha os dados e confirme
4. O sistema deve **automático** preencher `user.storeId`

### Solução 2: Executar Script de Migração

Se tem script de migração:

```bash
npm run migrate:store-user-relationship
```

Este script vincula usuários com suas lojas.

### Solução 3: Atualizar Manualmente via MongoDB

```javascript
// No MongoDB Compass ou mongosh:
db.users.updateOne(
  { email: 'lj@lj' },
  { 
    $set: { 
      storeId: ObjectId('69b8411d02a4d729a65ee156')  // ID da sua loja
    } 
  }
)
```

---

## ✅ Como Saber o ID da Sua Loja

### Opção 1: No MongoDB

```bash
mongosh
use drop
db.stores.find()  # Lista todas as lojas
```

Procure a loja do usuário "lj" e copie o `_id`.

### Opção 2: No Frontend

1. Faça login como lojista
2. Vá para o **Store Dashboard** (/store-dashboard)
3. Copie a URL: `http://localhost:3001/store-dashboard?storeId=XXXXX`
4. O `XXXXX` é o ID da loja

### Opção 3: No Backend

Se tem um endpoint `/api/stores`, faça:

```bash
curl http://localhost:5000/api/stores -H "Authorization: Bearer SEU_TOKEN"
```

---

## 🔄 Fluxo Correto

```
1. Usuário registra como "lojista"
   ↓
2. Sistema cria um Store (loja) para ele
   ↓
3. User.storeId = Store._id
   ↓
4. Quando faz login ou troca role, backend retorna storeId
   ↓
5. Frontend sabe qual wallet carregar (user ou store)
   ↓
6. ownerType = 'store', owner = storeId
   ✅ FUNCIONA!
```

---

## 🚨 Se Não Tem Loja

Se o usuário "lj" é lojista mas não tem loja criada:

### Opção A: Criar loja via frontend

1. Após login como lojista
2. Vá para **Minha Loja** ou **Store Settings**
3. Clique **Criar Loja**
4. Preencha nome, descrição, etc
5. Confirmar

### Opção B: Criar via script

```javascript
const Store = require('./src/models/Store').default;
const User = require('./src/models/User').default;

const user = await User.findOne({ email: 'lj@lj' });

const store = new Store({
  name: 'Loja do LJ',
  ownerId: user._id,
  description: 'Minha loja',
  // ... outros campos
});

await store.save();

// Atualizar user com storeId
user.storeId = store._id;
await user.save();

console.log('✅ Loja criada e vinculada!');
```

---

## 📋 Checklist

- [ ] Verifiquei se o usuário "lj" tem `storeId` no MongoDB
- [ ] Se não tem, criei uma loja ou executei o script de migração
- [ ] Agora `user.storeId` tem um valor (não null/undefined)
- [ ] Fiz logout e login novamente
- [ ] Troquei para role "lojista"
- [ ] Verifiquei se `ownerType` é agora "store" (não "user")

---

**Se passar por todos os passos acima, o sistema funcionará!** ✅

Qual é a situação do seu usuário "lj"? Tem uma loja criada ou precisa criar?
