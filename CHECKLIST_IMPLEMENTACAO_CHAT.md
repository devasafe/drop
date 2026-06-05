# ✅ Checklist de Implementação - Chat Sistema Drop

## 📋 FASE 1: Backend (Database + API)

### 1.1 Modelos MongoDB

- [ ] **Criar `src/models/Conversation.ts`**
  - [ ] Schema com participant1/participant2
  - [ ] Campos type (loja_cliente, loja_motoboy, motoboy_cliente)
  - [ ] Timestamps (createdAt, updatedAt, lastMessageAt)
  - [ ] Metadados (isActive, isBlocked, isMuted)
  - [ ] Índices para rápida busca

- [ ] **Criar `src/models/Message.ts`**
  - [ ] Schema com senderId, conversationId
  - [ ] Campos de status (sent, delivered, read)
  - [ ] Suporte a attachments (image, location, file)
  - [ ] Timestamp de criação e leitura
  - [ ] Índices para busca por conversa

### 1.2 Controllers

- [ ] **Criar `src/controllers/chatController.ts`**
  - [ ] `createOrGetConversation()` - POST /api/chat/conversations
  - [ ] `getMessages()` - GET /api/chat/conversations/:id
  - [ ] `sendMessage()` - POST /api/chat/messages
  - [ ] `markAsRead()` - PUT /api/chat/messages/:id/read
  - [ ] `listConversations()` - GET /api/chat/conversations
  - [ ] `muteConversation()` - PUT /api/chat/conversations/:id/mute
  - [ ] `blockParticipant()` - PUT /api/chat/conversations/:id/block

**Validações obrigatórias:**
- [ ] Autenticação em todas as rotas
- [ ] Verificar se usuário é participante antes de retornar mensagens
- [ ] Validar type de conversa (whitelist)
- [ ] Sanitizar texto de mensagens
- [ ] Rate limiting para envio de mensagens

### 1.3 Routes

- [ ] **Criar `src/routes/chat.ts`**
  - [ ] POST /api/chat/conversations
  - [ ] GET /api/chat/conversations
  - [ ] GET /api/chat/conversations/:conversationId
  - [ ] GET /api/chat/conversations/:conversationId/messages
  - [ ] POST /api/chat/messages
  - [ ] PUT /api/chat/messages/:messageId/read
  - [ ] PUT /api/chat/conversations/:conversationId/mute
  - [ ] PUT /api/chat/conversations/:conversationId/block
  - [ ] DELETE /api/chat/conversations/:conversationId
  - [ ] Importar em `src/app.ts` ou `src/routes/index.ts`

### 1.4 Socket.io Setup

- [ ] **Criar `src/sockets/chat.ts`**
  - [ ] Handler 'chat:join' (entrar em room)
  - [ ] Handler 'chat:message' (receber + broadcast)
  - [ ] Handler 'chat:typing' (indicador)
  - [ ] Handler 'chat:mark_read' (marcar lido)
  - [ ] Handler 'chat:leave' (sair da conversa)
  - [ ] Handler 'disconnect' (cleanup)

- [ ] **Integrar Socket.io em `src/app.ts` ou `src/index.ts`**
  - [ ] Importar `setupChatSocket`
  - [ ] Chamar função após Socket.io instanciado
  - [ ] Testar conexão com client

### 1.5 Middleware

- [ ] **Criar middleware de autenticação para Socket.io**
  - [ ] Verificar token JWT na conexão
  - [ ] Extrair userId do token
  - [ ] Passar para handlers

- [ ] **Criar middleware de validação de dados**
  - [ ] Validar tipos de conversa
  - [ ] Validar tamanho de mensagens
  - [ ] Validar IDs de usuário

### 1.6 Serviços auxiliares

- [ ] **Criar `src/services/chatService.ts`**
  - [ ] `createConversation()` - lógica de criação
  - [ ] `sendMessage()` - persistir + emitir socket
  - [ ] `markAsRead()` - atualizar status
  - [ ] `getUnreadCount()` - contar mensagens não lidas
  - [ ] `notifyNewMessage()` - enviar notificações (push, email)

