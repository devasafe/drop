# ✅ CHECKLIST DE VALIDAÇÃO: Chat Completo

## 🎯 Objetivo
Validar que TODOS os fluxos de chat estão funcionando corretamente.

---

## 📝 Fluxo 1: Motoboy → Cliente

### Setup
- [ ] Abra em navegador A: Motoboy logado
- [ ] Abra em navegador B: Cliente logado
- [ ] Motoboy: Navegue para uma entrega ativa
- [ ] Cliente: Navegue para página inicial ou perfil

### Teste
- [ ] Motoboy: Clique em "Abrir Chat" com cliente
- [ ] **Esperado:** Widget abre com chat do cliente
- [ ] **Console:** Veja logs `✅ Conversa criada`
- [ ] Motoboy: Digite mensagem de teste
- [ ] Motoboy: Clique enviar
- [ ] **Esperado:** Mensagem aparece com ✓ (enviada)
- [ ] **Cliente:** Veja notificação de nova mensagem
- [ ] **Cliente:** Abra chat (deve estar na aba ou nova aba)
- [ ] **Esperado:** Mensagem do motoboy visível
- [ ] **Esperado:** Contador de não lidas muda para 0
- [ ] Cliente: Digite resposta
- [ ] Cliente: Envie
- [ ] **Esperado:** Motoboy vê mensagem em tempo real
- [ ] **Esperado:** Mensagem tem ✓✓ (lida)

### Soft Delete
- [ ] Motoboy: Clique em deletar/fechar conversa
- [ ] **Esperado:** Conversa desaparece da lista
- [ ] Cliente: Conversa ainda está lá? ✅
- [ ] Cliente: Delete também
- [ ] **Esperado:** Agora desaparece para ambos

### Status
- [ ] ✅ Motoboy-Cliente funciona completo

---

## 📝 Fluxo 2: Motoboy → Loja **[NOVO - VALIDAR!]**

### Setup
- [ ] Abra em navegador A: Motoboy logado
- [ ] Abra em navegador B: Lojista logado
- [ ] Motoboy: Navegue para uma entrega com store
- [ ] Lojista: Navegue para Dashboard ou Chat

### Teste
- [ ] Motoboy: Procure por "Contato com a Loja" na entrega
- [ ] Motoboy: Clique em "💬 Abrir Chat" (próximo à loja)
- [ ] **Esperado:** Widget abre com chat da loja ← **CORRIGIDO!**
- [ ] **Console:** Veja logs:
  ```
  🎯 [EVENT LISTENER] Evento recebido: {id: 'storeId', type: 'store'}
  📡 Fazendo POST para /chat/conversations (motoboy→loja)
     Enviando: {type: 'loja_motoboy', otherParticipantId: 'storeId'}
  ✅ Conversa criada/obtida: {...}
  ```
- [ ] **Backend Console:** Veja:
  ```
  ✅ [CHAT] Nova conversa criada: conversationId
  📢 [CHAT] Emitindo para userId1=motoboy_id, userId2=lojista_id
  ```
- [ ] Motoboy: Digite mensagem para loja
- [ ] Motoboy: Envie
- [ ] **Esperado:** Mensagem aparece com ✓ (enviada)
- [ ] **Lojista:** Veja notificação de conversa nova
- [ ] **Lojista:** Abra a conversa
- [ ] **Esperado:** Mensagem do motoboy visível
- [ ] **Esperado:** Contador de não lidas: 1 → 0
- [ ] Lojista: Digite resposta
- [ ] Lojista: Envie
- [ ] **Esperado:** Motoboy vê em tempo real
- [ ] **Esperado:** Mensagem tem ✓✓ (lida)

### Soft Delete
- [ ] Motoboy: Delete a conversa
- [ ] **Esperado:** Desaparece da lista do motoboy
- [ ] Lojista: Conversa ainda está lá? ✅
- [ ] Lojista: Delete também
- [ ] **Esperado:** Agora desaparece para ambos

