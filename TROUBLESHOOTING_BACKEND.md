# 🔧 TROUBLESHOOTING - Backend 404 Errors

## ❌ Erro: "Failed to load resource: the server responded with a status of 404"

### O que significa:
- ✅ Backend está **rodando** (se não rodasse, seria `ERR_CONNECTION_REFUSED`)
- ❌ Mas as **rotas não existem** ou não estão configuradas corretamente

### Rotas que estão faltando:
```
❌ POST /auth/login
❌ GET /products
❌ GET /stores/featured
❌ GET /settings/platform-config
❌ GET /notifications
```

---

## 🔍 Como Investigar

### 1. **Verificar se backend está rodando**
```bash
# Terminal 1 - Verificar backend
cd d:\PROJETOS\Drop  # (SEM /frontend)
npm run dev
# Deve aparecer: "Server running on port 4000"
```

### 2. **Verificar se as rotas existem**
```bash
# Terminal 2 - Testar endpoint manualmente
curl http://localhost:4000/auth/login -X POST -H "Content-Type: application/json"
# Se retornar 404 = rota não existe
# Se retornar outro erro = rota existe mas tem problema
```

### 3. **Verificar logs do backend**
Procure no output por:
- ❌ Erros de conexão (MongoDB, etc)
- ❌ Rotas não registradas
- ✅ "Server running on port 4000"

---

## 🛠️ Possíveis Causas

### Causa 1: Backend rodando mas rotas não registradas
```
✅ Server running on port 4000
❌ Mas rotas 404
```
**Solução**: Verificar se arquivos de rota foram criados

### Causa 2: Backend não rodando
```
⚠️ Connection refused (net::ERR_CONNECTION_REFUSED)
```
**Solução**: Iniciar backend com `npm run dev`

### Causa 3: Backend com erro de compilação
```
❌ [ERROR] compilation failed
```
**Solução**: Ver logs do backend pra encontrar erro

---

## 📋 Checklist

- [ ] Backend rodando em porta 4000
- [ ] MongoDB conectado
- [ ] Rotas de auth registradas
- [ ] Frontend consegue fazer request para `/products`
- [ ] Socket.io conectado

---

## 🚀 Próximo Passo

**Rode o backend separadamente e verifique os logs:**

```bash
# Terminal 1 (deixa rodando)
cd d:\PROJETOS\Drop
npm run dev

# Terminal 2 (deixa rodando)
cd d:\PROJETOS\Drop\frontend  
npm run dev
```

Compartilhe os logs do backend aqui pra eu analisar! 👀
