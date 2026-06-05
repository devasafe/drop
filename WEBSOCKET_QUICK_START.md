# 🏃 QUICK START - WebSocket Ativado

**Leia isto em 2 minutos. Execute em 5 minutos.**

---

## 1️⃣ Instalar
```bash
npm install
cd frontend && npm install && cd ..
```

## 2️⃣ Rodar Backend
```bash
npm run dev
```

Você deve ver:
```
Server running on port 4000
✅ Socket.IO initialized
```

## 3️⃣ Rodar Frontend (outro terminal)
```bash
cd frontend
npm run dev
```

Você deve ver:
```
Ready in Xms
```

## 4️⃣ Testar (abrir 2 abas)

### Aba 1 - Cliente
```
http://localhost:3000
Fazer login como cliente
Ir para página de checkout
```

### Aba 2 - Loja
```
http://localhost:3000
Fazer login como lojista
Ir para Store Dashboard
```

### Ação
```
Aba 1: CREATE PEDIDO
Aba 2: PROCURE MÁGICA ACONTECER ✨
```

**Resultado esperado:**
```
❌ ANTES: Esperar 5s, dar F5
✅ DEPOIS: Pedido aparece < 200ms, SEM F5
```

---

## 5️⃣ Verificar DevTools

1. F12 → Network
2. Filtrar tipo "WS"
3. Ver frames chegando
4. Latência: **< 100ms**

---

## 🎉 SUCESSO!

Se pedido apareceu em tempo real:
```
✅ WebSocket está funcionando
✅ Toma água
✅ Celebra
```

---

## ❌ Não funcionou?

### Erro: "Socket não conecta"
```
Solução: npm install (novamente)
         Reiniciar backend/frontend
```

### Erro: "Pedido não atualiza"
```
Solução: Abrir DevTools Console
         Ver se tem erro
         Se tiver: reportar erro
```

### Erro: "só em uma aba funciona"
```
Solução: Ambas abas devem estar em http://localhost:3000
         Checar se estão no mesmo domínio
```

---

## 📚 Mais Info

- Detalhes em: `WEBSOCKET_LIVE_SUMMARY.md`
- Checklist: `WEBSOCKET_CHECKLIST_PRATICO.md`
- Arquitetura: `WEBSOCKET_ARQUITETURA_VISUAL.md`

---

**Pronto? Vamos lá!** 🚀