### Status
- [ ] ✅ Motoboy-Loja funciona completo (NOVO!)

---

## 📝 Fluxo 3: Cliente → Loja

### Setup
- [ ] Abra em navegador A: Cliente logado
- [ ] Abra em navegador B: Lojista logado
- [ ] Cliente: Navegue para catalogo ou lojas
- [ ] Lojista: Navegue para Dashboard

### Teste: Via Perfil da Loja
- [ ] Cliente: Clique em uma loja no catálogo
- [ ] Cliente: Clique em "Abrir Chat" na loja
- [ ] **Esperado:** Widget abre com chat da loja
- [ ] Cliente: Digite mensagem
- [ ] Cliente: Envie
- [ ] **Esperado:** Mensagem enviada com ✓
- [ ] **Lojista:** Veja notificação
- [ ] Lojista: Abra conversa
- [ ] **Esperado:** Mensagem visível
- [ ] Lojista: Responda
- [ ] **Esperado:** Cliente vê em tempo real com ✓✓

### Teste: Via Produto (Pré-Compra)
- [ ] Cliente: Selecione um produto
- [ ] **Esperado:** Opção de chat com a loja aparece
- [ ] Cliente: Clique em chat
- [ ] **Esperado:** Widget abre
- [ ] Cliente: Pergunte sobre o produto
- [ ] **Esperado:** Mensagem enviada com orderId/productId

### Status
- [ ] ✅ Cliente-Loja funciona completo

---

## 📝 Fluxo 4: Loja → Qualquer Um

### Setup
- [ ] Abra em navegador A: Lojista logado
- [ ] Abra em navegador B: Motoboy ou Cliente
- [ ] Lojista: Navegue para Dashboard ou Conversas

### Teste
- [ ] Lojista: Abra lista de conversas
- [ ] **Esperado:** Vê conversas com clientes e motoboys
- [ ] Lojista: Selecione uma conversa
- [ ] Lojista: Digite mensagem
- [ ] Lojista: Envie
- [ ] **Esperado:** Mensagem criada com ✓
- [ ] **Cliente/Motoboy:** Veja notificação
- [ ] **Cliente/Motoboy:** Abra conversa
- [ ] **Esperado:** Mensagem visível
- [ ] **Cliente/Motoboy:** Veja ✓✓ (lida) aparecer
- [ ] Cliente/Motoboy: Responda
- [ ] **Esperado:** Lojista vê em tempo real

### Status
- [ ] ✅ Loja-Qualquer Um funciona completo

---

## 🎯 Casos de Uso Avançados

### Teste: Múltiplas Abas de Chat Abertas
- [ ] Motoboy: Abra chat com cliente
- [ ] Motoboy: Abra chat com loja (mesma entrega)
- [ ] **Esperado:** 2 abas abertas no widget
- [ ] **Esperado:** Pode alternar entre abas
- [ ] Motoboy: Envie mensagem na aba 1
- [ ] **Esperado:** Contador atualiza na aba 1
- [ ] **Cliente:** Responde
- [ ] **Esperado:** Contador na aba 1 sobe para 1 não lida
- [ ] Motoboy: Clique na aba 1
- [ ] **Esperado:** Vê mensagem e contador volta para 0
- [ ] Aba 2 (loja) continua com seu contador independente ✅

### Teste: Notificações Múltiplas
- [ ] Cliente: Envie 3 mensagens rápidas para loja
- [ ] **Esperado:** Contador da loja mostra 3
- [ ] Lojista: Abra chat
- [ ] **Esperado:** Vê 3 mensagens
- [ ] **Esperado:** Contador volta para 0
- [ ] Lojista: Abra outra conversa
- [ ] **Esperado:** Widget mostra contador apenas na aba 1
- [ ] Volte para aba 1
- [ ] **Esperado:** Contador segue 0 (lidas)

### Teste: Typing Indicator (Se Implementado)
- [ ] Cliente: Comece a digitar
- [ ] **Esperado:** Lojista vê "Cliente está digitando..."
- [ ] Cliente: Pare de digitar
- [ ] **Esperado:** Texto desaparece
- [ ] Lojista: Responda
- [ ] **Esperado:** Cliente vê "Lojista está digitando..."

