# 🔐 PRIMEIRO ACESSO COMO CEO - Guia Completo

> **Pergunta:** Como eu ganho acesso como CEO na minha conta pela primeira vez?

---

## 📋 Resumo Rápido

Existem **3 formas** de você ganhar acesso como CEO pela primeira vez:

| Forma | Requisito | Tempo | Dificuldade |
|-------|-----------|-------|-------------|
| **1. Script Automático** | MongoDB rodando | 2 min | Fácil ⭐ |
| **2. Importação Manual** | Arquivo JSON | 5 min | Médio ⭐⭐ |
| **3. Edição Direta do BD** | MongoDB + Know-how | 10 min | Difícil ⭐⭐⭐ |

---

## 🚀 FORMA 1: Script Automático (RECOMENDADO)

### O que acontece?
O script `seedRoles.ts` **cria automaticamente 5 contas admin** no seu MongoDB:

```
CEO          → ceo@admin.com / CEO@12345Admin
Marketing    → marketing@admin.com / Marketing@12345Admin
Admin        → admin@admin.com / Admin@12345Admin
Financeiro   → financeiro@admin.com / Financeiro@12345Admin
Suporte      → suporte@admin.com / Suporte@12345Admin
```

### Passos:

#### 1️⃣ Certifique-se que o MongoDB está rodando
```powershell
# Se estiver usando Docker Compose (recomendado):
docker-compose up -d

# Se estiver usando MongoDB local:
# Abra o MongoDB Compass ou mongod.exe
```

#### 2️⃣ Execute o script de seed
```powershell
# Terminal na pasta raiz do projeto
cd D:\PROJETOS\Drop

# Rode o script
npm run seed:roles
```

#### 3️⃣ Veja o resultado
```
✅ CEO criado: ceo@admin.com
✅ Marketing criado: marketing@admin.com
✅ Admin criado: admin@admin.com
✅ Financeiro criado: financeiro@admin.com
✅ Suporte criado: suporte@admin.com

🎉 5 contas admin criadas com sucesso!
```

#### 4️⃣ Faça login como CEO
```
URL: http://localhost:3000/login

Email: ceo@admin.com
Senha: CEO@12345Admin
```

#### 5️⃣ Acesse o painel de admin
```
Clique em: /admin/users
          /admin/settings
```

---

## 📁 FORMA 2: Importação Manual (Se MongoDB Offline)

### O que é?
Se o MongoDB não estiver rodando, use o arquivo JSON pré-preparado.

### Passos:

#### 1️⃣ Abra MongoDB Compass
```
Aplicação → MongoDB Compass
```

#### 2️⃣ Conecte ao seu MongoDB
```
Connection String: mongodb://localhost:27017

Ou use MongoDB Atlas (na nuvem)
```

#### 3️⃣ Importe os dados
```
Database: ifood_db
Collection: users

Clique em: ➕ Import Data
Selecione: admin-users-seed.json
Tipo: JSON

✅ Importar
```

#### 4️⃣ Resultado
```
5 contas criadas com as mesmas credenciais da Forma 1
```

---

## 🔧 FORMA 3: Edição Direta (Não Recomendado)

### Se nada acima funcionar...

#### 1️⃣ Abra MongoDB Compass
```
mongodb://localhost:27017/ifood_db
```

#### 2️⃣ Navegue até a collection `users`
```
Database: ifood_db
Collection: users
```

#### 3️⃣ Insira um novo documento manualmente
```json
{
  "_id": ObjectId(),
  "name": "Seu Nome",
  "email": "seu@email.com",
  "password": "$2b$10$...", // Usar bcrypt hash de uma senha
  "role": "ceo",
  "roles": ["ceo"],
  "activeRole": "ceo",
  "permissions": [
    "view_all",
    "edit_all",
    "delete_all",
    "manage_users",
    "manage_roles",
    "view_financials",
    "manage_rates"
  ],
  "status": "active",
  "storeId": null,
  "createdAt": new Date(),
  "updatedAt": new Date()
}
```

#### 4️⃣ Hash da senha
```bash
# Use uma ferramenta online ou no Node.js:
node -e "console.log(require('bcrypt').hashSync('SUA_SENHA', 10))"
```

---

## ❓ Perguntas Frequentes

### P: E se eu esquecer a senha do CEO?
**R:** Resete com o script:
```bash
npm run seed:roles
# Isso recria todas as 5 contas com as senhas padrão
```

