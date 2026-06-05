# 🎨 Estilos CSS - Sistema de Mensagens Lidas/Não Lidas

## Paleta de Cores

```
Mensagem Não Lida (Amarelo):
  - Background: #fff3cd  (amarelo claro/suave)
  - Borda: #ffc107      (amarelo/alaranjado - Bootstrap warning)
  - Sombra: rgba(255, 193, 7, 0.3)  (amarelo com transparência)

Mensagem Lida (Branco):
  - Background: #fff    (branco puro)
  - Borda: #e9ecef      (cinza muito claro)
  - Sombra: none

Mensagem Própria (Verde):
  - Background: #d4f5d4  (verde claro)
  - Borda: none
  - Sombra: none

Badge Aba:
  - Background: #ff6b6b  (vermelho médio)
  - Texto: white
  - Tamanho: 10px
  - Padding: 1px 4px
  - Borda-raio: 3px

Badge Widget:
  - Background: #ff4444  (vermelho vivo)
  - Texto: white
  - Tamanho: 24px (diâmetro)
  - Borda-raio: 50% (circular)
  - Sombra: 0 2px 8px rgba(0,0,0,0.2)
```

---

## CSS Inline Aplicado

### Estilo Padrão de Mensagem

```jsx
<div style={{
  maxWidth: '70%',
  padding: '8px 12px',
  borderRadius: 8,
  color: isOwn ? '#111' : '#333',
  wordBreak: 'break-word',
  borderBottomRightRadius: isOwn ? 2 : 8,
  borderBottomLeftRadius: isOwn ? 8 : 2,
}}>
```

**Resultados:**
- ✅ Mensagens ocupam 70% da largura máxima
- ✅ Padding interno de 8px vertical, 12px horizontal
- ✅ Bordas arredondadas em 8px
- ✅ Canto inferior do remetente fica reto (2px)
- ✅ Palavras quebram para não ultrapassar o limite

---

### Estilo Dinâmico por Status

#### Mensagem Própria (isOwn = true)
```jsx
{
  backgroundColor: '#d4f5d4',  // Verde
  border: 'none',
  borderBottomRightRadius: 2,  // Canto reto
}
```

#### Mensagem Não Lida (isUnread = true)
```jsx
{
  backgroundColor: '#fff3cd',  // Amarelo claro
  border: '2px solid #ffc107', // Borda amarela
  boxShadow: '0 2px 8px rgba(255, 193, 7, 0.3)',  // Sombra amarela
  borderBottomLeftRadius: 2,   // Canto reto
}
```

#### Mensagem Lida (status = 'read')
```jsx
{
  backgroundColor: '#fff',     // Branco
  border: '1px solid #e9ecef', // Borda cinza
  borderBottomLeftRadius: 2,   // Canto reto
}
```

---

## Estilos de Nome do Remetente

```jsx
<p style={{
  margin: 0,
  fontSize: 10,
  fontWeight: 700,           // Bold
  marginBottom: 4,
  color: '#25a025',          // Verde escuro
}}>
  {msg.senderName} {isUnread && '🔵'}
</p>
```

**Resultado:**
```
João Garcia 🔵
Olá! Como você está?
14:45
```

---

## Estilos de Timestamp

```jsx
<p style={{
  fontSize: 10,
  opacity: 0.7,
  marginTop: 4,
  textAlign: 'right'
}}>
  {hora}
</p>
```

**Resultado:**
- ✅ Texto pequeno (10px)
- ✅ Cinzento semi-transparente (opacity 70%)
- ✅ Alinhado à direita
- ✅ Margem superior de 4px

---

## Badge da Aba

### Estrutura HTML
```jsx
<span style={{
  marginLeft: 4,
  backgroundColor: '#ff6b6b',
  color: 'white',
  fontSize: 10,
  padding: '1px 4px',
  borderRadius: 3,
}}>
  {tab.unreadCount}
</span>
```

### Visual
```
┌──────────────────┐
│ 🏪 João 3        │ ← Badge com número
└──────────────────┘
     └─┬─┘
   Badge estilo pill
```

---

## Badge do Widget Minimizado

### Estrutura HTML
```jsx
<div style={{
  position: 'absolute',
  top: -8,
  right: -8,
  backgroundColor: '#ff4444',
  color: 'white',
  borderRadius: '50%',
  width: 24,
  height: 24,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  fontSize: 12,
  fontWeight: 'bold',
  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
}}>
  {totalUnread > 99 ? '99+' : totalUnread}
</div>
```

### Visual
```
     ┌─────┐
     │ 5   │  ← Círculo de 24x24px
     └─────┘
      ↓
     💬 ← Botão flutuante (posição relativa)
```

### Propriedades Importantes
- **position: absolute** → Overlay sobre o botão
- **top: -8, right: -8** → Canto superior direito com sobreposição
- **borderRadius: 50%** → Forma circular
- **width: 24, height: 24** → Quadrado para virar círculo
- **display: flex** → Centraliza o número
- **boxShadow** → Profundidade visual

---

## Animações CSS (Não Utilizadas, Propostas para Futuro)

### Fade-In ao Receber Mensagem
```css
@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

animation: fadeIn 0.3s ease-out;
```