---

## 📋 FASE 2: Frontend - Componentes

### 2.1 Context e Hooks

- [ ] **Criar `frontend/contexts/ChatContext.tsx`**
  - [ ] `useChatContext()` hook
  - [ ] State global de conversas
  - [ ] State de mensagens
  - [ ] Funções para criar conversa, enviar, etc

- [ ] **Criar `frontend/hooks/useChat.ts`**
  - [ ] Hook para gerenciar conversa individual
  - [ ] Carregar histórico
  - [ ] Ouvir eventos de socket
  - [ ] Cleanup

### 2.2 Componentes principais

- [ ] **Criar `frontend/components/chat/ChatPanel.tsx`**
  - [ ] Props: participantId, type, orderId?, deliveryId?
  - [ ] Display de mensagens
  - [ ] Input para digitar
  - [ ] Botão enviar
  - [ ] Scroll automático para última mensagem
  - [ ] Indicador de digitação

- [ ] **Criar `frontend/components/chat/ChatBubble.tsx`**
  - [ ] Mostrar mensagem individual
  - [ ] Diferente estilo para enviado/recebido
  - [ ] Status (sent, delivered, read)
  - [ ] Timestamp
  - [ ] Avatar do remetente

- [ ] **Criar `frontend/components/chat/ChatInput.tsx`**
  - [ ] Input de texto
  - [ ] Botão enviar
  - [ ] Suporte a Shift+Enter para nova linha
  - [ ] Emoji picker (opcional)
  - [ ] Upload de arquivo (opcional)

- [ ] **Criar `frontend/components/chat/ChatIcon.tsx`**
  - [ ] Badge com unread count
  - [ ] Mostrado próximo a cada conversa
  - [ ] Click abre chat modal

- [ ] **Criar `frontend/components/chat/ConversationList.tsx`**
  - [ ] Lista de todas as conversas do usuário
  - [ ] Mostrar last message preview
  - [ ] Unread count badge
  - [ ] Click abre conversa
  - [ ] Opções: mute, block, delete

### 2.3 Integrações em páginas existentes

- [ ] **Em `frontend/pages/loja/pedidos/[id].tsx`**
  - [ ] Adicionar ChatIcon próximo ao nome do cliente
  - [ ] Click abre ChatPanel modal
  - [ ] Type: 'loja_cliente'

- [ ] **Em `frontend/pages/motoboy/delivery/[id].tsx`**
  - [ ] Adicionar ChatIcon próximo a info da loja
  - [ ] Adicionar ChatIcon próximo a info do cliente
  - [ ] Click abre ChatPanel modal
  - [ ] Type: 'loja_motoboy' ou 'motoboy_cliente'

- [ ] **Em `frontend/pages/cliente/pedido/[id].tsx`**
  - [ ] Adicionar ChatIcon próximo a info da loja
  - [ ] Adicionar ChatIcon próximo a info do motoboy
  - [ ] Click abre ChatPanel modal

- [ ] **Criar `frontend/pages/chat/index.tsx`**
  - [ ] Página dedicada para gerenciar chats
  - [ ] Sidebar com lista de conversas
  - [ ] Main area com chat selecionado
  - [ ] Roteamento: `/chat` ou `/chat/:conversationId`

---

## 📋 FASE 3: Testes

### 3.1 Testes unitários (Jest)

- [ ] **Tests para `chatController.ts`**
  - [ ] `createOrGetConversation()` - criar nova, obter existente
  - [ ] `sendMessage()` - enviar, persistir, validar
  - [ ] `markAsRead()` - atualizar status
  - [ ] Validações (autenticação, autorização)

- [ ] **Tests para `chatService.ts`**
  - [ ] Lógica de criação de conversa
  - [ ] Unread count calculation
  - [ ] Message retrieval com paginação

### 3.2 Testes de integração (API)

