# ✅ CHECKLIST DE VALIDAÇÃO - Mensagens Lidas/Não Lidas

## 📋 Pré-Requisitos

- [ ] MongoDB rodando
- [ ] Backend rodando: `npm start` (porta 4000)
- [ ] Frontend rodando: `npm run dev` (porta 3000)
- [ ] 2 usuários diferentes para testar

---

## 🧪 Teste 1: Mensagens Antigas Aparecem Brancas

### Setup
- [ ] Aba A: Abra conversa existente (com mensagens antigas)

### Esperado
- [ ] Todas as mensagens aparecem com fundo BRANCO ⬜
- [ ] Nenhuma amarela 🟨
- [ ] Sem ícone 🔵 nas mensagens antigas

### ✅ ou ❌ ?
```
[ ] ✅ Passou
[ ] ❌ Falhou - Mensagens ainda amarelas
```

---

## 🧪 Teste 2: Mensagens Novas Aparecem Amarelas

### Setup
- [ ] Aba A: Abra conversa
- [ ] Aba B: MINIMIZE o widget (clique −)
- [ ] Aba A: Envie mensagem "Teste 1"
- [ ] Observe Aba A: Veja a mensagem chegar

### Esperado
- [ ] Mensagem aparece AMARELA 🟨 na Aba A
- [ ] Tem ícone 🔵 ao lado do nome do remetente
- [ ] Fundo é #fff3cd (amarelo claro)

### ✅ ou ❌ ?
```
[ ] ✅ Passou
[ ] ❌ Falhou - Mensagem branca ou sem ícone
```

---

## 🧪 Teste 3: Badge Aparece no Widget Minimizado

### Setup (continuação do Teste 2)
- [ ] Aba B ainda está MINIMIZADO
- [ ] Aba A já enviou "Teste 1"

