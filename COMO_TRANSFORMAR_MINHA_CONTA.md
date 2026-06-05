# 🔄 COMO TRANSFORMAR SUA CONTA - GUIA PRÁTICO

**Objetivo**: Mudar seu tipo de conta (Cliente → Lojista, etc)

**Tempo**: 5 minutos

---

## 📋 OPÇÃO 1: Você É CEO (Mais Fácil)

Se você **já é CEO**, pode mudar sua própria conta assim:

### Passo 1: Fazer Login como CEO
```
URL: http://localhost:3000/login

Email: ceo@admin.com
Senha: CEO@12345Admin

Clique: [ENTRAR]
```

### Passo 2: Abrir Painel de Usuários
```
Menu Principal:
├─ 📊 Dashboard
├─ 👥 Gerenciar Usuários  ← CLIQUE AQUI
├─ ⚙️ Configurações
└─ 🚪 Sair

OU Digite na URL:
http://localhost:3000/admin/users
```

### Passo 3: Procurar Você Mesmo
```
Campo Busca: 🔍 Buscar por nome ou email...

Digite: seu_nome ou seu_email

Tabela filtra e mostra sua linha
```

### Passo 4: Clicar em Editar
```
Na sua linha, clique em: ✏️ EDITAR

Abre um modal com dropdown de roles
```

### Passo 5: Selecionar Novo Role
```
Dropdown mostra:
├─ 👤 Cliente
├─ 🏪 Lojista        ← SELECIONE AQUI (exemplo)
├─ 👑 CEO
├─ 🏍️ Motoboy
├─ 📢 Marketing
└─ Etc...

Clique em: 🏪 LOJISTA
```

### Passo 6: Salvar
```
Modal mostra:
┌───────────────────────────┐
│ Novo Role: 🏪 Lojista     │
│                           │
│ [❌ Cancelar] [✅ Salvar] │
└───────────────────────────┘

Clique em: ✅ SALVAR
```

### Passo 7: Sucesso!
```
✅ Mensagem: "Role atualizado com sucesso!"

Modal fecha automaticamente

Tabela agora mostra:
Seu Nome | seu@email | 🏪 Lojista | ✅ Ativo
```

---

## 📋 OPÇÃO 2: Você É Cliente Normal (Pedir para CEO)

Se você **não é CEO** ainda, siga assim:

### Passo 1: Tomar Nota do Seu Email
```
Qual seu email na plataforma?
Exemplo: joao@email.com
```

### Passo 2: Avisar um CEO
```
Envie mensagem para o CEO:
"Olá, quero virar lojista. 
Meu email é: joao@email.com"
```

### Passo 3: CEO Faz o Seguinte
```
Login como CEO
├─ Email: ceo@admin.com
├─ Senha: CEO@12345Admin
└─ Clique [ENTRAR]

Abra: http://localhost:3000/admin/users

Procure por: joao@email.com

Clique: ✏️ EDITAR

Selecione: 🏪 LOJISTA

Clique: ✅ SALVAR

✅ Feito! Você é lojista agora!
```

### Passo 4: Você Faz Login de Novo
```
Logout da sua conta atual

Faça login novamente com seu email

Agora você é: 🏪 LOJISTA
├─ Acesso a /seller/dashboard
├─ Pode criar loja
├─ Pode adicionar produtos
└─ Pode receber pedidos!
```

---

## 🎯 TRANSFORMAÇÕES POSSÍVEIS

### De Cliente Para Lojista
```
1. CEO abre /admin/users
2. Procura você (cliente)
3. Clica "✏️ Editar"
4. Seleciona "🏪 Lojista"
5. Clica "✅ Salvar"

Resultado:
└─ Você vira lojista!
   ├─ Acesso a /seller/dashboard
   ├─ Pode vender
   └─ Ganha comissão
```

### De Cliente Para Motoboy
```
1. CEO abre /admin/users
2. Procura você (cliente)
3. Clica "✏️ Editar"
4. Seleciona "🏍️ Motoboy"
5. Clica "✅ Salvar"

Resultado:
└─ Você vira motoboy!
   ├─ Acesso a /motoboy/dashboard
   ├─ Pode aceitar entregas
   └─ Ganha por entrega
```

### De Cliente Para CEO
```
1. Outro CEO abre /admin/users
2. Procura você (cliente)
3. Clica "✏️ Editar"
4. Seleciona "👑 CEO"
5. Clica "✅ Salvar"

Resultado:
└─ Você vira CEO!
   ├─ Acesso total a /admin/users
   ├─ Acesso a /admin/settings
   ├─ Acesso a /admin/dashboard
   └─ Pode gerenciar tudo
```

---

## 📱 INTERFACE VISUAL

