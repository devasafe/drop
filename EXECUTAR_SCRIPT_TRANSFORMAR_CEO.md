# 🔧 TRANSFORMAR CEO - Executar Script Corretamente

## ❌ O Que NÃO Fazer

```javascript
// ❌ ERRADO - Isso não funciona no console do navegador
transformarParaCEO('adm')
// ReferenceError: transformarParaCEO is not defined
```

**Por quê?** O script `transformarParaCEO` é um **script Node.js do servidor**, não código do navegador (frontend).

---

## ✅ O Que Fazer - 3 Formas Corretas

### 🟢 FORMA 1: Executar no Terminal (RECOMENDADO)

#### Passo 1: Abra PowerShell
```powershell
# Navegue até a pasta raiz do projeto
cd D:\PROJETOS\Drop
```

#### Passo 2: Criar o arquivo do script
Se você ainda não criou, crie um arquivo chamado `transformar-para-ceo.js` na raiz:

```javascript
// D:\PROJETOS\Drop\transformar-para-ceo.js

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

    // Atualizar o usuário "adm"
    const resultado = await usersCollection.updateOne(
      { name: 'adm' },  // Procurar por name="adm"
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
      console.log('✅ Usuário "adm" transformado para CEO com sucesso!');
    } else if (resultado.matchedCount === 0) {
      console.log('❌ Usuário "adm" não encontrado');
    } else {
      console.log('⚠️ Usuário já era CEO');
    }

    await mongoose.connection.close();
    process.exit(0);
  } catch (err) {
    console.error('❌ Erro:', err.message);
    process.exit(1);
  }
}

transformarParaCEO();
```

#### Passo 3: Execute no terminal
```powershell
# Certifique-se que MongoDB está rodando
docker-compose up -d

# Aguarde 5 segundos

# Execute o script
node transformar-para-ceo.js
```

#### Resultado esperado
```
📡 Conectado ao MongoDB
✅ Usuário "adm" transformado para CEO com sucesso!
```

---

### 🟡 FORMA 2: Via MongoDB Compass (Manual - Mais Fácil)

Se preferir não usar terminal, use a interface gráfica:

#### Passo 1: Abra MongoDB Compass
```
Clique em: MongoDB Compass (ícone)
ou
Acesse: mongodb://localhost:27017
```

#### Passo 2: Navegue até o usuário
```
Database: ifood_db
Collection: users
```

Clique em **"COLLECTIONS"** na esquerda e veja a lista de usuários.

#### Passo 3: Procure "adm"
```
Use o filtro ou pesquise:
{ "name": "adm" }

Clique no documento para editá-lo
```

#### Passo 4: Edite os campos
```json
{
  "_id": ObjectId("69a2a81439f6e41a88b683cd"),
  "name": "adm",
  "email": "adm@adm",
  "role": "ceo",                    // ← MUDE DE "cliente"
  "roles": ["ceo"],                 // ← MUDE DE []
  "activeRole": "ceo",              // ← MUDE DE "cliente"
  "permissions": [                  // ← ADICIONE ISSO
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

#### Passo 5: Clique em "Update"
```
Botão verde no canto inferior direito
```

**Resultado:**
```
✅ Document updated successfully
```

---

### 🔵 FORMA 3: Via MongoDB Atlas (Na nuvem)

Se você está usando **MongoDB Atlas** (cloud):

#### Passo 1: Acesse seu Atlas
```
https://cloud.mongodb.com
Login com suas credenciais
```

#### Passo 2: Navegue até o banco de dados
```
Projeto → Cluster → Collections
Database: ifood_db
Collection: users
```

#### Passo 3: Procure pelo documento "adm"
```
Clique em: EDIT
```

#### Passo 4: Faça as mesmas edições
```json
"role": "ceo",
"roles": ["ceo"],
"activeRole": "ceo",
"permissions": [7 itens]
```

#### Passo 5: Clique em "Save"
```
✅ Documento salvo
```

---

## 🔴 Problema: Erro 500 na Hora do Login

Vi que você está recebendo:
```
⚠️ Internal server error
POST :4000/api/auth/login → 500
```

### Causas Possíveis:

#### ❌ Erro 1: MongoDB não está rodando
```powershell
# Verifique se MongoDB está ativo
docker-compose ps

