# 👑 GUIA DE ACESSO ADMIN - SISTEMA DE ROLES E PAINÉIS

**Data**: 28/02/2026  
**Versão**: 1.0.0  
**Status**: ✅ PRONTO

---

## 📋 Índice Rápido

1. [Como Criar Contas Admin](#como-criar-contas-admin)
2. [Roles e Permissões](#roles-e-permissões)
3. [Painéis de Edição](#painéis-de-edição)
4. [Como Fazer Login](#como-fazer-login)
5. [Fluxo Completo](#fluxo-completo)
6. [Troubleshooting](#troubleshooting)

---

## 🔐 Como Criar Contas Admin

### Opção 1: Script Automático (RECOMENDADO)

```bash
cd d:/PROJETOS/Drop
npm run seed:roles
```

Isso vai criar **5 contas de admin** automaticamente:

| Role | Email | Senha | Acesso |
|------|-------|-------|--------|
| 👑 CEO | ceo@admin.com | CEO@12345Admin | ✅ TUDO |
| 📢 Marketing | marketing@admin.com | Marketing@12345Admin | 📊 Promoções + Analytics |
| ⚙️ Admin | admin@admin.com | Admin@12345Admin | 👥 Usuários + Lojas + Motoboys |
| 💰 Financeiro | financeiro@admin.com | Financeiro@12345Admin | 💵 Finanças + Wallets |
| 🎧 Suporte | suporte@admin.com | Suporte@12345Admin | 🎫 Tickets + Pedidos |

### Opção 2: Criar Manualmente no MongoDB

```bash
db.users.insertOne({
  name: "CEO",
  email: "seu_email@admin.com",
  password: "senha_hash_aqui",
  role: "ceo",
  permissions: ["view_all", "edit_all", "delete_all", "manage_users"],
  status: "active",
  isAdmin: true,
  createdAt: new Date()
})
```

---

## 👤 Roles e Permissões

### 1. 👑 CEO (Acesso Total)

```
✅ Visualizar tudo
✅ Editar tudo
✅ Deletar tudo
✅ Gerenciar usuários
✅ Gerenciar roles
✅ Ver finanças
✅ Alterar taxas do sistema
```

**Painéis Disponíveis**:
- `/admin/dashboard` - Dashboard Principal
- `/admin/users` - Gerenciar Usuários
- `/admin/stores` - Gerenciar Lojas
- `/admin/motoboys` - Gerenciar Motoboys
- `/admin/settings` - Configurações do Sistema

---

### 2. 📢 MARKETING

```
✅ Visualizar tudo
✅ Editar promoções
✅ Ver finanças
✅ Gerenciar campanhas
❌ Não pode alterar roles
❌ Não pode deletar usuários
```

**Painéis Disponíveis**:
- `/admin/campaigns` - Gerenciar Campanhas
- `/admin/promotions` - Gerenciar Promoções
- `/admin/analytics` - Ver Analytics

---

### 3. ⚙️ ADMIN (Suporte Avançado)

```
✅ Visualizar tudo
✅ Editar usuários
✅ Editar lojas
✅ Editar motoboys
✅ Gerenciar suporte
❌ Não pode alterar taxas
❌ Não pode deletar
```

**Painéis Disponíveis**:
- `/admin/users` - Gerenciar Usuários
- `/admin/stores` - Gerenciar Lojas
- `/admin/motoboys` - Gerenciar Motoboys
- `/admin/support` - Gerenciar Tickets

---

### 4. 💰 FINANCEIRO

```
✅ Ver finanças
✅ Ver wallets
✅ Exportar relatórios
✅ Gerenciar pagamentos
❌ Não pode editar usuários
❌ Não pode alterar dados
```

**Painéis Disponíveis**:
- `/admin/financials` - Dashboard Financeiro
- `/admin/wallets` - Gerenciar Wallets
- `/admin/payouts` - Gerenciar Pagamentos

---

### 5. 🎧 SUPORTE

```
✅ Visualizar usuários
✅ Visualizar pedidos
✅ Responder tickets
✅ Ver relatórios
❌ Não pode editar
❌ Não pode deletar
```

**Painéis Disponíveis**:
- `/admin/support` - Gerenciar Tickets
- `/admin/orders` - Ver Pedidos
- `/admin/reports` - Ver Relatórios

---

## 🎯 Painéis de Edição

### 1. Painel de Usuários (`/admin/users`)

**O que você pode fazer:**

✅ Listar todos os usuários  
✅ Buscar por nome ou email  
✅ Filtrar por role  
✅ Editar role de um usuário  
✅ Bloquear/Desbloquear conta  

**Como Editar um Usuário:**

```
1. Abra /admin/users
2. Procure o usuário na tabela
3. Clique no botão "✏️ Editar"
4. Selecione o novo role
5. Clique "✅ Salvar"
6. Pronto! Role foi atualizado
```

**Exemplo Prático:**

```
Seu cliente quer vender na plataforma?
→ Abra /admin/users
→ Procure o cliente
→ Clique "Editar"
→ Selecione "🏪 Lojista"
→ Salve

Agora ele pode:
- Criar loja
- Adicionar produtos
- Receber pedidos
```

---

### 2. Painel de Configurações (`/admin/settings`)

**O que você pode editar:**

#### 💰 Comissões por Plano

```
Plano 1 (Marketplace Only):
├─ Comissão padrão: 15%
└─ Loja recebe: 85%

Plano 2 (Marketplace + Motoboys):
├─ Comissão padrão: 20%
└─ Loja recebe: 80%

Plano 3 (Premium):
├─ Comissão padrão: 30%
└─ Loja recebe: 70%
```

#### 🏍️ Ganhos Motoboy

```
Ganho Base: R$ 7,00 (por entrega)
Taxa KM: R$ 1,00 (por km)

Exemplo:
├─ Entrega 10km = R$ 7 + (R$ 1 × 10) = R$ 17
├─ Entrega 15km = R$ 7 + (R$ 1 × 15) = R$ 22
└─ Entrega 20km = R$ 7 + (R$ 1 × 20) = R$ 27
```

#### 💳 Limites de Saque

```
Saque Mínimo: R$ 50
Saque Máximo: R$ 10.000
```

**Como Editar Configurações:**

```
1. Abra /admin/settings
2. Mude os valores nos campos
3. Veja a simulação de distribuição
4. Clique "✅ Salvar Configurações"
5. Alterações valem para TODOS os pedidos futuros
```

---

### 3. Painel de Lojas (`/admin/stores`) - *Em Desenvolvimento*

**Planejado para:**

✅ Listar lojas  
✅ Editar plano (1, 2, 3)  
✅ Editar taxa de comissão custom  
✅ Ativar/Desativar loja  
✅ Ver saldo atual  
✅ Ver histórico de vendas  

---

### 4. Painel de Motoboys (`/admin/motoboys`) - *Em Desenvolvimento*

**Planejado para:**

✅ Listar motoboys  
✅ Ver status  
✅ Editar benefícios  
✅ Dar entregas grátis  
✅ Ver ganhos  
✅ Bloquear/Desbloquear  

---

## 🚀 Como Fazer Login

### Passo 1: Iniciar Frontend

```bash
cd d:/PROJETOS/Drop/frontend
npm run dev
```

Acesso: `http://localhost:3000`

### Passo 2: Clicar em "Entrar" ou "Login"

![Tela inicial]

### Passo 3: Preencher Email e Senha

**Exemplo para CEO:**

```
Email: ceo@admin.com
Senha: CEO@12345Admin
[ENTRAR]
```

### Passo 4: Acessar Painel Admin

Após login, você verá um menu com opções:

```
┌─────────────────────────────────┐
│  👋 Bem-vindo, CEO!             │
├─────────────────────────────────┤
│ 📊 Dashboard                    │
│ 👥 Gerenciar Usuários           │
│ 🏪 Gerenciar Lojas              │
│ 🏍️ Gerenciar Motoboys           │
│ ⚙️ Configurações                │
│ 💰 Finanças                     │
│ 🚪 Sair                         │
└─────────────────────────────────┘
```

### Passo 5: Clique no Painel Desejado

```
Exemplo: Clique em "👥 Gerenciar Usuários"
→ Abre http://localhost:3000/admin/users
→ Mostra tabela com todos os usuários
```

---

## 🔄 Fluxo Completo

### Cenário: Transformar Cliente em Lojista

```
1. CEO faz login
   └─ Email: ceo@admin.com
   └─ Senha: CEO@12345Admin

2. Clica em "👥 Gerenciar Usuários"
   └─ Abre /admin/users

3. Procura o cliente
   └─ Nome: "João Silva"
   └─ Email: "joao@email.com"

4. Clica "✏️ Editar"
   └─ Abre dropdown de roles

5. Seleciona "🏪 Lojista"
   └─ Dropdown mostra opção selecionada

6. Clica "✅ Salvar"
   └─ Sistema atualiza
   └─ Sucesso: "✅ Role atualizado com sucesso!"

7. João agora é lojista!
   └─ Pode fazer login como lojista
   └─ Acessa /seller/dashboard
   └─ Cria sua loja
   └─ Adiciona produtos
   └─ Recebe pedidos
```

---

### Cenário: Alterar Taxa de Comissão

```
1. CEO abre /admin/settings

2. Encontra "📦 Plano 1"
   └─ Campo mostra: 15%

3. Muda para 18%
   └─ Campo atualizado para 18
   └─ Simula automaticamente: Loja recebe 82%

4. Clica "✅ Salvar Configurações"
   └─ Sistema salva

5. Todos os NOVOS pedidos têm comissão de 18%
   └─ Pedidos antigos mantêm 15%
   └─ Histórico guardado

```

---

### Cenário: Bloquear Usuário Suspeito

```
1. Admin abre /admin/users

2. Procura usuário suspeito
   └─ Email: "suspeito@mail.com"

3. Clica "🚫 Bloquear"
   └─ Status muda de "✅ Ativo" para "🚫 Bloqueado"

4. Usuário NÃO pode mais fazer login
   └─ Tentativa de login: ❌ "Conta bloqueada"
   └─ Dados preservados
   └─ Pedidos visíveis

5. Para desbloquear:
   └─ Clica "✅ Desbloquear"
   └─ Usuário volta a funcionar
```

---

## 🆘 Troubleshooting

### ❌ "Acesso Negado" ao abrir painel

**Solução:**
```
1. Verifique seu role
   └─ Ir para: /wallet
   └─ Procurar seu email na table
   
2. Se role estiver errado:
   └─ Pedir para outro CEO editar seu role
   
3. Se ainda não funcionar:
   └─ Fazer logout e login novamente
   └─ Limpar cache do navegador (Ctrl+Shift+Del)
```

---

### ❌ "Usuário não encontrado" ao fazer login

**Solução:**
```
1. Verificar email está correto:
   └─ Não é caso-sensível: CEO@admin.com = ceo@admin.com
   
2. Verificar senha:
   └─ Senha diferencia maiúsculas/minúsculas
   └─ CEO@12345Admin ≠ ceo@12345admin
   
3. Rodar seed novamente:
   └─ npm run seed:roles
   └─ Recria todas as contas
   
4. Criar usuário manualmente no MongoDB:
   └─ Use MongoDB Compass
   └─ Insert novo documento em users collection
```

---

### ❌ "Erro ao salvar configurações"

**Solução:**
```
1. Verificar conexão com backend:
   └─ Backend deve estar rodando
   └─ npm run dev (na pasta root)
   
2. Verificar dados enviados:
   └─ Valores devem ser números
   └─ Percentual entre 0-100
   
3. Limpar cache:
   └─ F12 → Network → Desabilitar cache
   └─ Tentar novamente
```

---

### ❌ "Role não aparece na lista"

**Solução:**
```
1. Atualizar página:
   └─ F5 ou Ctrl+R
   
2. Limpar localStorage:
   └─ F12 → Application → localStorage
   └─ Delete tudo
   └─ Fazer login novamente
   
3. Verificar API:
   └─ GET /admin/users
   └─ Retorna usuários com roles?
```

---

## 📞 Suporte

Se tiver dúvidas:

1. **Verifique a documentação**:
   - `DOCUMENTACAO_INDEX.md` - Índice geral
   - `IMPLEMENTACAO_FINAL_BACKEND_FRONTEND.md` - Arquitetura

2. **Testes**:
   - `GUIA_TESTES_WALLETS.md` - Como testar

3. **Erro no terminal**?
   - Leia o erro completo
   - Procure em `TROUBLESHOOTING` ou docs

---

## ✅ Checklist de Setup

```
□ Backend rodando (npm run dev)
□ Frontend rodando (npm run dev)
□ Seed criado (npm run seed:roles)
□ Consegue fazer login como CEO
□ Consegue acessar /admin/users
□ Consegue editar um role
□ Consegue salvar configurações
□ Consegue bloquear um usuário
```

---

**Pronto para administrar a plataforma!** 🚀

