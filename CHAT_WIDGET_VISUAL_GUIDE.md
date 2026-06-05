# Chat Widget - Visual Guide 🎨

## Estados Visuais

### 1. Widget Fechado (Padrão)
```
┌─────────────────────────────────────────────────────────────┐
│                                                      [  3  ] │  ← Badge vermelho com count
│                                                        💬    │  ← Botão flutuante roxo
│                                                     (escala) │  ← Hover effect (1.1x)
└─────────────────────────────────────────────────────────────┘
                            ↓ Canto inferior direito
```

**Dimensões**: 60x60px  
**Posição**: fixed, bottom 20px, right 20px  
**Hover**: Scale 1.1, sombra intensificada  

---

### 2. Widget Minimizado
```
┌────────────────────────────────┐
│ 💬 Chat              [▲] [×]   │  ← Apenas header visível
│ Responderemos em breve!        │
└────────────────────────────────┘
```

**Altura**: 60px (apenas header)  
**Botões**: Minimizar ▲, Fechar ×  
**Ação**: Clica novamente para maximizar  

---

### 3. Widget Aberto (Full)
```
┌────────────────────────────────────┐
│ 💬 Chat              [▼] [×]       │  ← Header roxo
│ Responderemos em breve!            │
├────────────────────────────────────┤
│                                    │
│  👋 Inicie uma conversa           │  ← Empty state
│  Sua mensagem aparecerá aqui       │
│                                    │
│ (ou histórico de mensagens)        │  ← Quando tem mensagens
│                                    │
│  ✓ Cliente                    12:34│  ← Mensagem do cliente (azul)
│                                    │
│                  Oi, tudo certo?  │  ← Mensagem da loja (branca)
│                               13:45│
│                                    │
├────────────────────────────────────┤
│ │ Sua mensagem...          │ ✓    │  ← Input + botão enviar
│ └─────────────────────────┘       │
└────────────────────────────────────┘
```

**Dimensões**: 380px × 500px (máx)  
**Responsivo**: 100% em mobile  
**Estrutura**:
- Header: 16px padding, altura 60px
- Messages: Flex 1, overflow auto, 16px padding
- Input: 12px padding, flex shrink 0

---

## Comportamento das Mensagens

### Mensagem do Cliente (Azul)
```
                    ┌──────────────┐
                    │ Olá, tudo    │
                    │ bem?         │
                    │         11:45│
                    └──────────────┘
                  Alinhada à direita
                     Fundo: #667eea
                   Texto: white
```

### Mensagem da Loja (Branca)
```
┌──────────────┐
│ Oi! Tudo     │
│ certo por    │
│ aqui!        │
│         11:46│
└──────────────┘
  Alinhada à esquerda
     Fundo: white
   Texto: #333
   Sombra: 0 1px 3px
```

---

## Transições & Animações

### 1. Hover do Botão Flutuante
```
Padrão    →    Hover
60x60px   →    66x66px (scale 1.1)
Sombra 0.4    →    Sombra 0.6
```
**Tempo**: 0.3s ease

### 2. Minimizar/Maximizar
```
Aberto     →    Minimizado
height: 500px  →  height: 60px
Duração: 0.3s ease
```

### 3. Hover dos Botões (Header)
```
bg: rgba(255,255,255,0.2)  →  bg: rgba(255,255,255,0.3)
Duração: 0.2s ease
```

### 4. Focus do Input
```
border: #ddd  →  border: #667eea
Transição: 0.2s ease
```

### 5. Auto-scroll para Última Mensagem
```
Novo: new div adicionado
      → messagesEndRef scrollIntoView({ smooth })
```

---

## Responsive Design

### Mobile (< 768px)
```
┌─────────────┐
│ 💬 Chat   ▼│  ← Width: 100% (com padding)
├─────────────┤
│ Mensagens   │  ← Height: 80vh ou 600px max
│             │
├─────────────┤
│ Input   │ ✓ │
└─────────────┘
```

### Desktop (> 768px)
```
                ┌────────────────┐
                │ 💬 Chat     ▼│  ← Width: máx 380px
                ├────────────────┤
                │ Mensagens      │  ← Height: 500px
                │                │
                ├────────────────┤
                │ Input    │ ✓   │
                └────────────────┘
              Position: fixed
              bottom: 20px, right: 20px
```

