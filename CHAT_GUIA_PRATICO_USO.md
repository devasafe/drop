# 🎯 GUIA PRÁTICO: Como Usar o Chat no Dia a Dia

**Status:** ✅ Sistema totalmente funcional  
**Última atualização:** 20/03/2026  

---

## 🚀 Quick Start (5 minutos)

### 1. Certificar que Backend Está Rodando
```bash
npm start
# Esperado:
# 🚀 Server running on port 4000 (development mode)
```

### 2. Abrir Frontend
```bash
# Outra aba do terminal
cd frontend && npm run dev
# Esperado:
# > next dev
# ▲ Next.js (versão)
# ✓ Ready in (tempo)
```

### 3. Acessar em `http://localhost:3000`

Pronto! Chat está funcional!

---

## 👤 Teste 1: Motoboy → Loja (NOVO!)

### Setup (2 navegadores ou 2 abas)

**Navegador 1 (Motoboy):**
1. Acesse `http://localhost:3000`
2. Login como motoboy
   - Email: `mtb@test.com`
   - Senha: (a do sistema)

**Navegador 2 (Lojista):**
1. Acesse `http://localhost:3000`
2. Login como lojista
   - Email: (lojista da AsapStore)
   - Senha: (a do sistema)

### Executar Teste

**Motoboy:**
1. Clique em "Minhas Entregas"
2. Selecione uma entrega com status ativo
3. Procure por "Contato com a Loja"
4. Clique em "💬 Abrir Chat"
5. **Esperado:** Widget abre mostrando chat com a loja

**Lojista:**
1. Veja notificação de nova conversa
2. Clique na conversa
3. Digite resposta: "Oi, como posso ajudar?"
4. Clique enviar

**Motoboy:**
1. Veja a mensagem chegar em tempo real ⚡
2. Veja ✓✓ (lida) na sua mensagem
3. Responda: "Tudo bem, obrigado!"

### ✅ Resultado Esperado
- [ ] Chat abriu sem erro
- [ ] Mensagens chegam em tempo real
- [ ] Indicador de lida funciona
- [ ] Ambos veem a conversa

---

## 👤 Teste 2: Cliente → Loja

### Setup

**Navegador 1 (Cliente):**
1. Login como cliente

**Navegador 2 (Lojista):**
1. Login como lojista

### Executar Teste

**Cliente:**
1. Vá para seção de Lojas
2. Selecione "AsapStore"
3. Clique em "Abrir Chat"
4. Digite pergunta: "Qual é a taxa de entrega?"

**Lojista:**
1. Veja notificação
2. Responda: "A taxa é R$ 5,00"

**Cliente:**
1. Veja resposta em tempo real

### ✅ Resultado Esperado
- [ ] Chat pré-compra funciona
- [ ] Lojista vê e responde
- [ ] Cliente vê em tempo real

---

## 👤 Teste 3: Múltiplas Conversas Abertas

### Executar Teste

**Motoboy com 2 navegadores abertos:**
1. Abra Chat 1: Com Cliente A
2. Abra Chat 2: Com Loja B
3. Digite na aba 1: "Qual é o endereço?"
4. Digite na aba 2: "Posso retirar em meia hora?"

**Esperado:**
- [ ] 2 abas abertas no widget
- [ ] Pode alternar entre abas
- [ ] Notificações aparecem em cada aba
- [ ] Sem conflito entre conversas

---

## 🗑️ Teste 4: Soft Delete (Sua Conversa Desaparece, Outra Permanece)

### Executar Teste

**Motoboy:**
1. Abra chat com cliente
2. Troque algumas mensagens
3. Localize opção de deletar/fechar conversa
4. Clique em deletar
5. **Esperado:** Conversa desaparece da sua lista

**Cliente (em outro navegador):**
1. Abra conversa com motoboy
2. **Esperado:** Conversa AINDA ESTÁ LÁ!
3. Histórico de mensagens está intacto

**Cliente:**
1. Agora delete a conversa também
2. **Esperado:** Agora desaparece para ambos

### ✅ Resultado Esperado
- [ ] Soft delete funciona
- [ ] Outro usuário ainda vê
- [ ] Histórico persistido

---

## 🔄 Teste 5: Reativação Automática (A Melhor Feature!)

### Executar Teste

**Lojista:**
1. Abra chat com motoboy
2. Troque mensagens
3. Delete a conversa
4. **Esperado:** Desaparece

**Motoboy (em outro navegador):**
1. Tente enviar mensagem: "Oi, tudo bem?"
2. **MÁGICA:** Conversa é reativada automaticamente!
3. Mensagem é entregue
4. **Esperado:** Lojista vê a conversa reaparece e mensagem chega

### ✅ Resultado Esperado
- [ ] Motoboy consegue enviar mesmo se lojista deletou
- [ ] Conversa reaparece para lojista
- [ ] Mensagem é entregue em tempo real
- [ ] Sem erro 404!

---

## ⚡ Cenários Avançados

### Teste: Desconexão e Reconexão

**Executar:**
1. Abra chat
2. Envie mensagem
3. Desconecte internet (ou feche aba)
4. Reconecte
5. **Esperado:** Socket.io reconecta automaticamente
6. Histórico sincroniza
7. Notificações pendentes chegam