### Tela de Login
```
┌────────────────────────────┐
│   🔐 LOGIN                 │
├────────────────────────────┤
│                            │
│  Email:    ceo@admin.com   │
│  Senha:    [••••••••]      │
│                            │
│  [Lembrar de mim]          │
│                            │
│       [ENTRAR]             │
│                            │
└────────────────────────────┘
```

### Painel de Usuários
```
┌────────────────────────────────────────────────────┐
│  👥 Gerenciar Usuários                             │
├────────────────────────────────────────────────────┤
│  🔍 Buscar...        │  📋 Todos os Roles         │
├────────────────────────────────────────────────────┤
│ Nome    | Email      | Role    | Status | Ações   │
├────────────────────────────────────────────────────┤
│ João    | j@email.com | Cliente | ✅   | ✏️ 🚫  │  ← SUA LINHA
│ Maria   | m@email.com | Lojista | ✅   | ✏️ 🚫  │
│ Pedro   | p@email.com | CEO     | ✅   | ✏️ 🚫  │
└────────────────────────────────────────────────────┘
```

### Modal de Edição
```
┌─────────────────────────────────────┐
│  Editar Role de João                │
├─────────────────────────────────────┤
│                                     │
│  Role Atual: 👤 Cliente             │
│                                     │
│  Novo Role:                         │
│  ┌───────────────────────────────┐  │
│  │ Selecionar novo role...      ▼│  │
│  │ 👤 Cliente                    │  │
│  │ 🏪 Lojista         ← AQUI     │  │
│  │ 🏍️ Motoboy                    │  │
│  │ 👑 CEO                        │  │
│  │ 📢 Marketing                  │  │
│  └───────────────────────────────┘  │
│                                     │
│  [❌ Cancelar]  [✅ Salvar]        │
│                                     │
└─────────────────────────────────────┘
```

---

## ✅ CHECKLIST

```
□ Identifiquei meu email
□ Avisei para um CEO (se não sou CEO)
□ CEO fez login como ceo@admin.com
□ CEO abriu /admin/users
□ CEO procurou meu email
□ CEO clicou "✏️ Editar"
□ CEO selecionou novo role
□ CEO clicou "✅ Salvar"
□ Recebi mensagem: "Role atualizado com sucesso!"
□ Fiz logout
□ Fiz login novamente
□ Tenho novo role agora!
```

---

## 🎉 DEPOIS DE TRANSFORMAR

### Se Virou Lojista
```
Novo dashboard: /seller/dashboard
├─ Criar loja
├─ Adicionar produtos
├─ Receber pedidos
├─ Ver saldo
└─ Gerenciar vendas
```

### Se Virou Motoboy
```
Novo dashboard: /motoboy/dashboard
├─ Aceitar entregas
├─ Ver ganhos
├─ Ver benefícios
├─ Sacar dinheiro
└─ Histórico de entregas
```

### Se Virou CEO
```
Novo dashboard: /admin/dashboard
├─ Gerenciar usuários
├─ Gerenciar lojas
├─ Gerenciar motoboys
├─ Editar configurações
└─ Ver finanças
```

---

## 🆘 ERROS COMUNS

### "Não consegui editar minha conta"

**Problema**: Você não é CEO

**Solução**: 
```
1. Avise a um CEO seu email
2. Peça para ele editar sua conta
3. Aguarde a mudança
```

---

### "Editei mas não mudou"

**Problema**: Cache do navegador

**Solução**:
```
1. Saia (logout)
2. Limpe cache: Ctrl+Shift+Del
3. Feche o navegador
4. Abra novamente
5. Faça login
6. Confira seu novo role
```

---

### "Não acho meu email na lista"

**Problema**: Email errado ou não está registrado

**Solução**:
```
1. Verifique seu email correto
2. Use Ctrl+F para buscar na página
3. Se não encontrar, registre uma nova conta
```

---

## 💡 DICAS

```
✓ Você pode mudar de role quantas vezes quiser
✓ Histórico é mantido
✓ Dados antigos não são perdidos
✓ Se virou lojista, ainda pode ser cliente também
✓ CEO pode editar QUALQUER conta
```

---

## 📞 RESUMO RÁPIDO

```
EU SOU         QUERO VIRAR       COMO FAZER
═══════════════════════════════════════════════════════════
Cliente        Lojista          → Peça para CEO editar
Cliente        Motoboy          → Peça para CEO editar
Cliente        CEO              → Peça para CEO editar
CEO            Qualquer coisa   → Edite você mesmo em /admin/users
```

---

**Pronto!** Agora você sabe como transformar sua conta! 🎉

Se ainda tiver dúvidas, abra:
- `ADMIN_ONDE_CLICAR.md` (mostra onde clicar)
- `ADMIN_FLUXO_COMPLETO.md` (mostra fluxo visual)

