# 🎯 ACESSO ADMIN - RESUMO EXECUTIVO

## ⚡ Quick Start (5 minutos)

### 1️⃣ Criar Contas Admin

```bash
cd d:/PROJETOS/Drop
npm run seed:roles
```

✅ Isso cria 5 contas prontas:

| Role | Email | Senha |
|------|-------|-------|
| CEO | ceo@admin.com | CEO@12345Admin |
| Marketing | marketing@admin.com | Marketing@12345Admin |
| Admin | admin@admin.com | Admin@12345Admin |
| Financeiro | financeiro@admin.com | Financeiro@12345Admin |
| Suporte | suporte@admin.com | Suporte@12345Admin |

### 2️⃣ Fazer Login

1. Abra `http://localhost:3000/login`
2. Digite email + senha
3. Clique "Entrar"

### 3️⃣ Acessar Painel

```
CEO: http://localhost:3000/admin/dashboard
Admin: http://localhost:3000/admin/users
Financeiro: http://localhost:3000/admin/settings
```

---

## 📊 Painéis Disponíveis

### 👑 CEO (`/admin/dashboard`)
- 📈 Dashboard com KPIs
- 💰 Finanças em tempo real
- 📊 Gráficos e analytics
- ✅ Acesso a TUDO

### 👥 Admin (`/admin/users`)
- Listar todos os usuários
- **Editar role** (Cliente → Lojista → CEO)
- Bloquear/Desbloquear conta
- Buscar por nome/email
- Filtrar por role

### ⚙️ Configurações (`/admin/settings`)
- Editar **comissões** (15%, 20%, 30%)
- Editar **ganho motoboy** (R$ base + km)
- Editar **limites de saque**
- Ver simulação de distribuição

---

## 🎯 Tarefas Comuns

### ✅ Como Transformar Cliente em Lojista?

```
1. Abra /admin/users
2. Procure o cliente (nome ou email)
3. Clique "✏️ Editar"
4. Selecione "🏪 Lojista"
5. Clique "✅ Salvar"
6. ✅ Pronto! Agora é lojista
```

### ✅ Como Alterar Taxas de Comissão?

```
1. Abra /admin/settings
2. Mude valores:
   - Plano 1: 15% → 18%
   - Plano 2: 20% → 22%
   - Plano 3: 30% → 35%
3. Veja simulação (Loja recebe X%)
4. Clique "✅ Salvar"
5. ✅ Novos pedidos usam novas taxas
```

### ✅ Como Bloquear um Usuário?

```
1. Abra /admin/users
2. Procure o usuário
3. Clique "🚫 Bloquear"
4. ✅ Usuário não pode mais fazer login
```

### ✅ Como Alterar Ganho Motoboy?

```
1. Abra /admin/settings
2. Mude "Ganho Base": R$ 7 → R$ 8
3. Mude "Taxa KM": R$ 1 → R$ 1.20
4. Veja exemplo: 10km = R$ 18 (antes era R$ 17)
5. ✅ Pronto!
```

---

## 🔐 Hierarquia de Roles

```
👑 CEO (Topo)
├─ Visualiza TUDO
├─ Edita TUDO
├─ Deleta TUDO
├─ Gerencia users
└─ Gerencia roles

  ├─ 📢 Marketing
  │  ├─ Visualiza tudo
  │  ├─ Edita promoções
  │  └─ Ver analytics
  │
  ├─ ⚙️ Admin
  │  ├─ Edita usuários
  │  ├─ Edita lojas
  │  ├─ Edita motoboys
  │  └─ Gerencia suporte
  │
  ├─ 💰 Financeiro
  │  ├─ Ver finanças
  │  ├─ Ver wallets
  │  └─ Exportar relatórios
  │
  └─ 🎧 Suporte
     ├─ Ver usuários
     ├─ Ver pedidos
     └─ Responder tickets
```

---

## 📁 Arquivos Criados Hoje

```
Backend:
├─ src/scripts/seedRoles.ts
│  └─ Script para criar 5 contas admin
│
└─ package.json (atualizado)
   └─ Adicionado: npm run seed:roles

Frontend:
├─ pages/admin/users.tsx
│  └─ Painel de gerenciamento de usuários
│
└─ pages/admin/settings.tsx
   └─ Painel de configurações

Documentação:
└─ ADMIN_ACCESS_GUIDE.md
   └─ Guia completo de acesso e roles
```

