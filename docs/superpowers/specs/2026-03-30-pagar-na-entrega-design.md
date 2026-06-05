# Pagar na Entrega + Reserva Bloqueada — DROP

**Data:** 2026-03-30
**Status:** Aprovado

---

## Contexto

O checkout já exibe "Dinheiro na Entrega" como opção, mas o backend trata todos os pedidos da mesma forma: debita a carteira do cliente na criação. Isso faz o fluxo quebrar para quem não tem saldo.

O objetivo é:
1. Implementar o fluxo completo de "pagar na entrega" (sem débito antecipado)
2. Garantir compensação ao motoboy em caso de cancelamento tardio via reserva bloqueada na carteira da loja
3. Registrar dívida no cliente que cancelar após pickup e cobrar automaticamente no próximo pedido

---

## Regras de Negócio

- **Gatilho de pagamento**: quando o motoboy insere o PIN de entrega, o sistema executa a distribuição financeira (crédito loja + comissão app)
- **Garantia da loja**: ao aceitar um pedido `cash_on_delivery`, a loja bloqueia `lateCancellationFeePercent`% do total. Se não tiver saldo suficiente, não pode aceitar o pedido
- **Cancelamento tardio — cliente**: sem revert (nada foi pago). Fee sai do `blockedBalance` da loja → motoboy + AppCashbox. Cria `CustomerDebt` no valor do fee
- **Cancelamento tardio — loja**: debita da wallet da loja (que já tem o valor bloqueado disponível)
- **Cancelamento tardio — motoboy**: igual ao fluxo normal (debita da wallet do motoboy)
- **Cobrança da dívida**: no próximo pedido do cliente (qualquer método de pagamento), o valor da dívida é somado ao total e debitado da carteira junto. A dívida é marcada como `collected`

---

## Modelos de Dados

### `Order` — alterações

```typescript
paymentMethod?: 'credit_card' | 'debit_card' | 'pix' | 'money' | 'cash_on_delivery'
debtCollected?: number  // valor de dívida cobrada nesse pedido (para exibir no recibo)
```

> Manter `'money'` no enum por compatibilidade com pedidos existentes. Novos pedidos usam `'cash_on_delivery'`.

### `Wallet` — alterações

```typescript
blockedBalance: number  // default: 0 — reservado para garantia de fee
```

`balance` representa apenas saldo disponível (livre para saque e novas operações).

### Novo modelo `CustomerDebt`

```typescript
customerId: ObjectId          // ref: User
amount: number                // valor da dívida
sourceOrderId: ObjectId       // pedido que gerou a dívida
collectedOrderId?: ObjectId   // pedido em que foi cobrada
status: 'pending' | 'collected'
reason: string
createdAt: Date
collectedAt?: Date
```

---

## Fluxos de Backend

### `createOrder`

1. Se `paymentMethod === 'cash_on_delivery'`:
   - Não debita carteira do cliente
   - Não calcula nem salva `walletDistribution`
   - Cria pedido com status `'criado'` normalmente
2. **Antes de criar qualquer pedido** (qualquer método de pagamento):
   - Busca `CustomerDebt` com `customerId` e `status: 'pending'`
   - Se existir: soma `debt.amount` ao `totalValue`, debita da carteira do cliente junto com o pedido, credita `debt.amount` na wallet da loja de origem (`debt.sourceOrderId → storeId`), marca dívida como `collected` com `collectedOrderId`, salva `debtCollected` no pedido
   - Se não houver saldo para cobrir pedido + dívida: retorna 400 com mensagem clara indicando o valor total necessário (pedido + dívida)

### `acceptOrderByStore`

Se `order.paymentMethod === 'cash_on_delivery'`:
1. Calcula `requiredBlock = order.totalValue * config.lateCancellationFeePercent / 100`
2. Verifica `storeWallet.balance >= requiredBlock`
3. Se insuficiente: retorna 400 `{ error: 'Saldo insuficiente para garantir pedido de pagamento na entrega', required: requiredBlock, available: storeWallet.balance }`
4. Se suficiente: `storeWallet.balance -= requiredBlock`, `storeWallet.blockedBalance += requiredBlock`

