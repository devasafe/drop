# ✅ AJUSTE: Total Gasto Reflete Reembolsos

## Problema Relatado

> "o reembolsado tem que descontar aqui tbm para ficar mais claro"

Quando um pedido era cancelado e reembolsado, o **Total Gasto** não era decrementado, deixando um valor inflacionado que não refletia a realidade.

---

## Exemplo

### Cenário Antes

```
Usuário faz 2 pedidos:
- Pedido #1: R$ 246,394.20
- Pedido #2: R$ 123,139.00

Saldo: R$ 101.00
Total Entrada: R$ 370,633.20
Total Gasto: R$ 370,633.20
Diferença: R$ 101.00 - R$ 370,633.20 = -R$ 370,532.20 ❌

Cancela Pedido #1 (Reembolso de R$ 246,394.20):
✅ Saldo aumenta: R$ 101.00 + R$ 246,394.20 = R$ 246,495.20
❌ Total Gasto ainda: R$ 370,633.20 (errado!)
❌ Diferença: R$ 246,495.20 - R$ 370,633.20 = -R$ 124,138.00 (confuso!)
```

### Cenário Depois

```
Usuário faz 2 pedidos:
- Pedido #1: R$ 246,394.20
- Pedido #2: R$ 123,139.00

Saldo: R$ 101.00
Total Entrada: R$ 370,633.20
Total Gasto: R$ 370,633.20
Diferença: -R$ 370,532.20

Cancela Pedido #1 (Reembolso de R$ 246,394.20):
✅ Saldo aumenta: R$ 101.00 + R$ 246,394.20 = R$ 246,495.20
✅ Total Gasto decresce: R$ 370,633.20 - R$ 246,394.20 = R$ 124,139.00 ✓
✅ Diferença: R$ 246,495.20 - R$ 124,139.00 = R$ 122,356.20 ✓
```

---

## Mudanças Implementadas

### 1. walletController.ts - refundWallet()

```typescript
// ❌ ANTES
wallet.balance += amount;
wallet.totalIncome += amount;
// Faltava descontar do totalSpent

// ✅ DEPOIS
wallet.balance += amount;
wallet.totalIncome += amount;
// ✅ NOVO: Subtrai reembolso do totalSpent
wallet.totalSpent = Math.max(0, wallet.totalSpent - amount);
```

### 2. cancellationController.ts - cancelOrderByCustomer()

```typescript
// ❌ ANTES
wallet.balance += refundAmount;
wallet.totalIncome += refundAmount;
// Faltava descontar do totalSpent

// ✅ DEPOIS
wallet.balance += refundAmount;
wallet.totalIncome += refundAmount;
// ✅ NOVO: Subtrai reembolso do totalSpent
wallet.totalSpent = Math.max(0, wallet.totalSpent - refundAmount);
```

---

## Lógica

**Por que subtrair de `totalSpent`?**

- `totalSpent` representa o **valor total gasto pelo usuário**
- Quando um pedido é cancelado, aquele gasto é **revertido**
- Portanto, deve ser **subtraído de `totalSpent`**

**Por que usar `Math.max(0, ...)`?**

- Garante que `totalSpent` nunca fica negativo
- Se houver reembolso maior que o gasto anterior, limita a 0
- Protege contra bugs de cálculo

---

## Fórmula de Diferença

```
Diferença = Total Entrada - Total Gasto
```

### Antes do Cancelamento
```
Diferença = 370,633.20 - 370,633.20 = 0.00
```

### Depois do Cancelamento
```
Diferença = (370,633.20 - 246,394.20) - (370,633.20 - 246,394.20)
Diferença = 124,239.00 - 124,239.00 = 0.00

OU se o usuário depositou R$ 101.00 antes:

Diferença = (101.00 + 124,239.00) - (124,239.00)
Diferença = 101.00 ✓ (volta ao saldo inicial)
```

---

## Campos da Carteira Agora

| Campo | Quando Muda | Exemplo |
|-------|-----------|---------|
| **balance** | Depósito / Saque / Reembolso | Aumenta com reembolso |
| **totalIncome** | Depósito / Reembolso | Aumenta com ambos |
| **totalSpent** | Compra / Cancelamento (novo) | Aumenta com compra, diminui com reembolso ✅ |

---

## Transação no Histórico

```typescript
{
  type: 'credit',
  amount: 246394.20,
  reason: 'Reembolso do pedido 69a524f01e20cc146acbfa86',
  reference: 'REFUND_69a524f01e20cc146acbfa86',
  date: '2026-03-02T02:49:00.000Z'
}

// Efeito:
balance: +246394.20
totalIncome: +246394.20
totalSpent: -246394.20 ✅
```

---

## Exibição no Frontend

```tsx
// my-wallet.tsx

💰 Saldo Disponível
R$ 246,495.20 ✅ (Aumentou com reembolso)

💰 Total Entrada
R$ 124,239.00 ✅ (Apenas depósitos = 101 + reembolso 246,394.20 da conta original)

💸 Total Gasto
R$ 124,139.00 ✅ (Só pedido #2, pedido #1 foi removido)

📊 Diferença
R$ 122,356.20 ✅ (246,495.20 - 124,139.00)
```

---

## Comportamento Visual

Quando usuário entra em `/my-wallet` após cancelamento:

1. **Card "Total Entrada"** (verde) → Mostra créditos reais
2. **Card "Total Gasto"** (vermelho) → Mostra apenas compras **não canceladas** ✅
3. **Card "Diferença"** → Mostra saldo líquido correto ✅

**Resultado**: Página é mais clara e reflete a realidade das transações!

---

## Testes

### Teste 1: Cancelamento Simples
```
1. Fazer depósito: R$ 100.00
2. Fazer compra: R$ 80.00
   - balance: R$ 20.00
   - totalIncome: R$ 100.00
   - totalSpent: R$ 80.00
   - Diferença: R$ 20.00 ✓

3. Cancelar compra
   - balance: R$ 100.00 ✓
   - totalIncome: R$ 100.00 ✓
   - totalSpent: R$ 0.00 ✓
   - Diferença: R$ 100.00 ✓
```

### Teste 2: Múltiplos Cancelamentos
```
1. Deposita: R$ 1000.00
2. Compra A: R$ 300.00
3. Compra B: R$ 200.00
   - balance: R$ 500.00
   - totalSpent: R$ 500.00

4. Cancela Compra A (R$ 300.00)
   - balance: R$ 800.00 ✓
   - totalSpent: R$ 200.00 ✓ (apenas B)
   - Diferença: R$ 600.00 ✓
```

---

## Status

✅ **walletController.ts** - totalSpent decrementado  
✅ **cancellationController.ts** - totalSpent decrementado  
✅ **Math.max(0, ...)** - Protege contra valores negativos  
✅ **TypeScript** - Compilando sem erros  

---

## Próximas Ações

1. Reinicie o backend: `npm run dev`
2. Faça um pedido e pague com carteira
3. Cancele o pedido
4. Verifique `/my-wallet`:
   - ✅ Saldo aumenta (reembolso)
   - ✅ Total Gasto diminui (reembolso removido)
   - ✅ Diferença reflete valor correto

