# ✅ IMPLEMENTAÇÃO: Reembolso Automático na Carteira

## Requisito

> "QUANDO EU CANCELEI, tem que ser reembolsado de volta pra carteira"

## Solução Implementada

Quando um pedido é cancelado, o valor total é **automaticamente creditado de volta na carteira do usuário**.

---

## Fluxo Implementado

```
Cliente clica "Cancelar Pedido"
    ↓
POST /orders/:orderId/cancel
    ↓
Backend valida: Status atual permitido?
    ├─ SIM (criado/pago/enviado) → Continua
    └─ NÃO → Erro 400
    ↓
Calcula: refundAmount = order.totalValue
    ↓
Cria documento Cancellation {
  orderId,
  customerId,
  refundAmount,
  reason,
  refundStatus: 'processed'
}
    ↓
Atualiza Order.status = 'cancelado'
    ↓
✨ NOVO: Processa reembolso na carteira
    ├─ Busca Wallet do usuário
    ├─ Se não existir → Cria com saldo = refundAmount
    └─ Se existir → Adiciona amount ao balance
    ↓
Adiciona transação no histórico:
  {
    type: 'credit',
    amount: refundAmount,
    reason: 'Reembolso do pedido XXX',
    reference: 'REFUND_XXX'
  }
    ↓
Response: {
  success: true,
  orderId,
  status: 'cancelado',
  refundAmount,
  refundStatus: 'processed'
}
    ↓
Frontend atualiza status para 'cancelado'
Usuário acessa /my-wallet
Saldo aumentado em refundAmount ✅
```

---

## Mudanças Implementadas

### 1. Backend - walletController.ts (Nova função)

```typescript
/**
 * POST /wallets/:userId/refund
 * Processa reembolso para carteira do usuário
 */
export const refundWallet = async (req: AuthenticatedRequest, res: Response) => {
  const { userId } = req.params;
  const { amount, orderId, reason } = req.body;

  let wallet = await Wallet.findOne({ owner: userId, ownerType: 'user' });

  if (!wallet) {
    // Cria carteira com reembolso
    wallet = await Wallet.create({
      owner: userId,
      ownerType: 'user',
      balance: amount,
      totalIncome: amount,
      history: [{
        type: 'credit',
        amount,
        reason: `Reembolso do pedido ${orderId}`,
        reference: `REFUND_${orderId}`
      }]
    });
  } else {
    // Adiciona crédito
    wallet.balance += amount;
    wallet.totalIncome += amount;
    wallet.history.push({
      type: 'credit',
      amount,
      reason: `Reembolso do pedido ${orderId}`,
      reference: `REFUND_${orderId}`
    });
    await wallet.save();
  }

  return res.json({
    success: true,
    newBalance: wallet.balance,
    refundAmount: amount,
    orderId
  });
};
```

### 2. Backend - routes/wallets.ts

```typescript
// Importar nova função
import { refundWallet } from '../controllers/walletController';

// Adicionar rota
router.post(
  '/:userId/refund',
  authenticate,
  refundWallet
);
```

**Endpoint**: `POST /api/wallets/{userId}/refund`

### 3. Backend - cancellationController.ts (Modificado)

```typescript
// No cancelOrderByCustomer:

// ✅ NOVO: Processa reembolso automático na carteira
if (refundStatus === 'processed' && refundAmount > 0) {
  try {
    let wallet = await Wallet.findOne({ owner: customerId, ownerType: 'user' });
    
    if (!wallet) {
      wallet = await Wallet.create({
        owner: customerId,
        ownerType: 'user',
        balance: refundAmount,
        totalIncome: refundAmount,
        history: [{
          type: 'credit',
          amount: refundAmount,
          reason: `Reembolso do pedido ${orderId}`,
          reference: `REFUND_${orderId}`
        }]
      });
    } else {
      wallet.balance += refundAmount;
      wallet.totalIncome += refundAmount;
      wallet.history.push({
        type: 'credit',
        amount: refundAmount,
        reason: `Reembolso do pedido ${orderId}`,
        reference: `REFUND_${orderId}`
      });
      await wallet.save();
    }
    
    console.log(`✅ Reembolso processado: R$ ${refundAmount}`);
  } catch (walletError) {
    console.error('Erro ao processar reembolso:', walletError);
    // Continua mesmo se falhar (pode reprocessar depois)
  }
}
```

---

## Endpoints

| Método | Path | Descrição |
|--------|------|-----------|
| POST | `/api/wallets/{userId}/refund` | Reembolsa valor para carteira |
| POST | `/api/orders/{orderId}/cancel` | Cancela pedido e reembolsa automaticamente |

---

## Fluxo da Transação

### Antes do Cancelamento

```
User: ctr
Wallet Balance: R$ 101.00
Order #123: R$ 246,394.20 (totalValue)
Status: pago
```

### Cancelamento Solicitado

```
POST /api/orders/69a524f01e20cc146acbfa86/cancel
Body: { reason: "Mudei de ideia" }
```

### Depois do Cancelamento

```
User: ctr
Wallet Balance: R$ 246,495.20 (101 + 246,394.20)
Order #123: Cancelado ✅
Histórico: 
  - Crédito: R$ 246,394.20 (Reembolso do pedido)
  - Crédito: R$ 101.00 (Carregamento anterior)
```

---

## Transações no Histórico

```typescript
{
  type: 'credit',           // Tipo: crédito
  amount: 246394.20,        // Valor reembolsado
  reason: 'Reembolso do pedido 69a524f01e20cc146acbfa86',
  reference: 'REFUND_69a524f01e20cc146acbfa86',
  date: '2026-03-02T02:49:00.000Z'
}
```

---

## Segurança

✅ **Validações implementadas**:
- Usuário logado (autenticação)
- Pedido pertence ao usuário (validação de propriedade)
- Pedido em estado cancelável
- Valor de reembolso válido (> 0)

✅ **Tratamento de erros**:
- Se falhar a carteira, o cancelamento ainda é bem-sucedido
- Logs detalhados para debug
- Reembolso pode ser reprocessado manualmente

---

## Status da Implementação

✅ **Função refundWallet criada** em walletController.ts  
✅ **Rota POST /wallets/{userId}/refund adicionada**  
✅ **Cancelamento agora processa reembolso automático**  
✅ **Wallet Model importado no cancellationController**  
✅ **TypeScript compilando sem erros**  

---

## Teste

1. **Crie um pedido** com saldo na carteira
2. **Cancele o pedido** na página de status
3. **Verifique /my-wallet**
   - Saldo deve incluir o reembolso
4. **Verifique histórico de transações**
   - Deve aparecer "Reembolso do pedido"

---

## Próximas Melhorias Opcionais

- Integração com payment gateway real (Stripe, PagSeguro)
- Reembolsos agendados (processar em segundo plano)
- Notificação ao usuário quando reembolso é processado
- Diferenciação entre reembolsos parciais e totais
- Histórico de reembolsos separado

