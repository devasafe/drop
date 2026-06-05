# ✅ Testando Login como CEO

## 🎯 Estado Atual

Você **transformou com sucesso** no MongoDB:
```json
{
  "name": "adm",
  "email": "adm@adm",
  "role": "ceo",           ✅ Mudado
  "roles": ["ceo"],        ✅ Adicionado
  "activeRole": "ceo",     ✅ Mudado
  "permissions": [7 itens] ✅ Adicionado
}
```

---

## 🔴 Problema: Erro 500 na Hora do Login

Você está recebendo:
```
⚠️ Internal server error
POST :4000/api/auth/login → 500
```

### 🔧 Solução em 3 Passos

#### Passo 1: Verificar se MongoDB está rodando
```powershell
# Terminal 1
docker-compose up -d

# Espere 10 segundos até iniciar
```

**Verificar:**
```powershell
docker-compose ps
```

Deve mostrar:
```
mongo    mongod          Up
redis    redis           Up
```

#### Passo 2: Iniciar o backend
```powershell
# Terminal 2 (nova aba)
cd D:\PROJETOS\Drop

npm run dev
```

**Espere até aparecer:**
```
✅ Express server running on http://localhost:4000
✅ MongoDB connected
```

#### Passo 3: Limpar cache e fazer login novamente
```
URL: http://localhost:3000/login

# Limpeza de cache (importante!)
Ctrl + Shift + R  (hard refresh)

Email: adm@adm
Senha: (a senha que você colocou quando criou o usuário)

Clique em: Entrar
```

---

## 🔍 Se Ainda Receber Erro 500

### ❌ Verificação 1: Backend está rodando?
```powershell
# Abra o terminal onde você rodou npm run dev
# Procure por erros como:
- SyntaxError
- TypeError
- Cannot find module
```

**Se tiver erro:**
```powershell
# Reinstale dependências
npm install

# Tente novamente
npm run dev
```

### ❌ Verificação 2: MongoDB está acessível?
```powershell
# Terminal 3 (nova aba)
cd D:\PROJETOS\Drop

# Teste a conexão
mongosh "mongodb://localhost:27017/ifood_db"

# Deve conectar sem erros
```

Se não conectar:
```powershell
# Reinicie o Docker
docker-compose down
docker-compose up -d

# Espere 15 segundos
```

### ❌ Verificação 3: Verificar logs do backend
```
Terminal onde npm run dev está rodando
Procure por:
- "POST /auth/login" → se está recebendo a requisição
- Erro específico no log
```

**Se o erro aparecer, compartilhe comigo!**

### ❌ Verificação 4: Credenciais corretas?
```
Email: adm@adm
Senha: ??
```

**Qual é a senha que você usou quando criou o usuário "adm"?**

Se não lembrar, siga os passos abaixo para resetar.

---

## 🔐 Se Esquecer a Senha

### Opção A: Resetar no MongoDB
```
1. Abra MongoDB Compass
2. Procure por "adm@adm"
3. Edite o campo "passwordHash"
4. Gere um novo hash de senha

# Para gerar o hash (abra Node.js):
node
> const bcrypt = require('bcrypt');
> bcrypt.hashSync('NOVA_SENHA', 10)
"$2b$10$..."  ← copie isso

5. Cole no passwordHash
6. Clique Update
```

### Opção B: Deletar e recriar
```
1. MongoDB Compass
2. Procure por "adm@adm"
3. Clique em DELETE
4. Execute novamente: npm run seed:roles
```

---

## 🚀 Passo-a-Passo Completo

```
┌─────────────────────────────────────────┐
│ PASSO 1: Iniciar Infraestrutura         │
└─────────────────────────────────────────┘

Terminal 1:
$ docker-compose up -d
✅ Docker containers iniciados

Aguarde 10 segundos...


┌─────────────────────────────────────────┐
│ PASSO 2: Iniciar Backend                │
└─────────────────────────────────────────┘

Terminal 2:
$ cd D:\PROJETOS\Drop
$ npm run dev

✅ Aguarde aparecer:
   Express server running on :4000
   MongoDB connected


┌─────────────────────────────────────────┐
│ PASSO 3: Fazer Login                    │
└─────────────────────────────────────────┘

Browser:
URL: http://localhost:3000/login
Ctrl + Shift + R (limpar cache)

Email: adm@adm
Senha: [sua senha]

Clique: Entrar


┌─────────────────────────────────────────┐
│ PASSO 4: Acessar Painel CEO             │
└─────────────────────────────────────────┘

✅ Se login funcionou:
   http://localhost:3000/admin/users
   http://localhost:3000/admin/settings

🎉 SUCESSO! Você é CEO!
```

---

## ✅ Checklist Final

- [ ] Docker está rodando (`docker-compose ps`)
- [ ] Backend está rodando (`npm run dev`)
- [ ] Fiz hard refresh no navegador (`Ctrl+Shift+R`)
- [ ] Login bem-sucedido com `adm@adm`
- [ ] Consigo acessar `/admin/users`
- [ ] Consigo acessar `/admin/settings`
- [ ] Consigo ver lista de usuários
- [ ] 🎉 Transformação CEO completa!

---

## 📞 Se Ainda Não Funcionar

**Compartilhe comigo:**

1. **Output do Terminal (npm run dev)** quando tenta fazer login
2. **Saída de:** `docker-compose ps`
3. **Saída do MongoDB Compass** mostrando o usuário "adm"
4. **Qual é a senha que você usou?**
5. **Exatamente qual erro aparece** no navegador (screenshot)

Com essas informações consigo resolver!

---

## 🎯 Resumo

Você já fez o passo mais difícil - **transformar no MongoDB** ✅

Agora é só:
1. Certificar que Docker + Backend estão rodando
2. Fazer login com `adm@adm`
3. Pronto! Acesso CEO liberado!

**Tente agora e avise se funcionar! 👑**
