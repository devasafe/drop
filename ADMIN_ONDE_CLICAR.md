# 👆 ONDE CLICAR - GUIA VISUAL PRÁTICO

**Objetivo**: Mostrar EXATAMENTE onde clicar para fazer tudo funcionar

---

## 🎯 PASSO 1: CRIAR CONTAS ADMIN

### Onde?
```
Terminal → Command Prompt / PowerShell
```

### O que digitar?
```bash
npm run seed:roles
```

### O que esperar?
```
✅ Role criada: CEO
✅ Role criada: MARKETING
✅ Role criada: ADMIN
✅ Role criada: FINANCEIRO
✅ Role criada: SUPORTE
🎉 Seed de roles concluído!
```

---

## 🎯 PASSO 2: ABRIR NAVEGADOR

### Onde?
```
Navegador (Chrome, Firefox, Edge, etc)
```

### Digitar na URL?
```
http://localhost:3000/login
```

### O que você vê?
```
┌─────────────────────────────┐
│   🔐 LOGIN                  │
├─────────────────────────────┤
│                             │
│  Email:  ____________       │
│  Senha:  ____________       │
│                             │
│  [Lembrar de mim]           │
│                             │
│        [ENTRAR]             │
│                             │
│  Não tem conta? [Cadastre]  │
│                             │
└─────────────────────────────┘
```

---

## 🎯 PASSO 3: FAZER LOGIN COMO CEO

### Campo Email
```
Clique no campo "Email:"
Digite: ceo@admin.com
```

### Campo Senha
```
Clique no campo "Senha:"
Digite: CEO@12345Admin
```

### Botão Entrar
```
Clique em [ENTRAR]
```

### O que esperar?
```
⏳ Conectando...
✅ Redirecionamento para dashboard
✅ Você vê menu com opções
```

---

## 🎯 PASSO 4: ACESSAR PAINEL DE USUÁRIOS

### No Menu Principal
```
Você vê algo como:
├─ 📊 Dashboard
├─ 👥 Gerenciar Usuários  ← CLIQUE AQUI
├─ ⚙️ Configurações
├─ 💰 Finanças
└─ 🚪 Sair
```

### Ou Digite na URL
```
http://localhost:3000/admin/users
```

### O que você vê?
```
┌────────────────────────────────────────┐
│ 👥 Gerenciar Usuários                  │
├────────────────────────────────────────┤
│ 🔍 Buscar... | 📋 Todos os Roles      │
├────────────────────────────────────────┤
│ Nome | Email | Role | Status | Ações  │
├────────────────────────────────────────┤
│ João | j@x   | Cli. | ✅   | ✏️ 🚫   │
│ Maria| m@x   | Loj. | ✅   | ✏️ 🚫   │
│ ...  | ...   | ...  | ...  | ...     │
└────────────────────────────────────────┘
```

---

## 🎯 PASSO 5: EDITAR UM USUÁRIO

### Procurar o usuário
```
1. Clique na busca: 🔍 Buscar...
2. Digite: joão (ou qualquer nome)
3. Tabela filtra automaticamente
```

### Clicar em Editar
```
Você vê uma linha como:
João | joao@email.com | Cliente | ✅ | [✏️ Editar] [🚫 Bloquear]

Clique em: ✏️ EDITAR
```

### O que aparece?
```
Abre um modal:
┌─────────────────────────────┐
│ Editar Role                 │
├─────────────────────────────┤
│                             │
│ Novo Role:                  │
│ ┌─────────────────────────┐ │
│ │ Selecionar novo role▼  │ │
│ │ - Cliente               │ │
│ │ - Lojista        ← AQUI │ │
│ │ - CEO                   │ │
│ │ - Motoboy               │ │
│ │ - Marketing             │ │
│ └─────────────────────────┘ │
│                             │
│ [❌ Cancelar] [✅ Salvar]  │
│                             │
└─────────────────────────────┘
```

### Selecionar novo Role
```
1. Clique no dropdown "Selecionar novo role▼"
2. Abre lista com 9 opções
3. Clique em "🏪 Lojista" (exemplo)
```

