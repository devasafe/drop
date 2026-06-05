# 🚀 FLUXO COMPLETO: Login → Admin → Gerenciar Usuários

## 📊 Visão Geral

```
USER ABRE APLICAÇÃO
    ↓
http://localhost:3000 (Home)
    ↓
CLICA EM "LOGIN" / "ENTRAR"
    ↓
http://localhost:3000/login (Tela de Login)
    ↓
PREENCHE EMAIL + SENHA (ex: ceo@admin.com + CEO@12345Admin)
    ↓
CLICA "ENTRAR"
    ↓
BACKEND VALIDA (JWT token)
    ↓
SIM? → REDIRECIONA PARA DASHBOARD
NÃO? → MOSTRA ERRO "Credenciais inválidas"
    ↓
USUÁRIO VÊ MENU COM OPÇÕES
    ├─ Se for CEO: VÊ "👥 Gerenciar Usuários"
    ├─ Se for Marketing: VÊ "📊 Analytics"
    ├─ Se for Admin: VÊ "👥 Usuários"
    └─ Etc...
    ↓
CLICA NO PAINEL DESEJADO
    ↓
ABRE PÁGINA ESPECÍFICA
    ↓
EDITA DADOS
    ↓
SALVA MUDANÇAS
```

---

## 🎯 Passo-a-Passo Detalhado

### FASE 1: PREPARAÇÃO

```bash
# 1. Backend rodando
cd d:/PROJETOS/Drop
npm run dev
→ Rodando em http://localhost:4000

# 2. Frontend rodando (em outro terminal)
cd d:/PROJETOS/Drop/frontend
npm run dev
→ Rodando em http://localhost:3000

# 3. MongoDB rodando (em outro terminal)
mongod
→ Conectado em mongodb://localhost:27017

# 4. Importar usuários de admin (se necessário)
# Use: ADMIN_SEED_MANUAL.md
```

---

### FASE 2: TELA DE LOGIN

**URL**: `http://localhost:3000/login`

```
┌──────────────────────────────┐
│   🔐 LOGIN                   │
├──────────────────────────────┤
│                              │
│  Email: ________________     │
│                              │
│  Senha: ________________     │
│                              │
│  [Lembrar de mim]           │
│                              │
│        [ENTRAR]              │
│                              │
│  Não tem conta? [Cadastre]  │
│                              │
└──────────────────────────────┘
```

**Credenciais para CEO:**

```
Email: ceo@admin.com
Senha: CEO@12345Admin
```

**Credenciais para Admin:**

```
Email: admin@admin.com
Senha: Admin@12345Admin
```

---

### FASE 3: APÓS LOGIN (Dashboard)

**URL**: `http://localhost:3000/` (redireciona para `/dashboard`)

```
┌─────────────────────────────────────────────┐
│  👋 Bem-vindo, CEO!          [Sair] [👤]   │
├─────────────────────────────────────────────┤
│                                             │
│  📊 MEUS PAINÉIS                            │
│  ├─ 📊 Dashboard (visão geral)              │
│  ├─ 👥 Gerenciar Usuários                   │
│  ├─ 🏪 Gerenciar Lojas                      │
│  ├─ 🏍️  Gerenciar Motoboys                  │
│  ├─ ⚙️  Configurações                       │
│  ├─ 💰 Finanças                             │
│  └─ 🚪 Sair                                 │
│                                             │
│  📈 STATS RÁPIDOS                           │
│  ├─ Total Usuários: 1,234                   │
│  ├─ Lojas Ativas: 123                       │
│  ├─ Receita Mês: R$ 45.678                  │
│  └─ Pedidos Hoje: 234                       │
│                                             │
└─────────────────────────────────────────────┘
```

---

### FASE 4: ABRINDO PAINEL DE USUÁRIOS

**Clica em: "👥 Gerenciar Usuários"**

**URL**: `http://localhost:3000/admin/users`