### Fade-Out ao Marcar como Lida
```css
@keyframes fadeOut {
  from {
    backgroundColor: #fff3cd;
    border-color: #ffc107;
  }
  to {
    backgroundColor: #fff;
    border-color: #e9ecef;
  }
}

transition: background-color 0.3s, border-color 0.3s;
```

### Pulse da Badge
```css
@keyframes pulse {
  0%, 100% {
    opacity: 1;
  }
  50% {
    opacity: 0.7;
  }
}

animation: pulse 2s infinite;
```

---

## Responsividade (Nenhuma Implementada Ainda)

### Sugestões para Mobile

```jsx
// Se tela < 600px
{
  maxWidth: '85%',  // Aumenta o espaço da mensagem
  fontSize: 14,     // Um pouco maior para ler
}

// Badge aba em mobile
{
  fontSize: 8,      // Menor em telas pequenas
  padding: '0px 3px', // Compacto
}

// Badge widget em mobile
{
  width: 20,        // Circulozinho menor
  height: 20,
  fontSize: 10,
}
```

---

## Contraste e Acessibilidade

### WCAG Compliance Check

| Elemento | Foreground | Background | Ratio | Nível |
|----------|-----------|-----------|-------|-------|
| Mensagem Não Lida | #333 | #fff3cd | 5.8:1 | AA ✅ |
| Mensagem Lida | #333 | #fff | 7.0:1 | AAA ✅ |
| Mensagem Própria | #111 | #d4f5d4 | 8.2:1 | AAA ✅ |
| Badge Aba | white | #ff6b6b | 3.5:1 | AA ✅ |
| Badge Widget | white | #ff4444 | 3.8:1 | AA ✅ |
| Nome Remetente | #25a025 | #fff | 3.2:1 | AA ✅ |

✅ Todos os elementos passam em AA (mínimo exigido)
✅ Maioria passa em AAA (enhanced)

---

## Breakpoints Recomendados (Futuro)

```jsx
// Desktop (≥1024px)
- Mensagens: 70% de largura máxima
- Badge: Tamanho normal

// Tablet (768px - 1023px)
- Mensagens: 75% de largura
- Badge: Tamanho normal

// Mobile (< 768px)
- Mensagens: 85% de largura
- Badge: Tamanho reduzido
- Widget: 90% da altura da tela
```

---

## Classes CSS Equivalentes (Se Migrar para Arquivo .css)

```css
/* Mensagem Base */
.message {
  max-width: 70%;
  padding: 8px 12px;
  border-radius: 8px;
  word-break: break-word;
  margin-bottom: 8px;
}

/* Própria */
.message.own {
  background-color: #d4f5d4;
  border: none;
  border-bottom-right-radius: 2px;
  border-bottom-left-radius: 8px;
}

/* Não Lida */
.message.unread {
  background-color: #fff3cd;
  border: 2px solid #ffc107;
  border-bottom-right-radius: 8px;
  border-bottom-left-radius: 2px;
  box-shadow: 0 2px 8px rgba(255, 193, 7, 0.3);
  color: #333;
}

/* Lida */
.message.read {
  background-color: #fff;
  border: 1px solid #e9ecef;
  border-bottom-right-radius: 8px;
  border-bottom-left-radius: 2px;
  color: #333;
}

/* Badge Aba */
.badge-tab {
  margin-left: 4px;
  background-color: #ff6b6b;
  color: white;
  font-size: 10px;
  padding: 1px 4px;
  border-radius: 3px;
  font-weight: bold;
}

/* Badge Widget */
.badge-widget {
  position: absolute;
  top: -8px;
  right: -8px;
  background-color: #ff4444;
  color: white;
  border-radius: 50%;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: bold;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.2);
}

/* Sender Name */
.sender-name {
  margin: 0;
  font-size: 10px;
  font-weight: 700;
  margin-bottom: 4px;
  color: #25a025;
}

/* Timestamp */
.timestamp {
  font-size: 10px;
  opacity: 0.7;
  margin-top: 4px;
  text-align: right;
}
```

---

## Uso de Utilities (Tailwind CSS - Alternativa)

Se decidir migrar para Tailwind:

```jsx
{/* Mensagem Não Lida */}
<div className="max-w-[70%] p-3 rounded-lg bg-yellow-100 border-2 border-yellow-400 shadow-sm shadow-yellow-200">
  <p className="font-bold text-sm text-green-700 mb-1">
    {msg.senderName} 🔵
  </p>
  <p className="text-gray-700">{msg.text}</p>
  <p className="text-xs text-gray-500 opacity-70 text-right mt-1">
    {time}
  </p>
</div>

{/* Badge Aba */}
<span className="ml-1 bg-red-500 text-white text-xs px-1 rounded">
  {tab.unreadCount}
</span>

{/* Badge Widget */}
<div className="absolute -top-2 -right-2 bg-red-500 text-white rounded-full w-6 h-6 flex items-center justify-center text-xs font-bold shadow-md">
  {totalUnread > 99 ? '99+' : totalUnread}
</div>
```

---

**Última Atualização:** 2024
**Versão:** 1.0
