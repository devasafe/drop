# 🔐 Transformar Usuário para CEO - Guia Prático

> **Seu Caso:** Você tem um usuário criado manualmente no MongoDB com `role: "cliente"` e quer transformá-lo para `CEO`

---

## 📊 Estado Atual do Seu Usuário

```json
{
  "_id": "69a2a81439f6e41a88b683cd",
  "name": "adm",
  "email": "adm@adm",
  "role": "cliente",           // ← PRECISA MUDAR PARA "ceo"
  "roles": [],                 // ← Vazio
  "activeRole": "cliente",     // ← Vai mudar para "ceo"
  "permissions": [...]         // ← Vai ganhar permissões CEO
  "status": "active"           // ← Já está ativo ✅
}
```

---

## 🎯 3 Formas de Transformar para CEO

### ✅ FORMA 1: Via Painel `/admin/users` (RECOMENDADO)

> **Requisito:** Você já precisa ter acesso como CEO

#### Passo 1: Faça login como CEO
```
URL: http://localhost:3000/login

Email: ceo@admin.com
Senha: CEO@12345Admin
```

**Resultado esperado:**
```
✅ Login realizado
🔓 Acesso CEO confirmado
→ Redirecionado para /dashboard
```

#### Passo 2: Acesse o painel de usuários
```
Clique em: 👥 GERENCIAR USUÁRIOS
ou digite: http://localhost:3000/admin/users
```

**Resultado esperado:**
```
┌─────────────────────────────────────────┐
│ 👥 Gerenciar Usuários                  │
├─────────────────────────────────────────┤
│ Total: 6 usuários | Filtrados: 6       │
├─────────────────────────────────────────┤
│ 🔍 Buscar por nome ou email...         │
│ 📋 Todos os Roles                      │
└─────────────────────────────────────────┘
```

#### Passo 3: Procure o usuário "adm"
```
Campo: 🔍 Buscar por nome ou email...
Digite: adm

Resultado:
┌──────────────────────────────────────────────────────────┐
│ Nome   │ Email    │ Role Atual │ Status  │ Ações        │
├──────────────────────────────────────────────────────────┤
│ adm    │ adm@adm  │ Cliente    │ ✅ Ativo│ ✏️ Editar    │
└──────────────────────────────────────────────────────────┘
```

#### Passo 4: Clique em "✏️ Editar"
```
Resultado:
┌──────────────────────────────────────────────────────────┐
│ adm    │ adm@adm  │ [Selecionar novo role...]│ ✅ Salvar  │
│        │          │                          │ ❌ Cancelar│
└──────────────────────────────────────────────────────────┘
```

#### Passo 5: Selecione "👑 CEO"
```
Dropdown aberto:
┌──────────────────────────────────┐
│ Selecionar novo role...          │
│ 👑 CEO                           │ ← CLIQUE AQUI
│ 📢 Marketing                     │
│ ⚙️ Gerente Geral                 │
│ 👥 Gerente Clientes              │
│ 🏪 Gerente Lojistas              │
│ 🏍️ Gerente Motoboys              │
│ 🏪 Lojista                       │
│ 👤 Cliente                       │
│ 🏍️ Motoboy                       │
└──────────────────────────────────┘

Selecionado: 👑 CEO ✓
```

#### Passo 6: Clique em "✅ Salvar"
```
Sistema processa:
⏳ Enviando alteração para servidor...
  └─ PUT /admin/users/69a2a81439f6e41a88b683cd/role
     └─ role: "ceo"

✅ Resposta do servidor:
   200 OK - Role atualizado com sucesso!

Tabela atualizada:
┌──────────────────────────────────────────────────────────┐
│ Nome   │ Email    │ Role Atual    │ Status  │ Ações      │
├──────────────────────────────────────────────────────────┤
│ adm    │ adm@adm  │ 👑 CEO        │ ✅ Ativo│ ✏️ Editar  │
└──────────────────────────────────────────────────────────┘
```

#### Passo 7: Confirme a transformação
```
Alert: ✅ Role atualizado com sucesso!

Clique em: [OK]

✨ PRONTO! Usuário "adm" agora é CEO!
```

---

