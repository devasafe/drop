# ✅ Transformar Nova Conta "adm" para CEO

## 📊 Status Atual

```json
{
  "_id": "69a2b75a39f6e41a88b6856f",
  "name": "adm",
  "email": "adm@adm",
  "passwordHash": "$2b$10$WiPP3Pykgxx8m.Momb3JROaPF.vj15monx3HGM6hLFdUeBk7POj.2",
  "role": "cliente",              ← MUDA PARA "ceo"
  "roles": ["cliente"],            ← MUDA PARA ["ceo"]
  "activeRole": "cliente",         ← MUDA PARA "ceo"
  "permissions": []                ← ADICIONA 7 PERMISSÕES
}
```

---

## 🔧 Opção 1: MongoDB Compass (MAIS RÁPIDO)

### Passo 1: Abra MongoDB Compass
```
Aplicação → MongoDB Compass
ou acesse a conexão já aberta
```

### Passo 2: Navegue até o documento
```
Database: ifood_db
Collection: users
Procure por: { "_id": "69a2b75a39f6e41a88b6856f" }
ou { "email": "adm@adm" }
```

### Passo 3: Clique em EDIT
Você vai ver o documento completo

### Passo 4: Faça as seguintes alterações

**Campo 1: role**
```
Antes: "cliente"
Depois: "ceo"
```

**Campo 2: roles**
```
Antes: ["cliente"]
Depois: ["ceo"]
```

**Campo 3: activeRole**
```
Antes: "cliente"
Depois: "ceo"
```

**Campo 4: permissions**
```
Antes: []
Depois: [
  "view_all",
  "edit_all",
  "delete_all",
  "manage_users",
  "manage_roles",
  "view_financials",
  "manage_rates"
]
```

### Passo 5: Clique em "Update"
```
Botão verde no canto inferior direito
✅ Document updated successfully
```

---

## 🔧 Opção 2: Script Node.js (AUTOMATIZADO)

Se preferir, crie um arquivo `transformar-adm-ceo.js`:

```javascript
// D:\PROJETOS\Drop\transformar-adm-ceo.js

const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://localhost:27017/ifood_db';

async function transformarAdmParaCEO() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('📡 Conectado ao MongoDB');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    const resultado = await usersCollection.updateOne(
      { _id: new mongoose.Types.ObjectId('69a2b75a39f6e41a88b6856f') },
      {
        $set: {
          role: 'ceo',
          roles: ['ceo'],
          activeRole: 'ceo',
          permissions: [
            'view_all',
            'edit_all',
            'delete_all',
            'manage_users',
            'manage_roles',
            'view_financials',
            'manage_rates'
          ]
        }
      }
    );

    if (resultado.modifiedCount === 1) {
      console.log('✅ "adm" transformado para CEO com sucesso!');
    } else {
      console.log('❌ Documento não encontrado');
    }

    await mongoose.connection.close();
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

transformarAdmParaCEO();
```

Execute:
```powershell
node transformar-adm-ceo.js
```

---

## ✅ Depois da Transformação

Seu documento ficará assim:

```json
{
  "_id": "69a2b75a39f6e41a88b6856f",
  "name": "adm",
  "email": "adm@adm",
  "passwordHash": "$2b$10$WiPP3Pykgxx8m.Momb3JROaPF.vj15monx3HGM6hLFdUeBk7POj.2",
  "role": "ceo",                   ✅ MUDADO
  "roles": ["ceo"],                ✅ MUDADO
  "activeRole": "ceo",             ✅ MUDADO
  "permissions": [                 ✅ MUDADO
    "view_all",
    "edit_all",
    "delete_all",
    "manage_users",
    "manage_roles",
    "view_financials",
    "manage_rates"
  ]
}
```

---

## 🚀 Testar Login

### Passo 1: Reiniciar backend
```powershell
# Terminal onde npm run dev está rodando
Ctrl+C (parar)
npm run dev (reiniciar)
```

### Passo 2: Fazer login
```
URL: http://localhost:3000/login
Ctrl+Shift+R (hard refresh)

Email: adm@adm
Senha: adm

Clique: Entrar
```

### Passo 3: Verificar resultado

**✅ Sucesso:**
```
URL muda para: http://localhost:3000/
Você vê a tela principal
```

**❌ Erro 500 novamente:**
```
Algo deu errado
Cheque o terminal onde npm run dev está rodando
Compartilhe a mensagem de erro
```

---

## 📋 Checklist

- [ ] Abri MongoDB Compass
- [ ] Encontrei o documento com _id: 69a2b75a39f6e41a88b6856f
- [ ] Editei: role = "ceo"
- [ ] Editei: roles = ["ceo"]
- [ ] Editei: activeRole = "ceo"
- [ ] Editei: permissions = [7 itens]
- [ ] Cliquei "Update"
- [ ] Reiniciei backend (Ctrl+C, npm run dev)
- [ ] Fiz login com adm@adm / adm
- [ ] ✅ Login funcionou!
- [ ] Acessei /admin/users
- [ ] Acessei /admin/settings
- [ ] 🎉 Sou CEO!

---

## 🎯 Próximo Passo

**Depois que conseguir fazer login:**

1. Acesse `http://localhost:3000/admin/users`
2. Você deve ver a lista de usuários
3. Parabéns! 👑 Você é CEO!

---

**TENTE AGORA! Qual opção você vai usar?**
- **Opção 1:** MongoDB Compass (manual, rápido)
- **Opção 2:** Script Node.js (automático)

Compartilha o resultado! 🚀