- [ ] **Testar fluxo completo com Postman/Insomnia**
  - [ ] POST criar conversa → deve retornar conversationId
  - [ ] POST enviar mensagem → deve persistir e retornar
  - [ ] GET obter mensagens → paginação funcionando
  - [ ] PUT marcar lido → status atualizado
  - [ ] GET listar conversas → unread count correto

### 3.3 Testes Socket.io

- [ ] **Testar eventos em tempo real**
  - [ ] Join/leave room funcionando
  - [ ] Broadcast de nova mensagem
  - [ ] Indicador de digitação
  - [ ] Múltiplos clientes em simultaneidade

### 3.4 Testes E2E (Cypress/Playwright)

- [ ] **Testar fluxo de usuário**
  - [ ] Loja inicia chat com cliente
  - [ ] Cliente responde
  - [ ] Mensagem aparece em tempo real
  - [ ] Indicador de digitação aparece
  - [ ] Marcar como lido funciona
  - [ ] Mute/Block funciona

### 3.5 Teste manual

- [ ] **Abrir 2 navegadores (ou abas incógnito)**
  - [ ] Loja em um, Cliente em outro
  - [ ] Enviar mensagens de ambos os lados
  - [ ] Verificar chegada em tempo real
  - [ ] Verificar se socket desconecta corretamente
  - [ ] Testar diferentes tipos de conversa

---

## 📋 FASE 4: Otimizações e Features extras

### 4.1 Performance

- [ ] **Paginação de mensagens**
  - [ ] Carregar 50 por vez
  - [ ] Lazy load ao scroll up (histórico)

- [ ] **Índices no MongoDB**
  - [ ] `Conversation: [participant1.userId, participant2.userId]`
  - [ ] `Message: [conversationId, createdAt DESC]`
  - [ ] `Message: [conversationId, senderId, status]`

- [ ] **Cache (Redis opcional)**
  - [ ] Cache de conversas ativas
  - [ ] TTL para expiração

### 4.2 Features extras (Phase 2+)

- [ ] **Attachments**
  - [ ] Upload de imagens
  - [ ] Compartilhamento de localização
  - [ ] Compartilhamento de arquivos

- [ ] **Notificações**
  - [ ] Push notification (browser)
  - [ ] Email notification
  - [ ] SMS (via Twilio?)

- [ ] **Indicadores de status**
  - [ ] Online/Offline
  - [ ] Última visualização
  - [ ] "Digitando..."

- [ ] **Search**
  - [ ] Buscar em histórico de mensagens
  - [ ] Buscar conversas por participante

- [ ] **Autodelete**
  - [ ] Apagar mensagens após X dias
  - [ ] Política de retenção

### 4.3 Segurança

- [ ] **Encryption de mensagens (opcional)**
  - [ ] End-to-end encryption
  - [ ] Usar biblioteca: tweetnacl.js

- [ ] **Rate limiting**
  - [ ] Máximo de mensagens por minuto
  - [ ] Máximo de requisições de API

- [ ] **GDPR compliance**
  - [ ] Direito ao esquecimento
  - [ ] Exportar dados do usuário
  - [ ] Deletar todas as mensagens ao sair

---

## 📋 Testes Manuais - Checklist de Aceitação

### Chat Loja ↔ Cliente

- [ ] **Cenário 1: Dúvida do cliente ANTES da aceitação**
  - [ ] Cliente clica em "Chat" no produto
  - [ ] Abre conversa com loja
  - [ ] Escreve dúvida ("Qual a cor?")
  - [ ] Loja vê notificação
  - [ ] Loja responde
  - [ ] Cliente vê resposta em tempo real
  - [ ] Badge mostra unread count

- [ ] **Cenário 2: Pedido sendo preparado**
  - [ ] Loja envia: "Seu pedido está sendo preparado"
  - [ ] Cliente recebe notificação
  - [ ] Abre chat e vê mensagem

