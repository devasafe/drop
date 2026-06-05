# 🧪 Guia de Teste - Sistema de Mensagens Lidas/Não Lidas

## Preparação do Ambiente

### 1. Abra Dois Navegadores (ou Abas)
```
Navegador A (Usuário 1): http://localhost:3000
Navegador B (Usuário 2): http://localhost:3000
```

### 2. Faça Login com Usuários Diferentes
- **Navegador A:** Faça login com um usuário (ex: cliente)
- **Navegador B:** Faça login com outro usuário (ex: lojista)

### 3. Inicie uma Conversa
- Em qualquer navegador, clique no ícone de chat
- Selecione a pessoa para conversar

---

## 📋 Testes Passo a Passo

### ✅ Teste 1: Visibilidade de Mensagens Não Lidas (Amarelas)

**O que testar:** Mensagens que não foram lidas devem ter fundo amarelo

**Passo 1:** No Navegador A, abra a conversa completamente
**Passo 2:** No Navegador B, MINIMIZE a janela do chat
**Passo 3:** No Navegador A, envie uma mensagem: "Teste de mensagem não lida"
**Passo 4:** No Navegador B, observe o widget flutuante

**✅ Resultado Esperado:**
```
┌──────────────────────┐
│ João 🔵              │
│ Teste de msg não lida│  ← DEVE SER AMARELA (#fff3cd)
│ 14:45                │  ← COM BORDA AMARELA (#ffc107)
└──────────────────────┘
```

**🔍 Verificar:**
- [ ] Fundo está amarelo suave
- [ ] Borda está amarela mais escura
- [ ] Tem sombra amarela suave
- [ ] Ícone 🔵 está visível ao lado do nome

---

### ✅ Teste 2: Badge de Contador (Aba)

**O que testar:** Contador vermelho aparece na aba quando há não-lidas

**Passo 1:** No Navegador B, com o widget ainda minimizado
**Passo 2:** No Navegador A, envie mais 2 mensagens:
   - "Mensagem 2"
   - "Mensagem 3"
**Passo 3:** No Navegador B, veja a aba de conversa

**✅ Resultado Esperado:**
```
🏪 João Garcia 3  ← BADGE COM NÚMERO 3
```