---

## Estados de Carregamento

### Loading State
```
┌────────────────────────────────────┐
│ 💬 Chat                    [▼] [×] │
├────────────────────────────────────┤
│                                    │
│              ⏳                     │
│            Carregando...           │
│                                    │
├────────────────────────────────────┤
│ │ Sua mensagem...          │ ✓    │
└────────────────────────────────────┘
```

### Empty State
```
┌────────────────────────────────────┐
│ 💬 Chat                    [▼] [×] │
├────────────────────────────────────┤
│                                    │
│              👋                    │
│        Inicie uma conversa         │
│   Sua mensagem aparecerá aqui      │
│                                    │
├────────────────────────────────────┤
│ │ Sua mensagem...          │ ✓    │
└────────────────────────────────────┘
```

---

## Badges & Indicadores

### Badge de Mensagens Não Lidas
```
Position: absolute
  top: -8px
  right: -8px
Width/Height: 28px
Border-radius: 50%
Background: #dc3545 (vermelho)
Color: white
Font: 12px, bold
Sombra: 0 2px 8px

Conteúdo:
  1-99: número (ex: "5")
  100+: "99+"
```

### Inputs Habilitados/Desabilitados
```
Habilitado:
  cursor: pointer
  opacity: 1
  backgroundColor: #667eea

Desabilitado (quando vazio):
  cursor: not-allowed
  opacity: 0.5
  backgroundColor: #667eea (sem hover)
```

---

## Fluxo de Interação

### Cliente Abrindo Chat
```
1. Clica em 💬 (na home, perfil da loja, etc)
   ↓
2. Se não autenticado → Alert "Por favor, faça login"
   ↓
3. Widget abre, modal maximiza
   ↓
4. Loading: Busca/cria conversa com loja
   ↓
5. Carrega histórico de mensagens
   ↓
6. Exibe empty state OU histórico existente
   ↓
7. Cliente digita mensagem
   ↓
8. Clica ✓ ou pressiona Enter
   ↓
9. Mensagem enviada, novo evento recebido
   ↓
10. Pode minimizar [▼] ou fechar [×]
```

### Lojista Vendo Mensagens
```
1. Badge vermelho mostra 3 mensagens não lidas
   ↓
2. Clica em 💬
   ↓
3. Widget abre com todas as conversas
   ↓
4. Lojista pode responder cada uma
   ↓
5. Badge atualiza em tempo real (Socket.io)
   ↓
6. Pode minimizar para continuar navegando
```

---

## Cores Utilizadas

| Uso | Cor | Hex |
|-----|-----|-----|
| Primary (Header, Botões) | Roxo | #667eea |
| Primary Hover | Roxo escuro | #5568d3 |
| Background Mensagens | Cinza claro | #f8f9fa |
| Badge/Unread | Vermelho | #dc3545 |
| Mensagem Cliente | Roxo (same primary) | #667eea |
| Mensagem Loja | Branco | #ffffff |
| Texto principal | Cinza escuro | #333333 |
| Texto secundário | Cinza médio | #666666 |
| Placeholder | Cinza claro | #999999 |

---

## Tipografia

| Elemento | Size | Weight | Color |
|----------|------|--------|-------|
| Título | 16px | 700 | white |
| Subtítulo | 12px | 400 | white opacity 0.9 |
| Mensagens | 13px | 400 | #333 ou white |
| Timestamps | 11px | 400 | opacity 0.7 |
| Input Placeholder | 13px | 400 | #666 |

---

## Spacing & Layout

| Propriedade | Valor |
|-------------|-------|
| Widget Bottom | 20px |
| Widget Right | 20px |
| Header Padding | 16px 20px |
| Messages Padding | 16px |
| Message Gap | 12px |
| Input Padding | 12px 16px |
| Border Radius | 6-12px |
| Max Width | 380px |
| Min Height | 60px |
| Max Height | 500px (ou 80vh mobile) |

---

## Acessibilidade

- ✅ Botões com `title` para tooltip
- ✅ Focus visível em inputs
- ✅ Contraste cores WCAG AA
- ✅ Texto alternativo em emojis (intuitivo)
- ✅ Suporta Enter para enviar
- ✅ Sem abuso de animações

---

Esta guia serve como referência para UI/UX do Chat Widget em todas as páginas do site.