- [ ] **Cenário 3: Problema com pedido**
  - [ ] Loja envia foto de item faltando
  - [ ] Cliente vê imagem anexada
  - [ ] Cliente responde com localização de solução
  - [ ] Loja vê localização no mapa

### Chat Loja ↔ Motoboy

- [ ] **Cenário 1: Confirmação de retirada**
  - [ ] Loja envia: "Pedido pronto para retirada, começa na porta de trás"
  - [ ] Motoboy recebe notificação
  - [ ] Motoboy abre chat
  - [ ] Motoboy responde: "Já to chegando!"
  - [ ] Loja vê resposta

- [ ] **Cenário 2: Pedido não pronto**
  - [ ] Motoboy chega e vê que pedido ainda não está pronto
  - [ ] Motoboy envia: "Quanto tempo ainda?"
  - [ ] Loja responde: "5 minutos"
  - [ ] Chat fica aberto esperando
  - [ ] Loja envia: "Pronto! Vem retirar"
  - [ ] Motoboy vê atualização em tempo real

### Chat Motoboy ↔ Cliente

- [ ] **Cenário 1: Estimativa de chegada**
  - [ ] Motoboy envia: "Saí da loja, chego em 10min"
  - [ ] Cliente vê notificação
  - [ ] Cliente abre e pode responder

- [ ] **Cenário 2: Cliente não atende**
  - [ ] Motoboy chega no endereço
  - [ ] Cliente não atende portaria
  - [ ] Motoboy envia: "Não consegui chamar, estou na porta"
  - [ ] Cliente recebe notificação e pode responder
  - [ ] Descer para receber

- [ ] **Cenário 3: Endereço errado**
  - [ ] Motoboy chega em local diferente
  - [ ] Motoboy envia: "Seu endereço está errado, qual o correto?"
  - [ ] Cliente responde com novo endereço ou coordenadas
  - [ ] Motoboy ajusta rota

### Estados gerais

- [ ] **Mute**
  - [ ] Conversa é silenciada
  - [ ] Não recebe notificações
  - [ ] Ainda pode ver/enviar mensagens

- [ ] **Block**
  - [ ] Não pode enviar mensagens
  - [ ] Outro usuário também não consegue enviar
  - [ ] Conversa fica read-only ou fechada

- [ ] **Delete**
  - [ ] Conversa removida da lista
  - [ ] Histórico pode ser recuperado?
  - [ ] Ou é permanente?

---

## 📊 Critérios de Sucesso

| Critério | Status | Nota |
|----------|--------|------|
| API REST funcionando | ⬜ | POST/GET/PUT/DELETE |
| Socket.io broadcasting | ⬜ | Tempo real < 100ms |
| Mensagens persistidas | ⬜ | MongoDB |
| Notificações em tempo real | ⬜ | Browser notifications |
| 2+ tipos de conversa | ⬜ | loja_cliente, loja_motoboy, motoboy_cliente |
| Indicador de digitação | ⬜ | "... está digitando" |
| Marcar como lido | ⬜ | Status updating |
| Mute/Block funcionando | ⬜ | Comportamento esperado |
| Frontend integrado | ⬜ | Em todas as páginas |
| Sem memory leaks | ⬜ | Cleanup de listeners |
| Rate limiting | ⬜ | Proteção contra spam |
| Testes passando | ⬜ | Jest + E2E |

---

## 🎯 Próximos passos após implementação

1. **Analytics**: Rastrear uso de chat (qtd mensagens, tempo resposta)
2. **AI**: Sugestões automáticas de respostas
3. **Moderação**: Detecção de spam/abuso
4. **Integração com CRM**: Histórico de conversas vinculado a cliente
5. **Transcripts**: Exportar conversa em PDF
6. **Translations**: Suporte multi-idioma (Google Translate API)

---

**Status:** ✅ **CHECKLIST COMPLETA E PRONTA PARA IMPLEMENTAÇÃO**

Tempo estimado: **5-7 dias para Fase 1 (Backend) + 3-5 dias para Fase 2 (Frontend)**