### `confirmDelivery` (motoboy insere PIN)

Se `order.paymentMethod === 'cash_on_delivery'`:
1. Executa distribuição financeira (crédito loja + comissão AppCashbox) — mesma lógica do fluxo normal, mas acontece agora em vez de na criação
2. Libera bloqueio da loja: `storeWallet.blockedBalance -= requiredBlock`, `storeWallet.balance += requiredBlock`

### `cancelOrderByCustomer` — cash_on_delivery após pickup

1. Sem `revertOrderPayment` (nada foi debitado do cliente)
2. Usa `blockedBalance` da loja como fonte do fee:
   - `storeWallet.blockedBalance -= totalFee`
   - Credita `motoboyShare` na wallet do motoboy
   - Credita `appShare` no AppCashbox
3. Cria `CustomerDebt { customerId, amount: totalFee, sourceOrderId, status: 'pending' }`
4. Cancela pedido e delivery normalmente

### `rejectOrderByStore` — cash_on_delivery após pickup

1. Sem `revertOrderPayment` (cliente não pagou nada — sem reembolso a fazer)
2. Fee sai do `blockedBalance` da loja (reservado exatamente para esse fim na aceitação):
   - `storeWallet.blockedBalance -= totalFee`
3. Credita motoboy + AppCashbox normalmente
4. Cancela pedido e delivery

### Cancelamento antes do pickup (qualquer role) — cash_on_delivery

- Sem taxa de cancelamento tardio (motoboy não fez pickup)
- Sem reembolso ao cliente (não pagou nada)
- Libera `blockedBalance` da loja se estava bloqueado: `blockedBalance -= fee`, `balance += fee`

---

## Frontend

### `checkout.tsx`

- Padronizar o `value` da option de `'dinheiro'` para `'cash_on_delivery'`
- Quando `paymentMethod === 'cash_on_delivery'`: ocultar bloco de verificação de saldo (`isWalletInsufficient`)
- Antes de renderizar, fazer `GET /debts/my-pending`
- Se retornar dívida pendente: exibir aviso — "⚠️ Você tem uma multa pendente de R$ X que será cobrada neste pedido"
- Botão de confirmação continua igual

### Novo endpoint `GET /debts/my-pending`

Retorna a dívida pendente do cliente autenticado (ou `null` se não houver).

---

## Novos arquivos

| Arquivo | Descrição |
|---|---|
| `src/models/CustomerDebt.ts` | Novo modelo |
| `src/controllers/debtController.ts` | `GET /my-pending` |
| `src/routes/debts.ts` | Rota autenticada |

## Arquivos modificados

| Arquivo | Mudança |
|---|---|
| `src/models/Order.ts` | Adicionar `cash_on_delivery` ao enum e `debtCollected` |
| `src/models/Wallet.ts` | Adicionar `blockedBalance` |
| `src/controllers/orderController.ts` | `createOrder` com cobrança de dívida |
| `src/controllers/cancellationController.ts` | Fluxos de cancelamento cash_on_delivery |
| `src/controllers/cancellationController.ts` | `confirmDelivery` com distribuição financeira |
| `frontend/pages/checkout.tsx` | Padronizar valor, ocultar saldo check, exibir aviso de dívida |

---

## Verificação

1. Pedido cash_on_delivery criado → carteira do cliente não é debitada
2. Loja aceita com saldo suficiente → `blockedBalance` aumenta
3. Loja tenta aceitar sem saldo → recebe 400
4. Motoboy entrega (PIN) → loja recebe crédito, bloqueio liberado
5. Cliente cancela após pickup → dívida criada, fee sai do blockedBalance da loja para motoboy + app
6. Cliente faz próximo pedido → dívida somada ao total, cobrada junto, marcada como collected
7. Cancelamento antes do pickup → bloqueio liberado, sem taxa
