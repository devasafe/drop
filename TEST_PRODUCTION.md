# 🧪 Checklist de Teste - Produção

## 1. Backend (Render)
- [ ] **Health Check**: `https://xdxrxoxpx.onrender.com/api/health`
  - Status esperado: `200 OK`
  - Response: `{"ok":true}`

- [ ] **Products**: `https://xdxrxoxpx.onrender.com/api/products`
  - Status esperado: `200 OK`
  - Response: `{"products": [...], "pagination": {...}}`
  - Esperado: 5 produtos

## 2. Frontend (Vercel)
- [ ] **URL**: `https://xdxrxoxpx-cd38a4hm3-devasafes-projects.vercel.app`
- [ ] **Status**: Deve carregar (Status 200)
- [ ] **Produtos**: Deve mostrar os 5 produtos disponíveis

## 3. Browser DevTools - Console (F12)
- [ ] Não deve ter erros vermelhos
- [ ] Deve conter log: `🔌 API Base URL: https://xdxrxoxpx.onrender.com/api | Hostname: xdxrxoxpx-cd38a4hm3-devasafes-projects.vercel.app`
- [ ] Não deve conter `localhost:4000` em nenhuma requisição

## 4. Network Tab (F12)
- [ ] Requisição para `/api/products` deve retornar `200 OK`
- [ ] Response deve conter os 5 produtos
- [ ] Header `Access-Control-Allow-Origin` deve permitir o origin do Vercel

## 5. Verificação Local (Dev)
- [ ] Local dev: `http://localhost:3000` deve conectar a `http://localhost:4000/api`
- [ ] Build local: `npm run build` deve passar sem erros
- [ ] Production build: deve compilar sem TypeScript errors

---

## CRONOGRAMA DE EVENTOS

| Horário | Evento |
|---------|--------|
| 02:00:20 | ✅ Commit `357749b` - Fix URL detection com hostname check |
| 02:XX | 🔄 Vercel começou rebuild |
| ~02:05 | ✅ Vercel deploy completo |
| 02:XX | ✅ Commit `0c0a71a` - Trigger rebuild (força novo deploy) |
| ~02:XX | 🔄 Vercel novo rebuild iniciado |

---

## RESUMO DO FIX

**Problema**: Frontend usando `localhost:4000` em produção
- Causa raiz: `process.env.NEXT_PUBLIC_API_URL` não funcionava com Vercel build system
- Vercel não automaticamente injeta `.env.production`

**Solução**: Runtime hostname detection
- Detecta hostname do browser (client-side)
- Se `localhost` → use `http://localhost:4000/api`
- Senão → use `https://xdxrxoxpx.onrender.com/api`
- Funciona em qualquer deploy sem mudar config

**Arquivos Modificados**:
- ✅ `frontend/lib/api.ts` - Axios client
- ✅ `frontend/lib/socket.ts` - Socket.io client

---

## PRÓXIMOS PASSOS
1. Aguardar Vercel rebuild (5-10 minutos)
2. Acessar `https://xdxrxoxpx-cd38a4hm3-devasafes-projects.vercel.app`
3. Abrir DevTools (F12)
4. Verificar console logs
5. Verificar se produtos aparecem

**Expected**: 5 produtos carregando da API de produção ✅