---

## 🚀 Comandos Essenciais

```bash
# 1. Iniciar Backend
cd d:/PROJETOS/Drop
npm run dev

# 2. Iniciar Frontend (em outro terminal)
cd d:/PROJETOS/Drop/frontend
npm run dev

# 3. Criar Contas Admin
npm run seed:roles

# 4. Fazer Build
npm run build

# 5. Testar Tudo
npm test
```

---

## 🎨 Visualização dos Painéis

### Painel de Usuários

```
┌─────────────────────────────────────────────────────────────┐
│  👥 Gerenciar Usuários                                      │
├─────────────────────────────────────────────────────────────┤
│  🔍 Buscar...        | 📋 Todos os Roles                   │
├─────────────────────────────────────────────────────────────┤
│ Nome      | Email              | Role    | Status | Ações  │
├─────────────────────────────────────────────────────────────┤
│ João      | joao@mail.com      | Cliente | ✅     | ✏️ 🚫 │
│ Maria     | maria@mail.com     | Lojista | ✅     | ✏️ 🚫 │
│ Pedro     | pedro@mail.com     | CEO     | ✅     | ✏️ 🚫 │
└─────────────────────────────────────────────────────────────┘
```

### Painel de Configurações

```
┌──────────────────────────────────────────────────────────────┐
│  ⚙️ Configurações do Sistema                                │
├──────────────────────────────────────────────────────────────┤
│  💰 Comissões        │  🏍️ Ganhos Motoboy                 │
│  ─────────────────   │  ─────────────────                │
│  Plano 1:  15% ────  │  Base:  R$ 7 ────                │
│  Plano 2:  20% ────  │  KM:    R$ 1/km                  │
│  Plano 3:  30% ────  │  Mín:   R$ 50                    │
├──────────────────────────────────────────────────────────────┤
│  [Cancelar]  [✅ Salvar]                                    │
└──────────────────────────────────────────────────────────────┘
```

---

## 💡 Dicas Importantes

### 📌 Seed é Essencial

Primeiro comando que deve rodar:
```bash
npm run seed:roles
```

Isso cria as 5 contas de admin. Sem isso, não pode fazer login como CEO.

### 📌 Email + Senha Diferenciam Maiúsculas

```
✅ Correto: CEO@12345Admin (com maiúsculas)
❌ Errado: ceo@12345admin (sem maiúsculas)
```

### 📌 Alterações de Taxa Valem para NOVOS Pedidos

```
Antes: Taxa de 15% (100 pedidos com essa taxa)
Depois: Muda para 18% 
Resultado: Próximos pedidos usam 18%
           Pedidos antigos continuam com 15%
```

### 📌 Bloquear é Reversível

```
Bloqueia usuário → Não consegue fazer login
Desbloqueia → Volta a funcionar normalmente
Dados preservados
```

---

## ❌ Problemas Comuns

| Problema | Solução |
|----------|---------|
| "Acesso Negado" | Verifique seu role em /admin/users |
| "Usuário não encontrado" | Rode `npm run seed:roles` novamente |
| "Erro ao salvar" | Verifique se backend está rodando |
| Role não aparece | F5 (atualizar página) |

---

## ✅ Checklist Final

```
□ Backend rodando
□ Frontend rodando
□ Seed criado (npm run seed:roles)
□ Consegue fazer login como CEO
□ Consegue acessar /admin/users
□ Consegue editar um role
□ Consegue bloquear um usuário
□ Consegue editar configurações
```

---

## 📖 Documentação Completa

Para mais detalhes, abra:
- **`ADMIN_ACCESS_GUIDE.md`** - Guia completo (20 páginas)
- **`DOCUMENTACAO_INDEX.md`** - Índice geral
- **`IMPLEMENTACAO_FINAL_BACKEND_FRONTEND.md`** - Arquitetura

---

## 🎉 Pronto!

Agora você pode:

✅ Criar contas de admin  
✅ Fazer login como CEO  
✅ Editar usuários e roles  
✅ Alterar configurações da plataforma  
✅ Gerenciar a plataforma inteira  

**Bora começar!** 🚀

```bash
npm run seed:roles
npm run dev
```

