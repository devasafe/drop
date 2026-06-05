# ✅ GUIA RÁPIDO DE TESTE - FLUXO WEBSOCKET CORRIGIDO

## 🎯 Objetivo
Testar o fluxo completo de checkout com atualizações automáticas via WebSocket (SEM precisar dar F5)

---

## 🚀 Como Executar

### Terminal 1 - Backend
```bash
cd d:\PROJETOS\Drop
npm run dev
```

### Terminal 2 - Frontend
```bash
cd d:\PROJETOS\Drop\frontend
npm run dev
```

Aguarde até que ambos estejam prontos (localhost:4000 e localhost:3000)

---

## 📋 Teste Passo a Passo

### Preparação: Abrir 3 Abas do Navegador

1. **Aba 1 - CLIENTE**: `http://localhost:3000`
   - Faz login como cliente
   - Vai para checkout

2. **Aba 2 - LOJA**: `http://localhost:3000/seller/dashboard`
   - Faz login como lojista
   - Aguarda novos pedidos

3. **Aba 3 - MOTOBOY**: `http://localhost:3000/motoboy`
   - Faz login como motoboy
   - Aguarda novas entregas

---

## ✅ Execução do Fluxo

### ETAPA 1: Cliente Compra
**Aba 1 (CLIENTE)**
- [ ] Selecione uma loja
- [ ] Selecione 1 produto
- [ ] Preencha endereço
- [ ] Clique em "Finalizar Compra"

**Resultado Esperado**:
- ✅ Aba 1: Vê confirmação do pedido
- ✅ Aba 2: **SEM RECARREGAR**, loja recebe notificação "🔔 Novo pedido"
- ✅ Aba 2: Pedido aparece na lista de "Pedidos Pendentes"

---

### ETAPA 2: Loja Aceita Pedido
**Aba 2 (LOJA)**
- [ ] Veja o novo pedido na lista
- [ ] Clique em "✅ Aceitar Pedido"

**Resultado Esperado**:
- ✅ Aba 2: Pedido desaparece de "Pendentes" e vai para "Em Andamento"
- ✅ Aba 3: **SEM RECARREGAR**, motoboy vê "📦 Nova entrega disponível"
- ✅ Aba 1: **SEM RECARREGAR**, cliente vê "⏳ Aguardando motoboy aceitar"

---

### ETAPA 3: Motoboy Aceita Entrega
**Aba 3 (MOTOBOY)**
- [ ] Veja a entrega disponível
- [ ] Clique em "Aceitar Entrega"

**Resultado Esperado**:
- ✅ Aba 3: Entrega desaparece de "Disponíveis"
- ✅ Aba 1: **SEM RECARREGAR**, cliente vê:
  - "🏍️ João está a caminho para a loja!"
  - Código PIN de retirada aparece
- ✅ Aba 2: **SEM RECARREGAR**, loja vê "Motoboy: João"

---

### ETAPA 4: Motoboy Vai para Loja
**Aba 3 (MOTOBOY)**
- [ ] Clique no botão de localização
- [ ] Aceite compartilhar localização
- [ ] Dirija-se para as coordenadas da loja (no mapa)

**Resultado Esperado**:
- ✅ Motoboy vê rota até a loja
- ✅ Aba 3: Quando chegar perto, PIN de retirada aparece

---

### ETAPA 5: Motoboy Pega o PIN
**Aba 3 (MOTOBOY)**
- [ ] Note o código PIN (ex: "1234")
- Este é o PIN que a loja vai validar

---

### ETAPA 6: Loja Valida PIN
**Aba 2 (LOJA)**
- [ ] No pedido em andamento, veja o campo "Validar PIN de Retirada"
- [ ] Insira o PIN que o motoboy apresentou
- [ ] Clique em "✅ Validar PIN"

**Resultado Esperado**:
- ✅ Aba 2: Pedido se move para "Histórico" (entregue)
- ✅ Aba 1: **SEM RECARREGAR**, cliente vê "🚗 Motoboy retirou seu pedido"
- ✅ Aba 3: **SEM RECARREGAR**, motoboy vê "✅ PIN validado com sucesso"

---

### ETAPA 7: Motoboy Vai para Cliente
**Aba 3 (MOTOBOY)**
- [ ] Aguarde o mapa recalcular rota para o cliente
- [ ] Dirija-se para as coordenadas do cliente

**Resultado Esperado**:
- ✅ Mapa mostra rota até o cliente
- ✅ Aba 1: **SEM RECARREGAR**, cliente vê localização do motoboy se atualizando

---

### ETAPA 8: Motoboy Entrega
**Aba 3 (MOTOBOY)**
- [ ] Clique em "Confirmar Entrega"
- [ ] Insira o PIN que o cliente lhe forneceu

**Resultado Esperado**:
- ✅ Aba 3: Mensagem de sucesso "Entrega finalizada!"
- ✅ Aba 1: **SEM RECARREGAR**, cliente vê "✅ Entrega Finalizada"
- ✅ Aba 1: Campo para "Avaliar Entrega" aparece

---

## 🔍 Como Verificar se está Funcionando

### Console do Navegador (F12)

**Aba 1 (CLIENTE)**:
```javascript
✅ [Socket] Loja aceitou o pedido: {...}
🏍️ [Socket] Motoboy atribuído: {...}
🚗 [Socket] Pedido retirado: {...}
```

**Aba 2 (LOJA)**:
```javascript
✅ [Socket] Pedido retirado (PIN validado): {...}
```

**Aba 3 (MOTOBOY)**:
```javascript
✅ [Socket] PIN validado: {...}
```

---

## 🐛 Se Não Funcionar

### Socket não conecta?
1. Verifique se backend está rodando na porta 4000
2. Abra DevTools → Network → WS
3. Procure por `socket.io` - deve estar conectado

### Não recebe eventos?
1. Abra DevTools → Console
2. Procure por erros com `[Socket]`
3. Verifique logs do backend no Terminal 1

### Evento chegou mas UI não atualizou?
1. Pode ser cache - tente Ctrl+Shift+R
2. Verifique se o listener está adicionado no hook

---

## 📊 Checklist Final

- [ ] **Loja recebe novo pedido automaticamente** (etapa 1)
- [ ] **Cliente vê aceitação automaticamente** (etapa 2)
- [ ] **Motoboy recebe entrega automaticamente** (etapa 3)
- [ ] **Cliente vê motoboy automaticamente** (etapa 3)
- [ ] **Loja vê motoboy automaticamente** (etapa 3)
- [ ] **Cliente vê retirada automaticamente** (etapa 6)
- [ ] **Loja move para histórico automaticamente** (etapa 6)
- [ ] **Motoboy vê PIN validado automaticamente** (etapa 6)
- [ ] **Tudo funciona SEM dar F5 em nenhuma etapa**

---

## 🎉 Se Tudo Passou

**Parabéns!** WebSocket está **100% funcional** para o fluxo de checkout.

Próximas features:
- [ ] Notificações com som
- [ ] Real-time location tracking com mapa ao vivo
- [ ] Ratings & Evaluations
- [ ] Histórico de deliveries

---

**Status**: ✅ PRONTO PARA TESTAR
**Data**: 25/02/2026