# Se não estiver, inicie:
docker-compose up -d
```

#### ❌ Erro 2: Backend não está rodando
```powershell
# Abra um novo terminal na pasta raiz
cd D:\PROJETOS\Drop

# Inicie o backend
npm run dev
```

#### ❌ Erro 3: Senha ou email inválido
```
Email: adm@adm (sem espaços, tudo minúsculo)
Senha: Aquela que você usou quando criou o usuário
```

#### ❌ Erro 4: Erro no código do backend
```
Abra: src/controllers/authController.ts
Procure por erros no método login
```

---

## 📋 Checklist: Corrigir Erro 500

- [ ] Docker está rodando: `docker-compose up -d`
- [ ] Backend está rodando: `npm run dev` (terminal separado)
- [ ] MongoDB conectado ao backend
- [ ] Usuário "adm" existe no MongoDB
- [ ] Email está correto: `adm@adm`
- [ ] Senha está correta (a que você usou)
- [ ] Fazer refresh: `Ctrl+Shift+R` (limpar cache)
- [ ] Se ainda não funcionar, verificar logs do backend

---

## 🚀 Fluxo Correto para Ganhar Acesso CEO

```
PASSO 1: Preparar MongoDB
├─ docker-compose up -d
└─ ✅ MongoDB rodando

PASSO 2: Transformar usuário "adm" para CEO
├─ Opção A: Executar node transformar-para-ceo.js
├─ Opção B: Editar no MongoDB Compass (manual)
└─ ✅ "adm" agora é CEO

PASSO 3: Iniciar backend
├─ npm run dev
└─ ✅ Backend rodando em :4000

PASSO 4: Fazer login
├─ URL: http://localhost:3000/login
├─ Email: adm@adm
├─ Senha: (sua senha)
└─ ✅ Login bem-sucedido

PASSO 5: Acessar painel CEO
├─ http://localhost:3000/admin/users
├─ http://localhost:3000/admin/settings
└─ 🎉 Você é CEO!
```

---

## 🔍 Verificar se Funcionou

### Verificação 1: MongoDB
```bash
# Abra MongoDB Compass
# Procure por "adm"
# Deve ter role="ceo" e permissions=[7 itens]
```

### Verificação 2: Backend Logs
```
Terminal npm run dev deve mostrar:
✅ Express server running on :4000
✅ MongoDB connected
```

### Verificação 3: Login
```
http://localhost:3000/login
✅ Login bem-sucedido
```

### Verificação 4: Painel
```
http://localhost:3000/admin/users
✅ Painel carrega
✅ Você vê lista de usuários
```

---

## 🎓 Resumo das 3 Formas

| Forma | Como | Tempo | Facilidade |
|-------|------|-------|-----------|
| **1. Terminal** | `node transformar-para-ceo.js` | 1 min | ⭐⭐⭐⭐ |
| **2. Compass** | Clique, edite, salve | 3 min | ⭐⭐⭐⭐⭐ |
| **3. Atlas** | Web, edite, salve | 2 min | ⭐⭐⭐⭐ |

**Recomendação:** Use a **FORMA 2 (Compass)** - é a mais intuitiva e não requer linha de comando.

---

## 💬 Se Ainda Tiver Erro...

Compartilhe:
1. **Saída completa do erro** do backend (terminal `npm run dev`)
2. **Output do `docker-compose ps`** (verificar containers)
3. **Screenshot do MongoDB Compass** mostrando documento "adm"
4. **Verificação:** MongoDB está rodando? Backend está rodando?

Com essas informações consigo resolver qualquer erro!
