# 🚀 LOGIN CEO - Últimas Verificações

## ✅ Credenciais Confirmadas

```
Email: adm@adm
Senha: adm
Role: CEO (confirmado no MongoDB)
```

---

## 🎯 Checklist Antes de Fazer Login

### ✅ 1. Docker rodando?
```powershell
docker-compose ps
```

Deve mostrar:
```
mongo    mongod          Up
redis    redis           Up
```

**Se não estiver:**
```powershell
docker-compose up -d
```

---

### ✅ 2. Backend rodando?
```powershell
npm run dev
```

Deve mostrar:
```
✅ Express server running on http://localhost:4000
✅ MongoDB connected
```

**Se tiver erro, procure no log:**
- `SyntaxError` → Erro no código
- `Cannot find module` → Dependências faltando
- `ECONNREFUSED` → MongoDB não está rodando

---

### ✅ 3. Frontend rodando?
```powershell
cd D:\PROJETOS\Drop\frontend
npm run dev
```

Deve mostrar:
```
✅ ready - started server on 0.0.0.0:3000
```

---

## 🔐 Fazer Login

### URL:
```
http://localhost:3000/login
```

### Campos:
```
Email: adm@adm
Senha: adm
```

### Ações:
```
1. Preencha os campos
2. Clique em "Entrar"
3. Aguarde resposta
```

---

## ✅ Resultados Esperados

### ✅ Sucesso - Login Funcionou
```
URL muda para: http://localhost:3000/

Você vê a tela principal com opções como:
- 👛 Carteira
- 🏪 Loja
- 🏍️ Motoboy
- 👑 Admin
- etc.
```

### ❌ Erro 401 - Credenciais Inválidas
```
⚠️ Credenciais inválidas
📧 Email inválido ou senha incorreta
```

**Solução:**
- Verifique se escreveu exatamente: `adm@adm` e `adm`
- Sem espaços, sem maiúsculas

### ❌ Erro 500 - Problema no Backend
```
⚠️ Internal server error
POST :4000/api/auth/login → 500
```

**Solução:**
1. Abra o terminal onde `npm run dev` está rodando
2. Procure pela mensagem de erro
3. Compartilhe comigo a mensagem exata

### ❌ Erro de Conexão
```
Erro ao conectar em localhost:4000
```

**Solução:**
1. Certifique que backend está rodando: `npm run dev`
2. Certifique que está na pasta correta: `D:\PROJETOS\Drop`
3. Aguarde 5 segundos e tente novamente

---

## 🎯 Acessar Painéis CEO

**DEPOIS que fazer login com sucesso**, acesse:

### Painel de Usuários
```
http://localhost:3000/admin/users
```

Você deve ver:
```
┌─────────────────────────────────────────┐
│ 👥 Gerenciar Usuários                  │
├─────────────────────────────────────────┤
│ Total: X usuários | Filtrados: X       │
├─────────────────────────────────────────┤
│ 🔍 Buscar por nome ou email...          │
│ 📋 Todos os Roles                       │
├─────────────────────────────────────────┤
│ TABELA DE USUÁRIOS                      │
│ Nome | Email | Role | Status | Ações   │
│ ...                                     │
└─────────────────────────────────────────┘
```

### Painel de Configurações
```
http://localhost:3000/admin/settings
```

Você deve ver:
```
⚙️ Configurações do Sistema
├─ Comissões por Plano
│  ├─ Plano 1: 15%
│  ├─ Plano 2: 20%
│  └─ Plano 3: 30%
├─ Ganho Motoboy
│  ├─ Base: R$ 7
│  └─ Por km: R$ 1
└─ Limites de Saque
   ├─ Mínimo: R$ 10
   └─ Máximo: R$ 5000
```

---

## 📋 Passo-a-Passo Completo

```
TERMINAL 1:
┌─────────────────────────────────────────┐
$ docker-compose up -d
✅ Containers iniciados
└─────────────────────────────────────────┘

TERMINAL 2:
┌─────────────────────────────────────────┐
$ cd D:\PROJETOS\Drop
$ npm run dev
✅ Backend rodando em :4000
└─────────────────────────────────────────┘

TERMINAL 3 (novo):
┌─────────────────────────────────────────┐
$ cd D:\PROJETOS\Drop\frontend
$ npm run dev
✅ Frontend rodando em :3000
└─────────────────────────────────────────┘

NAVEGADOR:
┌─────────────────────────────────────────┐
URL: http://localhost:3000/login
Ctrl+Shift+R (hard refresh)

Email: adm@adm
Senha: adm

Clique: Entrar
✅ Login bem-sucedido!

URL muda para: http://localhost:3000/
└─────────────────────────────────────────┘

ACESSO CEO:
┌─────────────────────────────────────────┐
http://localhost:3000/admin/users
http://localhost:3000/admin/settings

🎉 Painéis carregam normalmente!
└─────────────────────────────────────────┘
```

---

## 🔍 Verificar Dados no DevTools

Se quiser confirmar que login funcionou:

1. Abra **DevTools**: `F12`
2. Vá em **Application** (ou **Storage**)
3. Procure por **localStorage** ou **sessionStorage**
4. Procure por campos como:
   ```json
   {
     "token": "eyJhbGc...",
     "user": {
       "email": "adm@adm",
       "role": "ceo",
       "permissions": [...]
     }
   }
   ```

---

## 🎓 Resumo Final

| Item | Status | Detalhes |
|------|--------|----------|
| **Email** | ✅ | adm@adm |
| **Senha** | ✅ | adm |
| **Role no MongoDB** | ✅ | ceo |
| **Permissions** | ✅ | 7 itens (view_all, edit_all, etc) |
| **Docker** | ⚠️ Verificar | docker-compose up -d |
| **Backend** | ⚠️ Verificar | npm run dev |
| **Frontend** | ⚠️ Verificar | cd frontend; npm run dev |

---

## 📞 Próximas Ações

1. **Certifique-se que tudo está rodando** (Docker + Backend + Frontend)
2. **Faça login com `adm@adm` / `adm`**
3. **Teste os painéis:**
   - `/admin/users` → Gerenciar usuários
   - `/admin/settings` → Editar configurações
4. **Compartilhe o resultado:**
   - ✅ Login funcionou! → Qual URL aparece?
   - ❌ Erro X → Qual é a mensagem de erro?

---

## 🎉 Depois de Logar com Sucesso

Uma vez logado como CEO, você pode:

✅ **Em /admin/users:**
- Ver lista de todos os usuários
- Buscar por nome/email
- Filtrar por role
- Editar role de um usuário
- Bloquear/desbloquear usuários

✅ **Em /admin/settings:**
- Editar comissões (Plano 1, 2, 3)
- Editar ganho base motoboy
- Editar taxa por km
- Editar limites de saque
- Ver simulação em tempo real

✅ **Dashboard:**
- Ver dados de vendas
- Ver histórico de transações
- Ver gráficos e relatórios

---

**TENTE AGORA E AVISA O RESULTADO! 👑**

Se funcionar → 🎉 PARABÉNS! Você é CEO!
Se não funcionar → Compartilhe o erro que eu resolvo.