### Teste: Múltiplas Abas do Mesmo Usuário

**Executar:**
1. Abra motoboy/delivery em 2 abas
2. Abra chat da mesma loja em aba 1
3. Envie mensagem em aba 1
4. Vá para aba 2
5. **Esperado:** Aba 2 vê a mensagem chegando em tempo real!

### Teste: Spam de Mensagens

**Executar:**
1. Envie 10 mensagens rapidamente
2. **Esperado:** Todas chegam
3. Contador de não lidas: 10
4. Clique em ler
5. **Esperado:** Contador vai para 0

---

## 🐛 Troubleshooting

### ❌ Chat Não Abre
**Solução:**
1. Abra DevTools (F12)
2. Console → procure por erro
3. Verifique se é 404 ou outro erro
4. Se 404: Backend está respondendo com erro

**Possíveis causas:**
- storeId inválido
- Usuário não autenticado
- Banco de dados offline

### ❌ Mensagem Não Chega
**Solução:**
1. Verificar se Socket.io está conectado
2. Procurar logs no backend
3. Testar com browser diferente

**Possíveis causas:**
- Conexão Socket.io perdida
- Firewall bloqueando WebSocket
- Banco de dados offline

### ❌ Contador Não Atualiza
**Solução:**
1. Refresh da página (F5)
2. Fechar e abrir chat novamente

### ❌ Conversa Não Reativa
**Solução:**
1. Verificar se deletedBy foi configurado
2. Procurar logs no backend com "Reativando"

---

## 📊 Checklist Diário

Todo dia antes de usar em produção:

```
☐ Backend rodando: npm start
☐ Frontend rodando: npm run dev
☐ Socket.io conectado (DevTools)
☐ Testar 1 mensagem motoboy→loja
☐ Testar 1 mensagem cliente→loja
☐ Testar delete (soft delete)
☐ Testar reativação
☐ Verificar logs (✅ vs ❌)
```

---

## 💡 Dicas e Tricks

### Dica 1: Logs no Backend
Abra terminal do backend e veja logs em tempo real:
```
✅ [CHAT] Conversa criada: ID
📢 [CHAT] Emitindo para users
✅ [MESSAGE] Mensagem enviada: ID
```

### Dica 2: DevTools Network
Vá em DevTools → Network para ver:
- POST /api/chat/conversations
- POST /api/chat/messages
- Response time
- Status code (deve ser 201 ou 200)

### Dica 3: DevTools Console
Procure por:
```
✅ = Sucesso
⚠️ = Aviso
❌ = Erro
```

### Dica 4: Socket.io DevTools
Se tiver Socket.io DevTools extensão:
- Veja eventos em tempo real
- Debug de reconexão
- Latência de mensagens

---

## 🎯 Fluxo de Uso Esperado (Produção)

### Motoboy Entregando
```
1. Abre entrega
2. Vê informações do cliente/loja
3. Clica "Abrir Chat" se precisar
4. Widget abre com conversa
5. Envia/recebe mensagens
6. Pode deletar depois
   └─ Loja/Cliente continua vendo histórico
```

### Cliente Comprando
```
1. Navega lojas
2. Clica "Abrir Chat" da loja
3. Faz pergunta pré-compra
4. Loja responde em tempo real
5. Compra com confiança
6. Continua chat para suporte
```

### Lojista Respondendo
```
1. Dashboard mostra conversas não lidas
2. Abre conversa
3. Responde pergunta
4. Cliente/Motoboy vê em tempo real
5. Pode deletar se quiser (soft delete)
   └─ Cliente continua vendo
```

---

## 📈 Métricas para Monitorar

| Métrica | Ideal | Alerta |
|---------|-------|--------|
| Tempo envio mensagem | < 1s | > 5s |
| Socket.io conectado | 100% | < 90% |
| Mensagens entregues | 100% | < 95% |
| Erros 500 | 0 | > 5/hora |
| Latência DB | < 100ms | > 500ms |

---

## 🚨 Quando Contatar Dev

- [ ] Chat não abre (depois de F5)
- [ ] Mensagem não chega (depois de 10s)
- [ ] Erro 500 repetido
- [ ] Socket.io não reconecta
- [ ] Banco de dados offline
- [ ] Função reativação não funciona

---

## 📞 Suporte Rápido

**Copie estes logs quando reportar erro:**

```bash
# Terminal Backend
npm start 2>&1 | tail -100 > backend.log

# DevTools Console
# F12 → Console → Screenshot → envie

# Network
# F12 → Network → filtro por "chat" → Screenshot
```

---

## ✅ Checklist Final

Antes de considerar "completo":

- [x] Todos 4 fluxos testados
- [x] Soft delete funciona
- [x] Reativação automática funciona
- [x] Tempo real confirmado
- [x] Notificações funcionam
- [x] Sem erros 404/500
- [x] Socket.io reconecta
- [x] Documentação completa
- [x] Logs estruturados
- [x] Pronto para produção

---

**Status: 🚀 READY FOR PRODUCTION 🚀**

Sistema testado, documentado e pronto para o uso diário!

Bom uso! 🎉
