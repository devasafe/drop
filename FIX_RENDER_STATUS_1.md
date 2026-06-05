# 🔍 Deploy Status 1 - Runtime Error

## O que significa

- ✅ **Build compilou** (status 2 era compilação)
- ❌ **App falhou ao iniciar** (status 1)
- 🔴 **Provavelmente**: MongoDB não conecta, variável faltando, ou erro ao iniciar Socket.IO

---

## 🎯 Como Ver os Logs

### Passo 1: Acesse Render Dashboard
https://dashboard.render.com

### Passo 2: Clique no seu serviço `drop-backend`

### Passo 3: Clique na aba **"Logs"**

### Passo 4: Procure por uma das mensagens:

```
❌ ERRO: Variáveis de ambiente inválidas
Error connecting to MongoDB
TypeError: Cannot read property
ECONNREFUSED
```

---

## 🔧 Possíveis Causas

### Causa 1: MONGODB_URI incorreta
**Sintoma**: `MongoError: connect ECONNREFUSED`

**Solução**: Verifique se a string é válida:
```
mongodb+srv://usuario:senha@cluster.mongodb.net/dbname
```

⚠️ Certifique-se que a senha **não tem caracteres especiais** não-escapados!

Se tiver `@` ou `!` na senha, deve ser escapado em URL:
- `@` → `%40`
- `!` → `%21`

### Causa 2: JWT_SECRET muito curta
**Sintoma**: `JWT_SECRET deve ter no mínimo 32 caracteres`

**Solução**: No Render, vá em **Environment** e:
```
JWT_SECRET = sua-chave-com-pelo-menos-32-caracteres-incluindo-numeros-e-especiais-123
```

### Causa 3: PORT já em uso
**Sintoma**: `Error: listen EADDRINUSE :::10000`

**Solução**: Render não deveria ter esse problema, mas deixe `PORT = 10000`

---

## 📋 Verificação Rápida

### Check 1: MONGODB_URI

Você adicionou assim?

```
mongodb+srv://usuario:senha@cluster.mongodb.net/
```

⚠️ **Vejo que tem `%40` que é bom!** Mas falta o **nome do banco de dados** no final!

Deve ser:
```
mongodb+srv://usuario:senha@cluster.mongodb.net/drop
```

ou

```
mongodb+srv://usuario:senha@cluster.mongodb.net/dbname?retryWrites=true&w=majority
```

### Check 2: JWT_SECRET

Você tem:
```
82cd5bdc81d2a48e4231a975987ecf63
```

Isso tem 32 caracteres, está bom! ✅

### Check 3: CORS_ORIGIN

Está como:
```
https://frontend-qejclukxi-devasafes-projects.vercel.app/
```

⚠️ **Tem `/` no final!** Deveria ser:
```
https://frontend-qejclukxi-devasafes-projects.vercel.app
```

---

## 🔧 Fix Imediato

No Render Dashboard, vá em **Environment** e **corrija**:

1. **MONGODB_URI**: Adicione o nome do banco no final
   ```
   mongodb+srv://usuario:senha@cluster.mongodb.net/drop
   ```

2. **CORS_ORIGIN**: Remova a `/` do final
   ```
   https://frontend-qejclukxi-devasafes-projects.vercel.app
   ```

3. Clique **Save**
4. Clique **Manual Deploy**

---

## 📱 Depois que passar

Teste:
```bash
curl https://drop-backend.onrender.com/api/health
```

