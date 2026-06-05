# 🧪 CHECKLIST DE TESTES - Sistema de Comissões

**Data:** 12 de Março de 2026  
**Responsável:** CEO / QA  
**Status:** PRONTO PARA TESTAR

---

## ✅ PRÉ-REQUISITOS

- [ ] Backend rodando e sem erros de compilação
- [ ] MongoDB conectado e funcionando
- [ ] Frontend rodando
- [ ] Console do servidor aberto (para ver logs)
- [ ] Contas de teste criadas:
  - [ ] CEO
  - [ ] LOJA
  - [ ] CLIENTE
  - [ ] MOTOBOY (opcional, para testes avançados)

---

## 📊 TESTE 1: ACEITAR PEDIDO (Fluxo Principal)

### Setup Inicial
- [ ] Login como CEO
- [ ] Verificar AppCashbox saldo atual: `______ R$`
- [ ] Logout

### Criar Pedido
- [ ] Login como CLIENTE
- [ ] Ir para "🏠 Produtos"
- [ ] Selecionar LOJA: `"lj"` (ou qual estiver)
- [ ] Adicionar produto: `"Teste Comissão"` (R$ 100)
- [ ] Quantidade: `1`
- [ ] Adicionar ao carrinho
- [ ] Ir para Checkout
- [ ] Delivery distance: `5 km`
- [ ] Pagar com: `"Saldo da Carteira"` ou `"Cartão de Crédito"`
- [ ] Clique em "CONFIRMAR PEDIDO"
- [ ] Verificar mensagem de sucesso: `"Pedido criado com sucesso!"`
- [ ] **Copiar Order ID:** `________________________`

### Aceitar Pedido (Loja)
- [ ] Login como LOJA
- [ ] Ir para "🏠 Produtos" → "📋 Pedidos"
- [ ] Procurar pedido criado acima
- [ ] **IMPORTANTE:** Verificar console do servidor (deve mostrar logs)
- [ ] Clicar em "✅ ACEITAR PEDIDO"
- [ ] Inserir distância: `5` km
- [ ] Clicar em "Confirmar"

### Verificar Logs do Servidor
Procurar por:
```
🔍 [acceptOrder] REGISTRANDO COMISSÃO DE ENTREGA:
   📦 Produto total: R$ ______
   🚗 Taxa de entrega: R$ ______
   📍 Distância: 5km
```

- [ ] Logs aparecem? **SIM / NÃO**
- [ ] Mostra "DISTRIBUIÇÃO CALCULADA"? **SIM / NÃO**
- [ ] Mostra "✅ COMISSÃO DE ENTREGA REGISTRADA COM SUCESSO!"? **SIM / NÃO**

### Verificar AppCashbox (CEO)
- [ ] Logout como loja
- [ ] Login como CEO
- [ ] Ir para "💳 Caixa do App"
- [ ] Saldo atual deve ter aumentado
  - **Antes:** `R$ ____`
  - **Depois:** `R$ ____`
  - **Diferença esperada:** `R$ +17` (R$ 15 produto + R$ 2 entrega)
  - **Diferença real:** `R$ ______` ✅ / ❌

### Verificar Histórico de Movimentações
- [ ] Última movimentação é "Comissão de Entrega"? **SIM / NÃO**
- [ ] Valor é ~R$ 2.00? **SIM / NÃO**
- [ ] Data/Hora está correta? **SIM / NÃO**
- [ ] Antes dela existe "Comissão de Produto" (R$ 15)? **SIM / NÃO**

---

## 📊 TESTE 2: REJEITAR PEDIDO

### Setup
- [ ] Login como CEO
- [ ] Anotar AppCashbox saldo: `R$ ____`
- [ ] Logout

### Criar Novo Pedido
- [ ] Login como CLIENTE
- [ ] Criar novo pedido (produto R$ 50, distância 3km)
- [ ] **Copiar Order ID:** `________________________`
- [ ] Logout

### Rejeitar Pedido (Loja)
- [ ] Login como LOJA
- [ ] Ir para "📋 Pedidos"
- [ ] Procurar pedido criado
- [ ] Clicar em "❌ REJEITAR PEDIDO"
- [ ] **Verificar console do servidor** para logs
- [ ] Procurar por:
  ```
  🔍 [rejectOrder] REGISTRANDO COMISSÃO DE ENTREGA:
  ```
- [ ] Logs aparecem? **SIM / NÃO**
- [ ] Mostra "✅ COMISSÃO DE ENTREGA REGISTRADA COM SUCESSO!"? **SIM / NÃO**

### Verificar AppCashbox
- [ ] Login como CEO
- [ ] Ir para "💳 Caixa do App"
- [ ] Saldo deve ter aumentado novamente
  - **Antes:** `R$ ____`
  - **Depois:** `R$ ____`
  - **Diferença esperada:** `~R$ +10` (produto R$ 50 × 15% + entrega)
  - **Diferença real:** `R$ ______` ✅ / ❌
