# 🔧 ERRO 500 LOGIN - DIAGNÓSTICO E SOLUÇÃO

## 🔴 Problema Identificado

Você está recebendo:
```
POST http://localhost:4000/api/auth/login 500 (Internal Server Error)
```

### Causa Provável:

O usuário "adm" foi criado manualmente no MongoDB com o campo `passwordHash` já sendo um hash do bcrypt. Mas pode haver um destes problemas:

1. **O `passwordHash` pode estar vazio ou inválido**
2. **O arquivo `authController.ts` pode estar com um bug**
3. **O backend não foi reiniciado após as mudanças no MongoDB**

---

## 🔍 Diagnóstico - Ver o Erro Exato

### Passo 1: Abra o Terminal onde `npm run dev` está rodando

Procure pela mensagem de erro. Deve aparecer algo como:

```
❌ TypeError: user.passwordHash is not a string
❌ Error: bcrypt hash is not valid
❌ Cannot read property 'passwordHash' of undefined
```

**Compartilhe comigo exatamente qual é o erro que aparece!**

---

## ✅ Solução 1: Resetar Password Hash (RÁPIDA)

Se o `passwordHash` está corrompido, vamos regenerar um válido.

### Passo 1: Gerar um novo hash bcrypt
```powershell
# Abra PowerShell e execute:
node -e "console.log(require('bcrypt').hashSync('adm', 10))"
```

Você vai receber algo como:
```
$2b$10$5nnb96rZ3OlA9Q5hNjbGfOSUT2doBFG4KzGtvWua4T6fz3TbRY4o6
```

**Copie isso!**

### Passo 2: Atualizar no MongoDB Compass
```
1. Abra MongoDB Compass
2. ifood_db → users
3. Procure por: { "email": "adm@adm" }
4. Clique para editar
5. Campo "passwordHash":
   - Remova o valor antigo
   - Cole: $2b$10$5nnb96rZ3OlA9Q5hNjbGfOSUT2doBFG4KzGtvWua4T6fz3TbRY4o6
6. Clique "Update"
```

### Passo 3: Restart Backend
```powershell
# Terminal onde npm run dev está rodando:
# Ctrl+C para parar

npm run dev
```

### Passo 4: Tentar login novamente
```
Email: adm@adm
Senha: adm
```

---

## ✅ Solução 2: Deletar e Recriar (SE SOLUÇÃO 1 NÃO FUNCIONAR)

### Passo 1: Deletar o usuário "adm"
```
1. MongoDB Compass
2. ifood_db → users
3. Procure por: { "email": "adm@adm" }
4. Clique em DELETE (botão vermelho)
```

### Passo 2: Executar seed script
```powershell
cd D:\PROJETOS\Drop
npm run seed:roles
```

Resultado esperado:
```
✅ CEO criado: ceo@admin.com
✅ Marketing criado: marketing@admin.com
✅ Admin criado: admin@admin.com
✅ Financeiro criado: financeiro@admin.com
✅ Suporte criado: suporte@admin.com
```

### Passo 3: Fazer login com CEO padrão
```
Email: ceo@admin.com
Senha: CEO@12345Admin
```

### Passo 4: Depois criar sua conta "adm"
```
1. Faça login como ceo@admin.com
2. Vá em /admin/users
3. Crie novo usuário "adm" / "adm@adm"
4. Defina role como CEO
```

---

## 🔧 Solução 3: Verificar o Código (Se houver bug)

Se nenhuma das soluções acima funcionar, pode haver um bug no `authController.ts`. Vou verificar:

### Erro possível 1: passwordHash undefined
```typescript
// ❌ ERRADO:
const matched = await bcrypt.compare(password, user.passwordHash);
// Se user.passwordHash for undefined → erro 500

// ✅ CERTO:
if (!user.passwordHash) {
  return res.status(401).json({ error: 'Invalid credentials' });
}
const matched = await bcrypt.compare(password, user.passwordHash);
```

### Erro possível 2: user é null
```typescript
// ❌ ERRADO:
const user = await User.findOne({ email });
const matched = await bcrypt.compare(password, user.passwordHash);
// Se user for null → erro de "Cannot read property"

// ✅ CERTO:
const user = await User.findOne({ email });
if (!user) return res.status(401).json({ error: 'Invalid credentials' });
const matched = await bcrypt.compare(password, user.passwordHash);
```

---

## 📋 Passo-a-Passo Resumido

### Solução Rápida (5 min):
```
1. Gere novo hash: node -e "console.log(require('bcrypt').hashSync('adm', 10))"
2. Cole no MongoDB Compass no campo passwordHash
3. Clique Update
4. Reinicie backend (Ctrl+C, npm run dev)
5. Tente login novamente
```

### Solução Segura (10 min):
```
1. Delete usuário "adm" do MongoDB
2. npm run seed:roles
3. Login com ceo@admin.com
4. Crie novo usuário "adm" no painel /admin/users
```

---

## 🚨 IMPORTANTE: Ver os Logs

**Para resolver qualquer coisa, eu preciso saber:**

1. **Qual é o erro exato no terminal?** (copie e cole)
2. **Aparecer mensagem como:**
   - `TypeError: ...`
   - `Cannot read property ...`
   - `bcrypt error ...`
   - Qualquer coisa que diz "error" ou "Error"

---

## 🎯 Próximos Passos

1. **Tente Solução 1** (gerar novo hash)
   - Se funcionar → 🎉 Parabéns!
   - Se não funcionar → próximo passo

2. **Tente Solução 2** (deletar e recriar)
   - Se funcionar → 🎉 Parabéns!
   - Se não funcionar → próximo passo

3. **Compartilhe os logs comigo**
   - Copie a mensagem de erro exata
   - Vou analisar e corrigir

---

**TENTE AGORA! Qual solução você vai usar primeiro?** 👉