```
┌────────────────────────────────────────────────────┐
│  👥 Gerenciar Usuários                             │
│  Total: 45 usuários | Filtrados: 45               │
├────────────────────────────────────────────────────┤
│                                                    │
│  🔍 Buscar por nome...    | 📋 Todos os Roles    │
│                                                    │
├────────────────────────────────────────────────────┤
│ Nome    | Email        | Role   | Status | Ações  │
├────────────────────────────────────────────────────┤
│ João    | joao@x.com   | Cliente | ✅    | ✏️ 🚫 │
│ Maria   | maria@x.com  | Lojista | ✅    | ✏️ 🚫 │
│ Pedro   | pedro@x.com  | CEO     | ✅    | ✏️ 🚫 │
│ Ana     | ana@x.com    | Motoboy | 🚫    | ✏️ ✅ │
│ Carlos  | carlos@x.com | Lojista | ✅    | ✏️ 🚫 │
│ ...     | ...          | ...     | ...   | ...    │
│                                                    │
└────────────────────────────────────────────────────┘
```

---

### FASE 5: EDITANDO UM USUÁRIO

**Clica em: "✏️ Editar" (linha de um usuário)**

```
┌───────────────────────────────────────────┐
│ Editar Role de João (joao@x.com)         │
├───────────────────────────────────────────┤
│                                           │
│  Role Atual: 👤 Cliente                  │
│                                           │
│  Novo Role:                               │
│  ┌─────────────────────────────────────┐ │
│  │ Selecionar novo role...           ▼ │ │
│  │ 👤 Cliente                          │ │
│  │ 🏪 Lojista                          │ │
│  │ 👑 CEO                              │ │
│  │ 🏍️ Motoboy                          │ │
│  │ 📢 Marketing                        │ │
│  └─────────────────────────────────────┘ │
│                                           │
│  [❌ Cancelar]  [✅ Salvar]              │
│                                           │
└───────────────────────────────────────────┘
```

**Exemplo: Transformar Cliente em Lojista**

```
1. Clica em dropdown "Selecionar novo role..."
2. Vê lista com 9 opções:
   - 👤 Cliente
   - 🏪 Lojista     ← CLICA AQUI
   - 👑 CEO
   - Etc...
3. Dropdown agora mostra "🏪 Lojista"
4. Clica "✅ Salvar"
5. Sistema processa:
   ├─ Validação: Email existe?
   ├─ Permissões: Pode fazer essa mudança?
   ├─ Atualização: role = "lojista"
   └─ Resposta: "✅ Role atualizado com sucesso!"
6. Volta para tabela
7. Linha agora mostra "🏪 Lojista" no campo Role
```

---

### FASE 6: ABRINDO PAINEL DE CONFIGURAÇÕES

**Clica em: "⚙️ Configurações"**

**URL**: `http://localhost:3000/admin/settings`

```
┌──────────────────────────────────────────────────┐
│  ⚙️ Configurações do Sistema                     │
├──────────────────────────────────────────────────┤
│                                                  │
│  💰 Comissões        │  🏍️ Ganhos Motoboy      │
│  ────────────────    │  ───────────────        │
│                      │                         │
│  📦 Plano 1:  15% ─► │  💵 Base: R$ 7.00 ──► │
│  Loja recebe: 85%    │  Ganho 10km = R$17    │
│                      │                         │
│  📦 Plano 2:  20% ─► │  📏 KM: R$ 1.00/km ─► │
│  Loja recebe: 80%    │  Nova taxa: R$1.20/km│
│                      │                         │
│  📦 Plano 3:  30% ─► │  💳 Min Saque: R$50  │
│  Loja recebe: 70%    │                         │
│                      │                         │
├──────────────────────────────────────────────────┤
│                                                  │
│  📊 Exemplo (R$ 100)                            │
│  Plano 1: Loja R$85  | Plano 2: Loja R$80    │
│  Plano 3: Loja R$70                            │
│                                                  │
├──────────────────────────────────────────────────┤
│  [Cancelar]  [✅ Salvar Configurações]          │
└──────────────────────────────────────────────────┘
```

**Exemplo: Aumentar Comissão de Plano 1**

```
1. Campo "📦 Plano 1" mostra: 15
2. CEO muda para: 18
3. Simulação atualiza automática:
   └─ Loja recebe: 82% (antes era 85%)
4. CEO clica "✅ Salvar"
5. Backend processa:
   ├─ Validação: Valor entre 0-100?
   ├─ Salvamento: commission_plan1 = 18
   └─ Resposta: "✅ Configurações salvas!"
6. Página volta ao normal
7. Próximos pedidos usam 18% de comissão
   (Pedidos antigos continuam com 15%)
```

