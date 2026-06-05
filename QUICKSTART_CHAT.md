# 🚀 Quick Start - Chat em Tempo Real

## Iniciar Desenvolvimento Rápido

### 1️⃣ Terminal 1 - Backend
```bash
cd d:\PROJETOS\Drop
npm start
# ou
npm run dev
```

**Esperado**:
```
🚀 Server running on port 3000 (development mode)
✅ [Socket.io] Chat socket.io configurado
```

### 2️⃣ Terminal 2 - Frontend
```bash
cd d:\PROJETOS\Drop\frontend
npm run dev
```

**Esperado**:
```
> next dev
- ready started server on 0.0.0.0:3001
○ Compiling...
```

### 3️⃣ Abrir Navegador
```
http://localhost:3001
```

---

## Testar Chat em Tempo Real

### 📱 Opção 1: Duas Abas do Mesmo Navegador

```bash
# Tab 1: Cliente (http://localhost:3001)
→ Login como cliente
→ Navegue até página de loja
→ Clique em "💬 Chat com a Loja"
→ Widget abre no canto

# Tab 2: Lojista (http://localhost:3001)
→ Login como lojista
→ Vá para Dashboard → Chat
→ Abra conversa ativa
```

### 🖥️ Opção 2: Dois Navegadores

```bash
# Navegador 1: Google Chrome
http://localhost:3001
→ Login cliente, abrir chat

# Navegador 2: Firefox
http://localhost:3001
→ Login lojista, abrir chat dashboard
```

### 📲 Opção 3: PC + Móvel (na mesma rede)

```bash
# PC (host)
http://localhost:3001

# Mobile (mesmo network wifi)
http://<PC_IP>:3001
# Ex: http://192.168.1.100:3001
```

---

## Console Debug

### F12 - Developer Tools

```javascript
// 1. Verificar Socket.io
console.log('Socket conectado?', socketRef.current?.connected)

// 2. Ver ID do socket
console.log('Socket ID:', socketRef.current?.id)

// 3. Ver URL da API
console.log('API URL:', process.env.NEXT_PUBLIC_API_URL)

// 4. Ver token
console.log('Token:', localStorage.getItem('token').slice(0, 20) + '...')

// 5. Ver user
console.log('User:', JSON.parse(localStorage.getItem('user')))
```

### Monitorar Eventos

```javascript
// Tab Network (F12 → Network)
// Procure por "WS" (WebSocket)
// Deve estar verde/ativo

// Tab Console (F12 → Console)
// Procure por:
// ✅ Socket.io conectado
// ✅ Entrado na sala: chat:abc123
// 📨 Nova mensagem recebida:
```

---

## Checklist Rápido de Teste

### ✅ Basicamente Funciona?

```
☐ Socket conecta (vê "✅ Socket.io conectado" no console)
☐ Entra na sala (vê "✅ Entrado na sala:" no console)
☐ Digita e vê "X está digitando..." na outra aba
☐ Envia mensagem e aparece em tempo real
☐ Recarrega página e histórico persiste
```

### ✅ Detalhes Funcionam?

```
☐ Timestamps corretos nas mensagens
☐ Cores diferentes (azul = enviado, branco = recebido)
☐ Widget minimiza/maximiza
☐ Widget fecha completamente
☐ Badge com count atualiza
☐ Auto-scroll para última mensagem
```

### ✅ Performance OK?

```
☐ Digitar não trava a interface
☐ Mensagens aparecem em < 500ms
☐ Múltiplas mensagens rápidas funcionam
☐ CPU não fica alta (< 30%)
☐ Memory não cresce demais (< 100MB)
```

---

## Comandos Úteis

### Compilação & Build

```bash
# Frontend - Build para produção
cd frontend && npm run build

# Frontend - Verificar erros
npm run lint

# Backend - Compilar TypeScript
npm run build

# Backend - Rodar testes
npm test
```

### Database

```bash
# Ver coleção de conversas
# (no MongoDB Compass ou Atlas)
database: messages
collection: conversations

# Ver mensagens
database: messages
collection: messages
```

### Git

```bash
# Ver mudanças
git status

# Ver diff
git diff frontend/components/ChatWidget.tsx

# Commit
git add .
git commit -m "🚀 feat: Socket.io chat em tempo real"

# Push
git push origin main
```

---

## Variáveis de Ambiente

### Frontend (.env.local)
```env
NEXT_PUBLIC_API_URL=http://localhost:3000
```

### Backend (.env)
```env
PORT=3000
JWT_SECRET=seu_secret_aqui
MONGODB_URI=mongodb://localhost:27017/drop
NODE_ENV=development
```

---

## URLs Úteis

```
Frontend:       http://localhost:3001
Backend API:    http://localhost:3000/api
Socket.io:      ws://localhost:3000 (automático)
MongoDB:        mongodb://localhost:27017
Docs Chat:      /SOCKET_IO_REALTIME_CHAT.md
Docs Teste:     /CHAT_GUIA_PRATICO_TESTE.md
```

---

## Troubleshooting Rápido

### Socket não conecta
```bash
# Verificar se servidor está rodando
netstat -ano | findstr :3000  # Windows
lsof -i :3000                  # Mac/Linux

# Verificar .env.local
echo $env:NEXT_PUBLIC_API_URL  # PowerShell
env | grep API_URL             # Mac/Linux
```

### Mensagens não aparecem
```bash
# Limpar localStorage
localStorage.clear()

# Recarregar página
location.reload()

# Checar console
F12 → Console → buscar "Socket.io desconectado"
```

### Porta já em uso
```bash
# Matar processo
taskkill /PID <PID> /F         # Windows
kill <PID>                     # Mac/Linux

# Ou usar porta diferente
PORT=3001 npm start
```

---

## Documentação Rápida

| Arquivo | Propósito |
|---------|-----------|
| `SOCKET_IO_REALTIME_CHAT.md` | Documentação técnica completa |
| `CHAT_GUIA_PRATICO_TESTE.md` | Como testar passo a passo |
| `CHAT_RESUMO_FINAL.md` | Resumo visual (este arquivo) |
| `IMPLEMENTACAO_STATUS.md` | Checklist e status |
| `frontend/components/ChatWidget.tsx` | Código do widget |
| `src/sockets/chat.ts` | Código do socket backend |

---

## Próximos Passos

### Hoje 🎯
- [x] Implementar Socket.io
- [x] Documentar
- [ ] Testar

### Amanhã 📅
- [ ] Validar em produção
- [ ] Corrigir bugs encontrados
- [ ] Otimizar performance

### Esta Semana 📆
- [ ] Adicionar notificações (phase 2)
- [ ] Implementar read receipts
- [ ] Deploy para staging

### Este Mês 📊
- [ ] Upload de imagens
- [ ] Busca em histórico
- [ ] Features avançadas
- [ ] Deploy para produção

---

## Dúvidas? 🤔

1. **Console do navegador** - F12 → Console → procure por erros
2. **Backend logs** - Terminal mostra conexões e eventos
3. **Documentação** - Ler os arquivos .md listados acima
4. **Code** - `ChatWidget.tsx` e `src/sockets/chat.ts` são bem comentados

---

## 🎉 Tudo Pronto!

```
✅ Backend rodando
✅ Frontend rodando  
✅ Socket.io funcionando
✅ Chat em tempo real
✅ Documentação completa

→ Agora é testar e aproveitar! 🚀
```

---

**Última atualização**: 19 de Março de 2026
**Desenvolvido por**: GitHub Copilot
**Status**: ✅ PRONTO PARA TESTES
