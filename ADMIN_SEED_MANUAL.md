# 🔐 COMO IMPORTAR CONTAS DE ADMIN

**Se o `npm run seed:roles` não funcionou (MongoDB não rodando), siga este guia.**

---

## 📋 Método 1: MongoDB Compass (Interface Visual)

### Passo 1: Abrir MongoDB Compass

```
1. Abra MongoDB Compass (se instalado)
2. Conecte ao servidor local (padrão: mongodb://localhost:27017)
3. Abra o banco: "ifood-admin" (ou seu banco padrão)
4. Abra a collection: "users"
```

### Passo 2: Importar Usuários

```
1. Clique no botão "+" (Add Data)
2. Selecione "Import File"
3. Escolha o arquivo: admin-users-seed.json
4. Clique "Import"
5. ✅ Usuários importados!
```

---

## 📋 Método 2: MongoDB Shell (Terminal)

### Passo 1: Conectar ao MongoDB

```bash
mongosh mongodb://localhost:27017/ifood-admin
```

### Passo 2: Copiar e Colar os Usuários

```javascript
db.users.insertMany([
  {
    name: "CEO",
    email: "ceo@admin.com",
    passwordHash: "admin123",
    role: "ceo",
    roles: ["ceo"],
    activeRole: "ceo",
    permissions: ["view_all", "edit_all", "delete_all", "manage_users", "manage_roles"],
    isAdmin: true,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    name: "Marketing",
    email: "marketing@admin.com",
    passwordHash: "admin123",
    role: "marketing",
    roles: ["marketing"],
    activeRole: "marketing",
    permissions: ["view_all", "edit_promotions", "view_financials", "manage_campaigns"],
    isAdmin: true,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    name: "Admin",
    email: "admin@admin.com",
    passwordHash: "admin123",
    role: "gerente_geral",
    roles: ["gerente_geral"],
    activeRole: "gerente_geral",
    permissions: ["view_all", "edit_users", "edit_stores", "edit_motoboys", "manage_support"],
    isAdmin: true,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    name: "Financeiro",
    email: "financeiro@admin.com",
    passwordHash: "admin123",
    role: "gerente_geral",
    roles: ["gerente_geral"],
    activeRole: "gerente_geral",
    permissions: ["view_financials", "view_wallets", "export_reports", "manage_payouts"],
    isAdmin: true,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date()
  },
  {
    name: "Suporte",
    email: "suporte@admin.com",
    passwordHash: "admin123",
    role: "gerente_clientes",
    roles: ["gerente_clientes"],
    activeRole: "gerente_clientes",
    permissions: ["view_users", "view_orders", "respond_tickets", "view_reports"],
    isAdmin: true,
    status: "active",
    createdAt: new Date(),
    updatedAt: new Date()
  }
])

// Resultado: Inserted 5 documents
```

### Passo 3: Verificar se Importou

```javascript
db.users.find({ isAdmin: true })

// Resultado: Mostra os 5 usuários admin
```

---

## 📋 Método 3: Fazer Login com Senha Temporária

Se conseguiu importar os usuários, use estas credenciais:

```
Email: ceo@admin.com
Senha: admin123
```

**⚠️ ALTERE A SENHA DEPOIS!**

---

## ❓ Por que o Seed falhou?

O script `npm run seed:roles` precisa que:

✅ MongoDB esteja rodando (`mongod` ou serviço Docker)  
✅ Conexão com banco de dados ativa  
✅ Variável `MONGODB_URI` definida em `.env`  

Se MongoDB não estiver rodando, use um dos métodos acima para importar os usuários.

---

## ✅ Checklist

```
□ Usuários importados no MongoDB
□ Consegue fazer login como CEO (ceo@admin.com)
□ Consegue acessar /admin/users
□ Consegue editar um usuário
□ Consegue acessar /admin/settings
```

---

**Próximo Passo**: Faça login como CEO e teste os painéis!