### Clicar em Salvar
```
Clique em: ✅ SALVAR
```

### O que esperar?
```
✅ Sucesso: "Role atualizado com sucesso!"
Modal fecha automaticamente
Tabela mostra: João agora é "🏪 Lojista"
```

---

## 🎯 PASSO 6: EDITAR CONFIGURAÇÕES

### Clicar em Configurações
```
Menu Principal:
├─ 📊 Dashboard
├─ 👥 Gerenciar Usuários
├─ ⚙️ Configurações  ← CLIQUE AQUI
├─ 💰 Finanças
└─ 🚪 Sair

OU digite na URL:
http://localhost:3000/admin/settings
```

### O que você vê?
```
┌──────────────────────────────────────┐
│ ⚙️ Configurações do Sistema           │
├──────────────────────────────────────┤
│                                      │
│ 💰 COMISSÕES    │  🏍️ GANHO MOTOBOY│
│ ───────────────────────────────────  │
│ Plano 1: [15]% │  Base: [7] R$      │
│ Plano 2: [20]% │  KM:   [1] R$/km  │
│ Plano 3: [30]% │  Mín:  [50] R$    │
│                │                    │
│ [Cancelar] [✅ Salvar]              │
│                                      │
└──────────────────────────────────────┘
```

---

## 🎯 PASSO 7: ALTERAR UMA COMISSÃO

### Clicar no campo Plano 1
```
Você vê:
Plano 1: [15]%

Clique no campo [15]
```

### Digitar novo valor
```
1. Campo agora tem foco (azul)
2. Selecione todo o texto (Ctrl+A)
3. Digite: 18
4. Pressione Tab (sai do campo)
```

### Ver simulação atualizar
```
Depois que saiu do campo:
Loja recebe: 82% (era 85%)
Atualiza automaticamente!
```

### Clicar em Salvar
```
Clique em: ✅ SALVAR CONFIGURAÇÕES
```

### O que esperar?
```
✅ Sucesso: "Configurações salvas com sucesso!"
Próximos pedidos usam 18% (não 15%)
Pedidos antigos continuam com 15%
```

---

## 🎯 PASSO 8: BLOQUEAR UM USUÁRIO

### Voltar para /admin/users
```
Clique em: 👥 Gerenciar Usuários
OU digite: http://localhost:3000/admin/users
```

### Procurar o usuário
```
Clique na busca: 🔍 Buscar...
Digite: (nome do usuário)
```

### Clicar em Bloquear
```
Você vê uma linha:
João | joao@x | Cliente | ✅ | [✏️] [🚫 Bloquear]

Clique em: 🚫 BLOQUEAR
```

### Confirmação
```
Modal pergunta:
"Tem certeza que quer bloquear João?"

Clique em: ✅ SIM, BLOQUEAR
```

### O que esperar?
```
✅ Sucesso: "Usuário bloqueado!"
Status muda de ✅ para 🚫
Botão agora mostra ✅ DESBLOQUEAR
João não consegue mais fazer login
```

---

## 🎯 PASSO 9: DESBLOQUEAR UM USUÁRIO

### Clicar em Desbloquear
```
Você vê um usuário com status 🚫 (bloqueado)
Botão mostra: ✅ DESBLOQUEAR

Clique nele
```

### Confirmação
```
Modal pergunta:
"Desbloquear João?"

Clique em: ✅ SIM, DESBLOQUEAR
```

### O que esperar?
```
✅ Sucesso: "Usuário desbloqueado!"
Status muda de 🚫 para ✅
Botão volta a mostrar 🚫 BLOQUEAR
João consegue fazer login novamente
```

---

## 📱 MENU COMPLETO (O que você vai ver)

### Após fazer login como CEO