### Teste: Mute/Block (Se Implementado)
- [ ] Motoboy: Mutar conversa com cliente
- [ ] **Esperado:** Conversaçãofica cinza ou com 🔇
- [ ] **Cliente:** Envie mensagem
- [ ] **Esperado:** Motoboy não vê notificação
- [ ] Motoboy: Unmute
- [ ] **Esperado:** Volta ao normal

---

## 🔴 Testes de Erro

### Teste: Sem Autenticação
- [ ] Limpe cookies/localStorage
- [ ] Tente acessar `/api/chat/conversations`
- [ ] **Esperado:** 401 Unauthorized

### Teste: Chat com Inexistente
- [ ] Tente enviar POST para `/api/chat/conversations`
- [ ] Com userId inexistente
- [ ] **Esperado:** 404 User not found

### Teste: Store Inexistente
- [ ] Tente abrir chat com storeId fake
- [ ] **Esperado:** 404 Loja não encontrada

### Teste: Conversa Inexistente
- [ ] Tente acessar `/api/chat/conversations/fake_id`
- [ ] **Esperado:** 404 Conversa não encontrada

---

## 📊 Checklist Final de Status

### Funcionalidades Básicas
- [ ] ✅ Criar conversa
- [ ] ✅ Enviar mensagem
- [ ] ✅ Receber mensagem em tempo real
- [ ] ✅ Marcar como lido
- [ ] ✅ Soft delete (per-user)
- [ ] ✅ Listar conversas

### Tipos de Conversa
- [ ] ✅ motoboy_cliente
- [ ] ✅ loja_motoboy (NOVO!)
- [ ] ✅ loja_cliente
- [ ] ✅ Pre-purchase (loja_cliente)

### Socket.io
- [ ] ✅ Novo evento de conversa
- [ ] ✅ Nova mensagem em tempo real
- [ ] ✅ Atualização de não lidas
- [ ] ✅ Notificação para ambos participantes

### Frontend
- [ ] ✅ Widget global (_app.tsx)
- [ ] ✅ Múltiplas abas
- [ ] ✅ Contador de não lidas
- [ ] ✅ Listener de eventos customizados
- [ ] ✅ API calls corretos

### Backend
- [ ] ✅ Rotas de chat definidas
- [ ] ✅ Controllers implementados
- [ ] ✅ Store → ownerId conversion (NOVO!)
- [ ] ✅ Socket.io events
- [ ] ✅ Validações de segurança

### Database
- [ ] ✅ Conversation schema
- [ ] ✅ Message schema
- [ ] ✅ deletedBy field para soft delete
- [ ] ✅ Índices de performance

---

## 🎯 Conclusão

Todos os itens abaixo devem estar marcados como ✅ para considerar o chat COMPLETO:

- [ ] ✅ Motoboy-Cliente: Funcionando
- [ ] ✅ Motoboy-Loja: Funcionando (NOVO!)
- [ ] ✅ Cliente-Loja: Funcionando
- [ ] ✅ Loja-Qualquer Um: Funcionando
- [ ] ✅ Tempo real via Socket.io: Sim
- [ ] ✅ Notificações: Sim
- [ ] ✅ Soft delete per-user: Sim
- [ ] ✅ Múltiplas abas: Sim
- [ ] ✅ Sem erros em produção: Sim

---

## 📝 Notas Finais

**Data de Conclusão:** 20/03/2026

**Commit/Deploy Necessário:** 
- [ ] Build do backend: `npm run build`
- [ ] Deploy das mudanças em `src/controllers/chatController.ts`
- [ ] Restart do servidor

**Comunicação ao Time:**
- [ ] Documentação pronta
- [ ] Fluxos documentados
- [ ] Testes validados
- [ ] Pronto para uso em produção!

🚀 **Chat Completo e Funcional!**