---

## 🔄 FLUXO COMPLETO: Um Exemplo Real

### Situação: CEO quer transformar cliente em lojista

```
1️⃣ CEO faz login
   └─ http://localhost:3000/login
   └─ Email: ceo@admin.com
   └─ Senha: CEO@12345Admin
   └─ Clica "ENTRAR"

2️⃣ Sistema valida credenciais
   └─ Backend: POST /login
   └─ Validação: Email + Senha corretos?
   └─ Resposta: { token: "xyz...", user: {...} }

3️⃣ Frontend armazena token
   └─ localStorage.setItem("token", "xyz...")
   └─ useAuth hook atualiza

4️⃣ CEO redireciona para dashboard
   └─ http://localhost:3000/dashboard
   └─ Vê menu com opções

5️⃣ CEO clica "👥 Gerenciar Usuários"
   └─ http://localhost:3000/admin/users
   └─ Frontend: GET /admin/users
   └─ Backend retorna lista de usuários

6️⃣ CEO procura "João Silva"
   └─ Digita "joão" na busca
   └─ Tabela filtra em tempo real
   └─ Mostra: João Silva | joao@email.com | Cliente

7️⃣ CEO clica "✏️ Editar"
   └─ Modal abre com dropdown de roles

8️⃣ CEO seleciona "🏪 Lojista"
   └─ Dropdown atualizado

9️⃣ CEO clica "✅ Salvar"
   └─ Frontend: PUT /admin/users/{id}/role
   └─ Body: { role: "lojista" }
   └─ Backend valida e salva

🔟 Sucesso!
   └─ Resposta: "✅ Role atualizado com sucesso!"
   └─ Modal fecha
   └─ Tabela atualiza
   └─ João agora é "🏪 Lojista"

1️⃣1️⃣ João faz login normalmente
    └─ Acessa /seller/dashboard
    └─ Vê painel de lojista

1️⃣2️⃣ João cria loja, adiciona produtos
    └─ Começa a receber pedidos
    └─ Ganha comissão conforme vende
```

---

## 🎨 Resumo Visual dos Painéis

### CEO Access Map

```
LOGIN
  ↓
CEO@12345Admin
  ↓
/dashboard (KPIs)
  ├─ /admin/users (Editar roles)
  ├─ /admin/stores (Gerenciar lojas)
  ├─ /admin/motoboys (Gerenciar motoboys)
  ├─ /admin/settings (Editar taxas)
  ├─ /wallet (Ver saldo CEO)
  └─ /admin/financials (Dashboard financeiro)
```

### Admin Access Map

```
LOGIN
  ↓
Admin@12345Admin
  ↓
/admin/users (Editar roles)
  ├─ /admin/stores (Editar stores)
  ├─ /admin/motoboys (Editar motoboys)
  └─ /admin/support (Gerenciar tickets)
```

### Financeiro Access Map

```
LOGIN
  ↓
Financeiro@12345Admin
  ↓
/admin/financials
  ├─ /admin/wallets (Ver wallets)
  ├─ /admin/payouts (Gerenciar saques)
  └─ /admin/reports (Exportar relatórios)
```

---

## ✅ Checklist de Fluxo

```
□ Backend rodando em http://localhost:4000
□ Frontend rodando em http://localhost:3000
□ MongoDB rodando
□ Usuários importados (CEO, Admin, etc)
□ Consegue abrir /login
□ Consegue fazer login com ceo@admin.com + CEO@12345Admin
□ Consegue acessar /admin/users
□ Consegue editar um usuário (mudar role)
□ Consegue acessar /admin/settings
□ Consegue editar configurações (taxas)
□ Consegue salvar mudanças
```

---

## 🆘 Troubleshooting

| Erro | Solução |
|------|---------|
| "Credenciais inválidas" | Verifique email/senha. Rode ADMIN_SEED_MANUAL.md |
| "Acesso Negado" ao abrir /admin/users | Verifique seu role. CEO pode entrar |
| "Erro ao salvar" | Verifique se backend está rodando |
| Tabela não carrega | Atualize a página (F5) |
| Mudança não aparece | Recarregue (F5) para sincronizar |

---

**Pronto!** Agora você tem a visão completa do fluxo. 🚀