**🔍 Verificar:**
- [ ] Badge é um retângulo vermelho (#ff6b6b)
- [ ] Mostra o número correto (3 neste caso)
- [ ] Está ao lado do nome da conversa
- [ ] Texto é branco na badge

---

### ✅ Teste 3: Badge do Widget Minimizado

**O que testar:** Badge grande aparece no botão flutuante quando minimizado

**Passo 1:** No Navegador B, com o widget MINIMIZADO (deve estar agora)
**Passo 2:** No Navegador A, envie mais UMA mensagem: "Mensagem 4"
**Passo 3:** No Navegador B, olhe o botão flutuante (💬)

**✅ Resultado Esperado:**
```
     ⊕ 4   ← BADGE VERMELHA REDONDA COM NÚMERO
    💬
```

**🔍 Verificar:**
- [ ] Badge é um círculo vermelho (#ff4444)
- [ ] Mostra o número total de não-lidas (4)
- [ ] Está na posição top -8, right -8 do botão
- [ ] Tem sombra para destaque
- [ ] Se > 99, mostra "99+"

---

### ✅ Teste 4: Marcar como Lida (Desaparecimento do Amarelo)

**O que testar:** Mensagens ficam brancas quando você abre o widget

**Passo 1:** No Navegador B, ainda minimizado, veja a badge (4)
**Passo 2:** Clique no botão flutuante (💬) para ABRIR
**Passo 3:** Espere 1-2 segundos para o widget carregar
**Passo 4:** Observe as mensagens

**✅ Resultado Esperado:**
```
ANTES (minimizado):
┌──────────────────────┐
│ João 🔵              │
│ Teste de msg não lida│  ← AMARELA
│ 14:45                │
└──────────────────────┘

DEPOIS (widget aberto):
┌──────────────────────┐
│ João                 │
│ Teste de msg não lida│  ← BRANCA (Normal)
│ 14:45                │
└──────────────────────┘
```

**🔍 Verificar:**
- [ ] Fundo mudou de amarelo para branco
- [ ] Borda mudou para cinza claro
- [ ] Ícone 🔵 desapareceu
- [ ] Badge da aba desapareceu
- [ ] Badge do widget desapareceu

---

### ✅ Teste 5: Estado Misto (Lidas + Não Lidas)

**O que testar:** Conversa com alguns lidas e outros não-lidas

**Passo 1:** No Navegador B, com widget ABERTO
**Passo 2:** No Navegador A, envie: "Nova mensagem não lida"
**Passo 3:** No Navegador B, MINIMIZE imediatamente (sem clicar nela)
**Passo 4:** No Navegador A, envie: "Mais uma"
**Passo 5:** No Navegador B, abra o widget e veja

**✅ Resultado Esperado:**
```
┌─────────────────────────────────┐
│ João                            │  ← BRANCA (estava lida)
│ Teste de msg não lida           │
│ 14:45                           │
│                                 │
│ João 🔵                         │  ← AMARELA (nova)
│ Nova mensagem não lida          │
│ 14:50                           │
│                                 │
│ João 🔵                         │  ← AMARELA (nova)
│ Mais uma                        │
│ 14:51                           │
└─────────────────────────────────┘
```

---

### ✅ Teste 6: Múltiplas Conversas com Não-Lidas

**O que testar:** Badge mostra total de todas as conversas

**Passo 1:** No Navegador B, minimize o widget
**Passo 2:** No Navegador A, abra uma conversa DIFERENTE
**Passo 3:** Envie uma mensagem nessa nova conversa
**Passo 4:** No Navegador B, veja o widget

**✅ Resultado Esperado:**
```
Aba 1: 🏪 João Garcia 2  ← Primeira conversa
Aba 2: 🏍️ Motoboy Silva 1 ← Segunda conversa

Badge do widget: 3  ← TOTAL (2 + 1)
```

---

### ✅ Teste 7: Timeout de Digitação com Não-Lidas

**O que testar:** "Digitando..." não interfere com status de leitura

**Passo 1:** No Navegador A, abra a conversa
**Passo 2:** Digite algo (não envie)
**Passo 3:** No Navegador B, veja se mostra "Digitando..."
**Passo 4:** Aguarde 3 segundos
**Passo 5:** Veja se "Digitando..." desaparece

**✅ Resultado Esperado:**
```
Enquanto digita:
João está digitando...●●●

Depois de 3 seg:
(desaparece "Digitando...")
```

**Mensagens não-lidas NÃO são afetadas**

---

## 🔍 Checklist de Validação

### Visual (UI)
- [ ] Mensagens não-lidas têm fundo amarelo (#fff3cd)
- [ ] Mensagens não-lidas têm borda amarela (#ffc107)
- [ ] Ícone 🔵 aparece para não-lidas
- [ ] Badge vermelha (#ff6b6b) na aba com contador
- [ ] Badge vermelha (#ff4444) no botão minimizado

### Funcional (Lógica)
- [ ] Ao receber mensagem: fica não-lida
- [ ] Ao abrir widget: marca como lida
- [ ] Contador atualiza correto
- [ ] Múltiplas conversas contam corretamente
- [ ] Mensagens próprias nunca são "não-lidas"

### Performance
- [ ] Widget abre rápido (< 1 seg)
- [ ] Mensagens aparecem em tempo real
- [ ] Marca como lida sem delay notável
- [ ] Badges atualizam instantaneamente

### Casos Extremos
- [ ] Receber 100+ mensagens: badge mostra "99+"
- [ ] Conversa vazia: sem badges
- [ ] Fechar navegador e reoprir: estado persiste
- [ ] Múltiplas conversas: cada uma tem seu próprio contador

---

## 🐛 Se Algo Não Funcionar

### Problema: Mensagens não ficam amarelas

**Solução:**
1. Verifique no console (F12) se há erro
2. Confirme que `msg.status` está sendo recebido
3. Recarregue a página (Ctrl+R)
4. Reinicie o backend (`npm start`)

### Problema: Badge não aparece na aba

**Solução:**
1. Verifique se `unreadCount > 0`
2. Olhe para o console procurando erros
3. Abra o DevTools e inspecione o elemento
4. Verifique se a conversa tem `unreadCount` definido

### Problema: Badge do widget não aparece

**Solução:**
1. Verifique se `totalUnread` está sendo calculado
2. Abra o DevTools → Console → Procure por "totalUnread"
3. Confirme que o widget está realmente minimizado
4. Recarregue a página

### Problema: Mensagens não marcam como lidas

**Solução:**
1. Verifique se o backend está rodando (`npm start`)
2. Abra DevTools → Network → procure por "mark-as-read"
3. Confirme que o status da requisição é 200
4. Verifique no MongoDB se o status mudou

---

## 📱 Teste em Diferentes Telas

### Desktop
- ✅ Badges visíveis e bem posicionadas
- ✅ Cores bem diferenciadas

### Mobile
- ⚠️ Badge pode parecer pequena em telas muito pequenas
- ⚠️ Mensagens amarelas devem ter contraste suficiente

---

## 📊 Relatório de Teste

Preencha após realizar todos os testes:

```
Data: _______________
Testador: _______________

Testes Passados: _____ de 7
Bugs Encontrados: _____

Observações:
_________________________________
_________________________________
_________________________________

Status Final: [ ] APROVADO [ ] REPROVADO
```

---

**Última Atualização:** 2024
**Versão:** 1.0