### P: Posso trocar a senha depois de fazer login?
**R:** Sim! Vá em `/` → Perfil → Editar Senha

### P: Posso usar meu próprio email como CEO?
**R:** Sim! Após fazer login como CEO, vá em `/admin/users` e edite seu próprio perfil para mudar o email.

### P: Qual é a diferença entre os 5 roles?
**R:** Veja a tabela abaixo:

| Role | Pode Ver | Pode Editar | Acesso |
|------|----------|-------------|--------|
| **CEO** | Tudo | Tudo | `/admin/users`, `/admin/settings` |
| **Marketing** | Tudo | Promoções | `/admin/dashboard` |
| **Admin** | Tudo | Tudo | `/admin/users`, `/admin/settings` |
| **Financeiro** | Financeiro | Taxas | `/admin/settings` |
| **Suporte** | Tickets | Tickets | `/admin/tickets` |

### P: Posso ter múltiplos CEOs?
**R:** Sim! O script cria 5 contas. Você pode criar mais em `/admin/users`.

### P: É seguro usar senhas padrão?
**R:** Não! Depois de ganhar acesso, **altere TODAS as senhas** no `/admin/settings` ou em cada perfil.

---

## 🎯 Checklist: Primeiro Acesso CEO

- [ ] MongoDB está rodando (`docker-compose up -d`)
- [ ] Executei `npm run seed:roles`
- [ ] Script criou 5 contas com sucesso
- [ ] Fiz login em `http://localhost:3000` com `ceo@admin.com`
- [ ] Consegui acessar `/admin/users`
- [ ] Consegui acessar `/admin/settings`
- [ ] Testei editar um usuário
- [ ] Testei editar uma configuração
- [ ] Alterei a senha do CEO para algo seguro
- [ ] 🎉 Primeiro acesso CEO completo!

---

## 🚀 Próximos Passos

Após ganhar acesso como CEO:

1. **Altere as senhas padrão**
   - Vá em `/admin/users`
   - Clique no seu próprio perfil
   - Altere a senha

2. **Crie sua conta pessoal**
   - Vá em `/admin/users`
   - Clique em "➕ Novo Usuário"
   - Crie sua conta com email pessoal
   - Defina seu role pessoal (Cliente, Lojista, etc)

3. **Configure o sistema**
   - Vá em `/admin/settings`
   - Ajuste as comissões
   - Ajuste os valores de ganho motoboy

4. **Convide outros admins**
   - Crie contas para seus gerentes
   - Defina roles específicos para cada um
   - Distribua as senhas com segurança

---

## 📞 Troubleshooting

### Erro: "MongoDB connection failed"
```
✅ Solução: Certifique-se que Docker está rodando
docker-compose up -d
```

### Erro: "seedRoles not found"
```
✅ Solução: package.json pode não ter o script
npm install
npm run seed:roles
```

### Erro: "Invalid credentials"
```
✅ Solução: Verifique o email e senha exatamente como está em admin-users-seed.json
Email: ceo@admin.com
Senha: CEO@12345Admin
```

### Erro: "Access Denied"
```
✅ Solução: Pode ser um problema de CORS ou autenticação
Limpe cookies: DevTools → Application → Cookies → Delete
Faça login novamente
```

---

## 📊 Fluxo Visual

```
INÍCIO
  ↓
├─ MongoDB rodando?
│  ├─ SIM → npm run seed:roles (FORMA 1)
│  └─ NÃO → Importar admin-users-seed.json (FORMA 2)
  ↓
5 contas criadas
  ↓
Login como CEO
  ↓
http://localhost:3000/login
  ↓
Email: ceo@admin.com
Senha: CEO@12345Admin
  ↓
✅ Logged in
  ↓
/admin/users (Gerenciar usuários)
/admin/settings (Configurações)
  ↓
🎉 Você agora é CEO!
```

---

## 🎓 Resumo em Uma Frase

> **Para ganhar acesso como CEO pela primeira vez: Execute `npm run seed:roles`, faça login com `ceo@admin.com / CEO@12345Admin` em `http://localhost:3000`, e acesse `/admin/users`.**

---

**Precisa de ajuda?** Consulte:
- `LEIA_ME_ADMIN.md` - Start here
- `ADMIN_ACESSO_GUIDE.md` - Guia completo (50 páginas)
- `ADMIN_ONDE_CLICAR.md` - Onde clicar passo-a-passo