```
┌─────────────────────────────────┐
│ 👋 Bem-vindo, CEO! [Sair] [👤] │
├─────────────────────────────────┤
│                                 │
│ 📊 Dashboard                    │
│ 👥 Gerenciar Usuários           │
│ 🏪 Gerenciar Lojas              │
│ 🏍️ Gerenciar Motoboys           │
│ ⚙️ Configurações                │
│ 💰 Finanças                     │
│ 🎫 Suporte                      │
│ 🚪 Sair                         │
│                                 │
└─────────────────────────────────┘
```

---

## 🎨 RESUMO VISUAL

```
VOCÊ AQUI
    ↓
TERMINAL: npm run seed:roles
    ↓
✅ 5 contas criadas
    ↓
NAVEGADOR: http://localhost:3000/login
    ↓
PREENCHE: ceo@admin.com + CEO@12345Admin
    ↓
CLICA: [ENTRAR]
    ↓
VOCÊ VÊ: Menu com opções
    ↓
CLICA: 👥 Gerenciar Usuários
    ↓
VOCÊ VÊ: Tabela com usuários
    ↓
CLICA: ✏️ Editar (na linha de um usuário)
    ↓
VOCÊ VÊ: Modal para escolher novo role
    ↓
SELECIONA: 🏪 Lojista (exemplo)
    ↓
CLICA: ✅ Salvar
    ↓
✅ SUCESSO! Usuário é agora lojista!
```

---

## ⌨️ ATALHOS (Opcional)

```
TECLADO:
├─ Tab: Vai para próximo campo
├─ Shift+Tab: Volta para campo anterior
├─ Enter: Submete formulário
├─ Esc: Fecha modal
├─ Ctrl+A: Seleciona tudo
└─ Ctrl+C: Copia

NAVEGADOR:
├─ F5: Atualiza página
├─ Ctrl+Shift+Del: Limpa cache
├─ F12: Abre Developer Tools
└─ Ctrl+Shift+J: Abre Console
```

---

## 🎯 CHECKLIST PRÁTICO

```
□ Abri terminal
□ Digitei: npm run seed:roles
□ Esperei: 5-10 segundos
□ Vi mensagem: ✅ Role criada
□ Abri navegador: http://localhost:3000/login
□ Preenchi email: ceo@admin.com
□ Preenchi senha: CEO@12345Admin
□ Cliquei: [ENTRAR]
□ Vi menu com opções
□ Cliquei: 👥 Gerenciar Usuários
□ Vi tabela de usuários
□ Procurei um usuário
□ Cliquei: ✏️ Editar
□ Selecionei novo role
□ Cliquei: ✅ Salvar
□ Vi sucesso: "Role atualizado com sucesso!"
```

---

## 🆘 SE ALGO ERRAR

### Erro: "Comando não encontrado"
```
Solução:
1. Verifique se está na pasta correta
   cd d:/PROJETOS/Drop
2. Tente novamente
   npm run seed:roles
```

### Erro: "Acesso Negado" ao abrir painel
```
Solução:
1. Verifique se fez login
2. Verifique o email (é ceo@admin.com?)
3. Tente F5 (atualizar página)
4. Tente logout/login novamente
```

### Erro: "Usuário não encontrado" (login)
```
Solução:
1. Rode novamente: npm run seed:roles
2. Verifique email exato: ceo@admin.com
3. Verifique senha (diferencia maiúsculas)
4. Verifique se MongoDB está rodando
```

### Painel não carrega
```
Solução:
1. F5 (atualizar)
2. Ctrl+Shift+Del (limpar cache)
3. Feche abas
4. Logout/Login
5. Tente novamente
```

---

## ✅ RESULTADO FINAL

Após seguir todos os passos você consegue:

```
✅ Fazer login como CEO
✅ Editar usuários (cliente → lojista)
✅ Bloquear/Desbloquear usuários
✅ Alterar taxas de comissão
✅ Editar ganho de motoboys
✅ Salvar todas as mudanças
✅ Gerenciar a plataforma INTEIRA!
```

---

## 🎉 PRONTO!

Você agora sabe:
- ONDE clicar
- O QUE digitar
- O QUE esperar
- COMO corrigir erros

**Bora começar!** 🚀

```bash
npm run seed:roles
```

