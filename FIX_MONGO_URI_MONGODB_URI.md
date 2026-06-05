# 🔧 Fix: MONGO_URI vs MONGODB_URI

## O Problema

O código esperava: **`MONGO_URI`**  
Mas você configurou no Render: **`MONGODB_URI`**

Resultado: O app tentou usar MongoDB em memória (`mongodb-memory-server`) que falhou porque falta `libcrypto.so.1.1`.

---

## A Solução

Agora o código aceita **ambos os nomes**:

```typescript
// Tenta MONGO_URI, depois MONGODB_URI, depois fallback
MONGO_URI: parsed.MONGO_URI || parsed.MONGODB_URI || 'mongodb://localhost:27017/drop-test'
```

---

## ✅ Próximos Passos

### 1. Aguarde o Render fazer novo deploy (~2 min)

Ele vai usar a variável `MONGODB_URI` que você já tem configurada!

### 2. Teste a URL

```bash
curl https://drop-backend.onrender.com/api/health
```

Deve retornar:
```json
{"status":"ok"}
```

### 3. Pronto! 🎉

Backend rodando em produção!

---

## 📊 Status Atual

| Item | Status |
|------|--------|
| Frontend Vercel | ✅ Deployado |
| Backend Render | ⏳ Aguardando novo deploy |
| MongoDB Atlas | ✅ Configurado |
| Variáveis Env | ✅ Todas corretas |