### Esperado
- [ ] No botão 💬 da Aba B, aparece badge: `⊕ 1`
- [ ] Badge é vermelha (#ff4444)
- [ ] Fica no canto superior direito

### ✅ ou ❌ ?
```
[ ] ✅ Passou - Badge ⊕ 1 aparece
[ ] ❌ Falhou - Sem badge
```

---

## 🧪 Teste 4: Clique para Abrir Marca Como Lido

### Setup (continuação do Teste 3)
- [ ] Aba B ainda tem badge `⊕ 1`
- [ ] Aba B clica no botão 💬 para abrir widget

### Esperado
- [ ] Widget se abre
- [ ] Badge DESAPARECE do botão
- [ ] Mensagem agora está BRANCA ⬜
- [ ] Sem ícone 🔵

### ✅ ou ❌ ?
```
[ ] ✅ Passou - Tudo branco, badge desapareceu
[ ] ❌ Falhou - Ainda amarela ou badge continua
```

---

## 🧪 Teste 5: Múltiplas Mensagens

### Setup
- [ ] Aba A: Envie 3 mensagens
- [ ] Aba B: Minimize widget

### Esperado
- [ ] Badge mostra `⊕ 3` (3 mensagens não-lidas)
- [ ] Ao clicar para abrir, tudo fica branco
- [ ] Badge desaparece

### ✅ ou ❌ ?
```
[ ] ✅ Passou
[ ] ❌ Falhou - Contagem errada ou não desaparece
```

---

## 🧪 Teste 6: Mensagem Nova Enquanto Widget Aberto

### Setup
- [ ] Aba B: Widget ABERTO (não minimizado)
- [ ] Aba B: Clicou na conversa (aba ativa)
- [ ] Aba A: Envie mensagem "Teste Nova"

### Esperado
- [ ] Mensagem aparece BRANCA ⬜ (não amarela!)
- [ ] Sem ícone 🔵
- [ ] Sem badge no botão

**Motivo:** Backend já marca como lida quando retorna as mensagens

### ✅ ou ❌ ?
```
[ ] ✅ Passou
[ ] ❌ Falhou - Aparece amarela ou com badge
```

---

## 🧪 Teste 7: Múltiplas Conversas

### Setup
- [ ] Aba B: Minimize widget
- [ ] Aba A1: Abra conversa com João
- [ ] Aba A2: Abra conversa com Maria
- [ ] Aba A1: Envie 2 mensagens para João
- [ ] Aba A2: Envie 3 mensagens para Maria

### Esperado
- [ ] Badge mostra `⊕ 5` (2 + 3 = 5 total)
- [ ] Ao abrir widget, vê as 2 conversas:
  - [ ] João com `2` (badge vermelha)
  - [ ] Maria com `3` (badge vermelha)
- [ ] Clica em João → fica branco, badge vira `⊕ 3`
- [ ] Clica em Maria → fica branco, badge desaparece `⊘`

### ✅ ou ❌ ?
```
[ ] ✅ Passou
[ ] ❌ Falhou - Contagem errada
```

---

## 🧪 Teste 8: Auto-Mark com Delay

### Setup
- [ ] Aba B: Minimize widget
- [ ] Aba A: Envie mensagem
- [ ] Aba B: Veja badge `⊕ 1`
- [ ] Aba B: Clique para abrir widget
- [ ] **Aguarde 1-2 segundos**

### Esperado
- [ ] Depois de 1-2 seg, mensagem fica BRANCA
- [ ] Badge desaparece

**Motivo:** Pequeno delay do backend marcando no banco de dados

### ✅ ou ❌ ?
```
[ ] ✅ Passou
[ ] ❌ Falhou - Não muda ou demora muito
```

---

## 📊 Resumo de Testes

Total de testes: 8

| Teste | Status | Observações |
|-------|--------|-------------|
| 1. Mensagens antigas brancas | [ ] | |
| 2. Mensagens novas amarelas | [ ] | |
| 3. Badge aparece | [ ] | |
| 4. Badge desaparece | [ ] | |
| 5. Múltiplas mensagens | [ ] | |
| 6. Nova mensagem aberto | [ ] | |
| 7. Múltiplas conversas | [ ] | |
| 8. Auto-mark com delay | [ ] | |

---

## ✅ Resultado Final

### Se TODOS os testes passaram:
```
🎉 SUCESSO! 
Sistema de lidas/não-lidas está 100% funcional!
Pronto para usar em produção! 🚀
```

### Se ALGUM teste falhou:
```
⚠️ Há um problema
Veja a seção "Se Algo Não Funcionar" abaixo
```

---

## 🐛 Se Algo Não Funcionar

### Cenário 1: Mensagens ainda todas amarelas

**Faça:**
1. DevTools → Application → Storage
2. Clique "Clear All"
3. Feche a aba
4. Reabra `http://localhost:3000`
5. Faça login de novo
6. Teste novamente

**Se ainda não funcionar:**
1. Pare o backend: `Ctrl+C`
2. Pare o frontend: `Ctrl+C`
3. Inicie novamente
4. Teste

---

### Cenário 2: Badge não aparece

**Verifique:**
1. Widget está MINIMIZADO? (clique −)
2. Mensagem foi RECEBIDA? (veja em Aba A)
3. Aguardou 2-3 segundos?

**Se nada ajudar:**
1. DevTools → Console
2. Procure por: `✅ Marcando como lido`
3. Se não aparecer, useEffect não rodou

---

### Cenário 3: Mensagens não ficam brancas

**Aguarde:**
- 2-3 segundos (backend processando)

**Verifique:**
- DevTools → Network
- Procure por: `PUT /conversations/.../mark-as-read`
- Status deve ser 200

**Se status for erro:**
- Verifique se backend está rodando
- Verifique se token é válido (faça logout/login)

---

## 📞 Debug Avançado

### Ver logs no terminal

**Backend:**
```
npm start
# Procure por:
# ✅ [GET MESSAGES] X mensagens marcadas como lidas
# ✅ [GET MESSAGES] Zerado unreadCount
```

**Frontend:**
```
npm run dev
# Abra DevTools → Console
# Procure por:
# 🔍 Widget Message Debug
```

---

## 🎬 Tempo Estimado

- Teste 1-4: 2 minutos
- Teste 5-8: 3 minutos
- **Total:** ~5 minutos

---

## 📝 Anotações Pessoais

```
Teste data: ___/___/_____
Tester: _________________
Resultado: _______________
Observações:
_________________________
_________________________
```

---

## ✨ Próximo Passo

Se tudo passou:
1. ✅ Commit no Git
2. ✅ Deploy em produção
3. ✅ Monitore o primeiro uso

Se falhou:
1. ❌ Veja seção "Debug Avançado"
2. ❌ Abra issue com detalhes
3. ❌ Execute testes novamente

---

**Documento de Teste**  
Versão: 1.0  
Data: 2026-03-20