- [ ] Histórico mostra nova "Comissão de Entrega"? **SIM / NÃO**

---

## 📊 TESTE 3: CRIAR DELIVERY EXPLÍCITA

### Setup
- [ ] Usar um dos pedidos criados nos testes 1 ou 2
- [ ] Verificar que delivery já existe (foi criada ao aceitar/rejeitar)
- [ ] Este teste verifica o caminho alternativo

### Criar Delivery
- [ ] Login como LOJA
- [ ] Ir para "📋 Pedidos"
- [ ] Selecionar um pedido ANTIGO (de testes anteriores)
- [ ] Clicar em "➕ Criar Entrega"
- [ ] Inserir distância: `2` km
- [ ] Clicar em "Confirmar"
- [ ] **Verificar console** para logs

### Verificar Logs
- [ ] Procurar por:
  ```
  🔍 [createDelivery] INICIANDO REGISTRO DE COMISSÃO:
  📡 REGISTRANDO COMISSÃO DE ENTREGA: R$ ____
  ✅ COMISSÃO DE ENTREGA REGISTRADA COM SUCESSO!
  ```
- [ ] Logs aparecem? **SIM / NÃO**

---

## 🔢 TESTE 4: VALIDAR CÁLCULOS

### Preencher Valores Reais

**Pedido teste:**
- Produto: R$ `_____`
- Distância: `_____` km
- Taxa base da plataforma: R$ 7 + (R$ 1.5/km)

**Cálculos esperados:**
- Taxa de entrega: 7 + (1.5 × ___) = R$ `_____`
- Comissão produto (15%): _____ × 0.15 = R$ `_____`
- Comissão entrega (20%): _____ × 0.20 = R$ `_____`
- Motoboy líquido (80%): _____ × 0.80 = R$ `_____`

**Verificar nos logs:**
- [ ] Produto App Commission bate? **SIM / NÃO**
- [ ] Entrega App Commission bate? **SIM / NÃO**
- [ ] Motoboy Amount bate? **SIM / NÃO**

**Verificar no AppCashbox:**
- [ ] AppCashbox recebeu: R$ (produto + entrega) = R$ `_____`? **SIM / NÃO**

---

## ⚠️ TESTE 5: CASOS DE ERRO

### Sem Produto
- [ ] Tentar criar pedido sem adicionar produto
- [ ] Deve aparecer erro? **SIM / NÃO**

### Distância 0
- [ ] Criar pedido com distância 0 km
- [ ] Aceitar pedido
- [ ] Comissão de entrega deve ser: 7 + (1.5 × 0) = R$ 7 × 20% = R$ 1.40
- [ ] Verificar nos logs? **SIM / NÃO**

### Pedido Muito Pequeno
- [ ] Criar pedido com produto de R$ 1
- [ ] Aceitar e verificar se comissão registra (1 × 0.15 = R$ 0.15)
- [ ] AppCashbox mostra R$ 0.15? **SIM / NÃO**

---

## 📋 RESUMO FINAL

### Status Geral
- [ ] Teste 1 (Aceitar): **✅ PASSOU / ❌ FALHOU**
- [ ] Teste 2 (Rejeitar): **✅ PASSOU / ❌ FALHOU**
- [ ] Teste 3 (Criar): **✅ PASSOU / ❌ FALHOU**
- [ ] Teste 4 (Cálculos): **✅ PASSOU / ❌ FALHOU**
- [ ] Teste 5 (Erros): **✅ PASSOU / ❌ FALHOU**

### AppCashbox Final
- **Saldo inicial:** R$ `____`
- **Saldo final:** R$ `____`
- **Total acumulado:** R$ `____`
- **Esperado (aprox.):** R$ `____`
- **Match?** **✅ SIM / ❌ NÃO**

### Histórico tem Entradas?
- [ ] Todas as "Comissão de Produto"? **SIM / NÃO**
- [ ] Todas as "Comissão de Entrega"? **SIM / NÃO**
- [ ] Ordem cronológica? **SIM / NÃO**

---

## 🎯 RESULTADO

Se TODOS os checkboxes estão marcados:

### ✅ SISTEMA FUNCIONANDO PERFEITAMENTE! 🎉

```
Comissões de Entrega: ✅ OPERACIONAL
AppCashbox: ✅ ACUMULANDO CORRETAMENTE
Logs: ✅ DETALHADOS
Cálculos: ✅ PRECISOS
CEO Dashboard: ✅ TUDO VISÍVEL
```

---

## ❌ SE ALGO FALHAR

1. **Copie os logs completos** do servidor
2. **Anote qual teste falhou**
3. **Indique qual passo não funcionou**
4. **Mande uma screenshot** se possível
5. **Mande para análise:**

```
Teste que Falhou: _____________
Passo: _____________
Erro Mensagem: _____________
Logs:
[COLE AQUI]
```

---

**Data da Conclusão dos Testes:** `___ / ___ / 2026`  
**Responsável:** `_________________`  
**Assinatura:** `_________________`