### 🔧 FORMA 2: Edição Direta no MongoDB (Se painel não funcionar)

#### Passo 1: Abra MongoDB Compass
```
Aplicação → MongoDB Compass
ou
Acesse: mongodb://localhost:27017
```

#### Passo 2: Navegue até o usuário
```
Database: ifood_db
Collection: users
Documento: _id = "69a2a81439f6e41a88b683cd"
```

#### Passo 3: Edite os campos
```json
// ANTES:
{
  "_id": "69a2a81439f6e41a88b683cd",
  "name": "adm",
  "email": "adm@adm",
  "role": "cliente",           ❌ REMOVER
  "roles": [],                 ❌ MUDAR PARA ["ceo"]
  "activeRole": "cliente",     ❌ MUDAR PARA "ceo"
  "permissions": [...]
}

// DEPOIS:
{
  "_id": "69a2a81439f6e41a88b683cd",
  "name": "adm",
  "email": "adm@adm",
  "role": "ceo",               ✅ MUDADO
  "roles": ["ceo"],            ✅ ADICIONADO
  "activeRole": "ceo",         ✅ MUDADO
  "permissions": [
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

#### Passo 4: Salve as alterações
```
MongoDB Compass: Update Document
Clique em: [Save]

✅ Documento atualizado
```

#### Passo 5: Teste o acesso
```
http://localhost:3000/logout
http://localhost:3000/login

Email: adm@adm
Senha: (a senha que você tem)

✅ Login realizado como CEO
→ Você agora tem acesso a /admin/users e /admin/settings
```

---

### ⚙️ FORMA 3: Script Node.js (Se preferir automatizar)

#### Crie um arquivo: `transformar-para-ceo.js`
```javascript
const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://localhost:27017/ifood_db';

async function transformarParaCEO() {
  try {
    // Conectar ao MongoDB
    await mongoose.connect(MONGO_URI);
    console.log('📡 Conectado ao MongoDB');

    // Acessar a collection users
    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Atualizar o usuário
    const resultado = await usersCollection.updateOne(
      { _id: new mongoose.Types.ObjectId('69a2a81439f6e41a88b683cd') },
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
      console.log('✅ Usuário transformado para CEO com sucesso!');
    } else {
      console.log('❌ Usuário não encontrado ou já é CEO');
    }

    await mongoose.connection.close();
  } catch (err) {
    console.error('❌ Erro:', err.message);
  }
}

transformarParaCEO();
```

#### Execute o script
```bash
node transformar-para-ceo.js

Resultado esperado:
✅ Usuário transformado para CEO com sucesso!
```

---

## 🔍 Verificar se Funcionou

Depois de qualquer uma das 3 formas acima, verifique:

### ✅ Verificação 1: Dados no MongoDB
```bash
# Acesse MongoDB Compass
ifood_db → users → procure "adm@adm"

Deve mostrar:
{
  "role": "ceo",
  "roles": ["ceo"],
  "activeRole": "ceo",
  "permissions": [7 items]
}
```

### ✅ Verificação 2: Login no sistema
```
URL: http://localhost:3000/login
Email: adm@adm
Senha: (sua senha)

✅ Sucesso → Redirecionado para /dashboard
❌ Erro → Verifique as credenciais
```

### ✅ Verificação 3: Acesso ao painel
```
http://localhost:3000/admin/users

✅ Sucesso → Painel carrega, você vê lista de usuários
❌ Erro 403 → Role ainda não foi atualizado, tente refresh

Refresh: F5 ou Ctrl+Shift+R (limpar cache)
```

### ✅ Verificação 4: Permissions no Frontend
```javascript
// Abra DevTools → Console
// Você deve ver:

{
  "auth": {
    "token": "eyJhbGc...",
    "user": {
      "id": "69a2a81439f6e41a88b683cd",
      "role": "ceo",
      "permissions": [
        "view_all",
        "edit_all",
        "delete_all",
        "manage_users",
        "manage_roles",
        "view_financials",
        "manage_rates"
      ]
    }
  }
}
```

---

## ⚠️ Problemas Comuns & Soluções

### ❌ "Erro: Usuário não encontrado"
```
Causa: Email ou _id incorreto
Solução: Verifique no MongoDB:
- _id correto: 69a2a81439f6e41a88b683cd
- email correto: adm@adm
```

### ❌ "Erro 403: Forbidden"
```
Causa: Você não é CEO ainda
Solução:
1. Forma 1 não pode ser usada (precisa ser CEO primeiro)
2. Use Forma 2 ou 3
3. Depois tente novamente
```

### ❌ "Erro: MongoDB connection failed"
```
Causa: MongoDB não está rodando
Solução: 
docker-compose up -d
ou
Abra MongoDB Compass e conecte
```

### ❌ "Login inválido: Credenciais incorretas"
```
Causa: Email ou senha errada
Solução:
- Email: adm@adm (sem espaços)
- Senha: A mesma que você usava antes
- Se esqueceu, resete com Forma 2 ou 3
```

### ❌ "Não vejo usuário na tabela mesmo sendo CEO"
```
Causa: Cache do navegador
Solução:
- Limpar cookies: DevTools → Application → Cookies → Delete All
- Limpar localStorage: DevTools → Application → Local Storage → Delete All
- Fazer refresh: Ctrl+Shift+R (hard refresh)
- Fazer logout e login novamente
```

---

## 📊 Resumo Visual do Processo

```
USUÁRIO ATUAL: "adm"
├─ role: "cliente"
├─ permissions: []
└─ status: "active"

                    ↓ APLICAR UMA DAS 3 FORMAS ↓

┌──────────────────────────────────────────────┐
│ FORMA 1: /admin/users (painel web)           │
│ - Requer: Já ser CEO                         │
│ - Tempo: 2 minutos                           │
│ - Facilidade: ⭐⭐⭐⭐⭐ Muito fácil           │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ FORMA 2: MongoDB Compass (manual)            │
│ - Requer: MongoDB rodando                    │
│ - Tempo: 5 minutos                           │
│ - Facilidade: ⭐⭐⭐ Médio                    │
└──────────────────────────────────────────────┘

┌──────────────────────────────────────────────┐
│ FORMA 3: Node.js script                      │
│ - Requer: Node.js instalado                  │
│ - Tempo: 1 minuto                            │
│ - Facilidade: ⭐⭐⭐⭐ Fácil                  │
└──────────────────────────────────────────────┘

                    ↓ RESULTADO ↓

USUÁRIO TRANSFORMADO: "adm"
├─ role: "ceo"
├─ roles: ["ceo"]
├─ activeRole: "ceo"
├─ permissions: [7 itens]
└─ status: "active"

                    ↓ ✅ SUCESSO ↓

VOCÊ AGORA PODE:
✅ Acessar /admin/users
✅ Acessar /admin/settings
✅ Editar todos os usuários
✅ Editar todas as configurações
✅ Gerenciar roles e permissions
```

---

## 🎯 Passo-a-Passo Rápido (TL;DR)

### Se você já é CEO:
```
1. http://localhost:3000/admin/users
2. Buscar: "adm"
3. Clique: ✏️ Editar
4. Selecione: 👑 CEO
5. Clique: ✅ Salvar
6. ✨ Pronto!
```

### Se você NÃO é CEO ainda:
```
1. Abra MongoDB Compass
2. ifood_db → users → procure "adm@adm"
3. Edite:
   - role: "cliente" → "ceo"
   - roles: [] → ["ceo"]
   - activeRole: "cliente" → "ceo"
   - permissions: [] → [7 itens]
4. Clique: Update
5. ✨ Pronto!
```

---

## 📞 Checklist Final

- [ ] Usuário "adm" tem role "ceo"
- [ ] Usuário "adm" tem permissions com 7 itens
- [ ] Consegui fazer login com adm@adm
- [ ] Consegui acessar /admin/users
- [ ] Consegui acessar /admin/settings
- [ ] Consegui editar outro usuário
- [ ] 🎉 Transformação para CEO completa!

---

**Próximas ações:**
1. Transforme o usuário para CEO
2. Faça login e teste os painéis
3. Altere a senha do "adm@adm" para algo seguro
4. Crie sua conta pessoal com outro email
5. Distribua roles para outros usuários conforme necessário
