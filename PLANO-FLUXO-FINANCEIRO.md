# Plano: Fluxo financeiro centralizado (AppCashbox-first + Payouts)

## Contexto

Hoje no DROP, quando um cliente paga um pedido, o dinheiro é distribuído **imediatamente**: a loja é creditada direto na `Wallet` dela (`orderController.ts:256-288`), a comissão vai pro `AppCashbox`, e o motoboy é creditado só depois que finaliza a entrega (`deliveryController.ts:315-351`). Isso gera três problemas concretos:

1. **Devoluções são frágeis** — se a loja já sacou quando chega uma devolução, ela pode ir pra saldo negativo (hoje protegido por `Math.max(0, balance-amount)` em `wallet.service.ts:130,150`, mascarando o problema).
2. **Auditoria fragmentada** — dinheiro vive em várias carteiras; não dá pra olhar um lugar e entender o caixa real da plataforma.
3. **AppCashbox mente** — `AppCashbox.balance` representa só comissões acumuladas, não o dinheiro que a plataforma efetivamente custodia.

O novo modelo (inspirado em Stripe Connect / Pagar.me Marketplace): **todo dinheiro entra no `AppCashbox`; loja e motoboy só têm "obrigações a receber" (`Payout`s)** que viram dinheiro disponível na entrega, e o saque debita essas obrigações + transfere pro banco via gateway plugável (começando com gateway Manual — CEO confirma pagamento à mão; adapter ready pra Asaas/Pagar.me no futuro).

**Decisões locked com o usuário:**
- **Release imediato na entrega** — sem período de hold.
- **Banco de dados zerado antes de subir** — projeto ainda sem clientes, não precisa de migração nem feature flag.
- **Gateway abstrato agora + `ManualGateway` default** — arquitetura preparada; integração real (Asaas/Pagar.me) é outro projeto.

---

## Modelos novos e alterados

### 1. Novo modelo: `src/models/Payout.ts`

Representa uma obrigação da plataforma de pagar um lojista ou motoboy.

```ts
{
  _id: ObjectId,
  recipientType: 'store' | 'motoboy',
  recipientId: ObjectId,                // storeId ou motoboyId (User)
  orderId: ObjectId,                    // sempre — origem do dinheiro
  deliveryId?: ObjectId,                // só pra payouts de motoboy
  amount: number,                       // valor líquido devido ao parceiro
  currency: 'BRL',
  status: 'pending' | 'released' | 'requested' | 'paid' | 'cancelled',
  releasedAt: Date | null,              // quando virou disponível pra saque
  requestedAt: Date | null,             // quando parceiro pediu saque
  paidAt: Date | null,                  // quando gateway confirmou transferência
  cancelledAt: Date | null,
  cancelReason?: string,
  gatewayProvider: 'manual' | 'asaas' | 'pagarme' | 'efi',
  gatewayTransferId: string | null,     // id retornado pelo gateway
  withdrawalRequestId: ObjectId | null, // link reverso pra WithdrawalRequest
  createdAt, updatedAt,
}
```

Índices: `{recipientType:1, recipientId:1, status:1}`, `{orderId:1}`, `{status:1, releasedAt:1}`, `{withdrawalRequestId:1}`.

### 2. Alteração: `src/models/Wallet.ts`

Adicionar dois campos (default 0, backward-compat):

- `availableBalance: number` — soma dos `Payout`s `released` do dono. Fonte da verdade pra saques.
- `pendingBalance: number` — soma dos `Payout`s `pending`. Visível na UI mas não saca.

O campo `balance` atual fica como **informativo/legacy** (= availableBalance + pendingBalance). Não é mais lido pelo fluxo de saque. Como vamos zerar o DB, não precisa de migração — só de hoje em diante carteiras de `store`/`motoboy` ganham esses valores via `payout.service`.

### 3. Alteração conceitual: `src/models/AppCashbox.ts` (sem mudar schema)

No novo modelo, `AppCashbox.balance` passa a representar **custódia total** (dinheiro de clientes + comissões + obrigações não pagas). A UI precisa mostrar também o **lucro líquido** derivado:

```
platformNet = AppCashbox.balance - sum(Payout.amount where status in ['pending','released','requested'])
```

Isso é calculado em runtime em `/admin/app-cashbox`, sem novo campo.

---

## Serviços novos

### `src/services/payout.service.ts` (novo)

Todas as funções aceitam `session?: ClientSession` pra serem chamadas dentro de transações.

- `createPendingPayout({ recipientType, recipientId, orderId, deliveryId?, amount, session })`
  - Cria doc `Payout` com status `pending`
  - `wallet.pendingBalance += amount`
- `releasePayout(payoutId, session)` — `pending` → `released`; move `wallet.pendingBalance` → `wallet.availableBalance`
- `releasePayoutsForOrder(orderId, session)` — libera todos `Payout`s daquele pedido (chamado quando pedido vai pra `entregue`)
- `cancelPayoutsForOrder(orderId, reason, session)` — cancela todos `Payout`s do pedido:
  - Se `pending`: subtrai de `pendingBalance`
  - Se `released`: subtrai de `availableBalance` (pode resultar em saldo insuficiente — retorna erro estruturado pra quem chamou decidir)
  - Se `requested`/`paid`: não dá pra cancelar automaticamente — retorna erro (caso raro, fluxo manual)
- `markPayoutsRequested(payoutIds, withdrawalRequestId, session)` — `released` → `requested`; decrementa `availableBalance`
- `markPayoutsPaid(payoutIds, gatewayTransferId, session)` — `requested` → `paid`; decrementa `AppCashbox.balance`
- `listAvailablePayouts(recipientType, recipientId)` — retorna `Payout`s `released` pro saque
- `getWalletBalanceSnapshot(recipientType, recipientId)` — retorna `{ available, pending, total }` (usado pelo frontend/admin)

### `src/services/payoutGateway/` (novo diretório)

Abstração plugável pra transferência bancária.

- **`types.ts`** — interfaces `BankInfo`, `IPayoutGateway`, `TransferInput`, `TransferResult`
- **`manualGateway.ts`** — implementa `IPayoutGateway` com comportamento no-op:
  - `transfer()` gera `gatewayTransferId = 'manual_' + crypto.randomUUID()` e retorna `{ status: 'pending' }`
  - `getStatus()` retorna sempre o que está no DB (é o que o CEO mudou manualmente)
- **`index.ts`** — exporta `getPayoutGateway()`:
  ```ts
  const provider = env.PAYOUT_GATEWAY || 'manual';
  switch (provider) {
    case 'manual': return new ManualGateway();
    // case 'asaas': return new AsaasGateway(env.ASAAS_API_KEY);  // TODO futuro
    // case 'pagarme': return new PagarmeGateway(...);            // TODO futuro
    default: throw new Error(`Gateway ${provider} não implementado`);
  }
  ```
- Adicionar `PAYOUT_GATEWAY=manual` em `src/config/env.ts` com default `'manual'`.

---

## Alterações nos controllers existentes

### `src/controllers/orderController.ts` — função `createOrder` (L63-455)

Hoje, dentro da transação Mongo (L64-356):
- L229-252: débito cliente ✅ mantém
- **L256-288: crédito loja direto** → **REMOVER**
- L291-315: remessa de dívida pra loja de origem → adaptar pra criar `Payout` também
- L349: order.save → mantém
- L356: commit → mantém
- **L374-423: crédito AppCashbox só da comissão** → **TROCAR** por crédito do **valor total do pedido** no AppCashbox (porque agora o app custodia tudo). Migrar pra dentro da transação pra garantir atomicidade.

Novo fluxo dentro da mesma session:
1. Debita cliente (igual hoje).
2. Incrementa `AppCashbox.balance += totalValue` com histórico de source `order_payment` (novo enum valor — adicionar ao schema).
3. Chama `payoutService.createPendingPayout({ recipientType:'store', recipientId:storeId, orderId, amount: distribution.storeAmount, session })`.
4. Se houver fee de motoboy no distribution, cria `Payout` pendente pra motoboy também (recipientId fica `null` até a entrega ser atribuída; alternativa: criar o payout de motoboy só na finalização — **decisão: criar só na finalização** pra evitar payout órfão).
5. Salva `order` com `walletDistribution` (snapshot continua útil).
6. Commit.

Adicionar `'order_payment'` e `'order_refund'` ao enum de `AppCashboxHistorySchema.source`.

### `src/controllers/deliveryController.ts` — `finalizarEntrega` (L315-351)

Hoje chama `walletService.creditMotoboy()` direto. Substituir por:

1. `payoutService.createPendingPayout({ recipientType:'motoboy', recipientId:motoboyId, orderId, deliveryId, amount: motoboyAmount, session })`
2. `payoutService.releasePayoutsForOrder(orderId, session)` — libera tanto o payout da loja (criado no createOrder) quanto o payout do motoboy (criado agora).

Resultado: no momento em que o pedido vira `entregue`, loja e motoboy têm `availableBalance` incrementado. Antes disso, loja tinha só `pendingBalance`.

### `src/controllers/cancellationController.ts` — `cancelOrderByCustomer` (L60-105)

Substituir `walletService.revertOrderPayment(...)` por:

1. Ler todos `Payout`s do pedido.
2. `payoutService.cancelPayoutsForOrder(orderId, 'order_cancelled', session)`
3. Creditar cliente de volta (`clientWallet.balance += totalValue`).
4. Debitar `AppCashbox.balance -= totalValue` com source `order_refund`.
5. Se algum `Payout` já estava `paid` (edge case — devolução pós-saque), retornar erro estruturado `PAYOUT_ALREADY_PAID` — fluxo manual do CEO resolver.

Tratamento de multa por cancelamento tardio (L107-148) continua igual, só muda o ponto de débito: cobra `blockedBalance` (COD) ou `wallet.balance` do cliente (não-COD), sem mexer em `Payout`s já criados.

### `src/controllers/withdrawalController.ts` — reescrita parcial

**`requestWithdrawal` (motoboy solicita saque):**
1. Verificar `wallet.availableBalance >= amount` (não mais `balance`).
2. Selecionar `Payout`s `released` do motoboy, em ordem FIFO (mais antigos primeiro), até somar `amount` (pode precisar "dividir" um payout — decisão: **não dividir**, pegar payouts inteiros até cobrir, e retornar erro `AMOUNT_NOT_EXACT` se não fechar bate; cliente da API ajusta valor. Simplifica muito.).
3. Criar `WithdrawalRequest` com campo novo `payoutIds: ObjectId[]`.
4. `payoutService.markPayoutsRequested(payoutIds, withdrawalRequestId, session)` — decrementa `availableBalance`.

**`approveWithdrawal` (CEO aprova):**
1. Buscar `WithdrawalRequest` + payouts.
2. Chamar `getPayoutGateway().transfer({ payoutIds, bankInfo, amount })`.
3. Persistir `gatewayProvider` e `gatewayTransferId` nos payouts.
4. Se gateway retornar `status: 'paid'` na hora (futuro, sync) → já marca como pago.
5. Se retornar `status: 'pending'` (manual ou async) → fica aguardando. CEO marca manual depois, ou webhook do gateway dispara.

**`markWithdrawalPaid` (novo endpoint — só CEO):**
- `POST /api/withdrawals/:id/mark-paid`
- `payoutService.markPayoutsPaid(payoutIds, gatewayTransferId, session)` — `requested` → `paid`, `AppCashbox.balance -= amount`.
- Usado manualmente quando gateway é `manual`. Futuro: webhook do Asaas/Pagar.me chama esse mesmo service.

**Adicionar campo `payoutIds: ObjectId[]` ao schema `WithdrawalRequest`.**

O fluxo de saque do lojista é análogo — hoje é um `WithdrawalRequest` também; só adaptar.

### `src/services/wallet.service.ts` — limpar funções mortas

Deprecar/remover:
- `processOrderPayment` (não era usado de qualquer jeito — L70)
- `revertOrderPayment` — substituído pelo novo fluxo no cancellationController
- `creditMotoboy` — substituído por `payoutService.createPendingPayout` + `releasePayoutsForOrder`
- Manter `getOrCreate`, `debit` (genéricos usados em outros fluxos como transferências entre carteiras de user, que continuam válidas).

---

## Frontend — alterações

### `/seller/wallet.tsx` (`frontend/pages/seller/wallet.tsx:84-110`)

Hoje mostra só `balance` (Saldo Disponível) e `totalIncome`. Trocar pra dois cards lado a lado:

- **💰 Disponível para saque** → `wallet.availableBalance`
- **⏳ Pendente (aguardando entrega)** → `wallet.pendingBalance`

Adicionar aba/seção "Meus Payouts" mostrando lista de `Payout`s do lojista com status visual (chip colorido: pending/released/requested/paid/cancelled), filtros por status e período. Endpoint novo: `GET /api/payouts/my?recipientType=store`.

### `/motoboy/wallet.tsx` (`frontend/pages/motoboy/wallet.tsx:121-147`)

Mesma mudança: dois cards (available/pending) + aba Payouts.

### `/seller/transfer-wallet.tsx` e `/motoboy/transfer-wallet.tsx`

Essas páginas fazem transferência **entre carteira de cliente e carteira de loja/motoboy do mesmo usuário** (quando um user tem dois papéis). Não mexe com Payouts — continua operando no `balance` das carteiras de `user` e `store`/`motoboy`. Só verificar que o campo mostrado corresponde ao que o usuário espera (pode usar `availableBalance` no lado `store`/`motoboy`).

### Nova página: `/admin/payouts.tsx`

Painel admin/CEO pra ver todos os payouts.

- **Filtros**: status, recipientType, busca por nome, período.
- **Tabela/cards**: data, recipient (nome + tipo), orderId (link), amount, status chip, gateway.
- **Ações no row**:
  - Se `pending` → botão "Liberar manualmente" (caso raro — normalmente é automático).
  - Se `requested` → botão "Marcar como pago" (equivalente a chamar `markPayoutsPaid`; usado quando gateway é manual).
  - Se `released` → só informativo.
- **Integrado à nav admin** — e por consistência com a feedback memory do usuário, também adicionar card no dashboard executivo se fizer sentido (provável: "N payouts aguardando pagamento" com link pra esta tela).

Endpoint backend: `GET /api/admin/payouts` com filtros. Controller novo: `src/controllers/payoutController.ts` (ou reusar `payoutService` diretamente num handler compacto).

### `/admin/app-cashbox.tsx` — ajustes

Hoje mostra só `balance` e `totalIncome/totalExpenses`. Adicionar no card principal:

- **Custódia total** → `AppCashbox.balance` (renomear o card atual)
- **Lucro líquido da plataforma** → `AppCashbox.balance - sum(payouts não pagos)` — calculado no backend e retornado junto no endpoint `/admin/app-cashbox`
- **Obrigações pendentes** → `sum(payouts pending + released + requested)` — também retornado pelo backend

Atualizar `appCashboxController.ts:getAppCashbox` pra agregar esses números.

---

## Reset de dados (usuário vai rodar antes de subir)

Criar `scripts/wipe-financial-data.ts` — script idempotente que limpa todo estado financeiro pra começar do zero:

```
1. Wallet.updateMany({}, { $set: { balance: 0, totalIncome: 0, totalSpent: 0, availableBalance: 0, pendingBalance: 0, blockedBalance: 0, history: [] } })
2. AppCashbox.deleteMany({})  // será recriado no primeiro acesso
3. Order.deleteMany({})
4. Transaction.deleteMany({})
5. Payout.deleteMany({})      // precaução
6. WithdrawalRequest.deleteMany({})
7. Withdrawal.deleteMany({})
8. Delivery.deleteMany({})
9. log do que apagou
```

Flag `--confirm` obrigatória pra evitar acidente. Documenta em README/CLAUDE.md que deve ser rodado manual uma vez antes do deploy da nova versão.

---

## Arquivos críticos a modificar/criar

**Criar:**
- `src/models/Payout.ts`
- `src/services/payout.service.ts`
- `src/services/payoutGateway/types.ts`
- `src/services/payoutGateway/manualGateway.ts`
- `src/services/payoutGateway/index.ts`
- `src/controllers/payoutController.ts` (list/get pra lojista/motoboy/admin)
- `src/routes/payouts.ts`
- `frontend/pages/admin/payouts.tsx` + CSS module
- `scripts/wipe-financial-data.ts`

**Modificar:**
- `src/models/Wallet.ts` (adicionar availableBalance, pendingBalance)
- `src/models/AppCashbox.ts` (adicionar `order_payment`, `order_refund` ao enum source)
- `src/models/WithdrawalRequest.ts` (adicionar `payoutIds: ObjectId[]`)
- `src/controllers/orderController.ts` (createOrder L63-455 — novo fluxo)
- `src/controllers/deliveryController.ts` (finalizarEntrega L315-351)
- `src/controllers/cancellationController.ts` (cancelOrderByCustomer L60-148)
- `src/controllers/withdrawalController.ts` (requestWithdrawal, approveWithdrawal; adicionar markWithdrawalPaid)
- `src/controllers/appCashboxController.ts` (getAppCashbox — adicionar platformNet e pendingObligations)
- `src/services/wallet.service.ts` (remover funções obsoletas)
- `src/config/env.ts` (PAYOUT_GATEWAY default `manual`)
- `src/app.ts` (montar rota `/api/payouts` e `/api/admin/payouts`)
- `frontend/pages/seller/wallet.tsx`
- `frontend/pages/motoboy/wallet.tsx`
- `frontend/pages/admin/app-cashbox.tsx` (novos cards)
- Nav admin (link pra `/admin/payouts`)

**Reutilizar (não criar duplicado):**
- Sessões Mongo já estão em uso em `createOrder` e `approveWithdrawal` — seguir mesmo padrão (`mongoose.startSession()` + `withTransaction`).
- `calculateOrderDistribution` (`src/utils/walletCalculations.ts:145-249`) continua sendo a fonte da distribuição — não mexer.
- `Transaction` model (`src/models/Transaction.ts`) continua sendo snapshot de pedido — manter como auditoria extra.
- `hasValidWalletAccess` e todo o sistema de permissão de carteira (item 6 anterior) não é afetado.

---

## Ordem de execução

1. **Model Payout + alteração Wallet/WithdrawalRequest/AppCashbox source** (sem tocar em fluxo ainda — só schema)
2. **`payout.service.ts`** com todas as funções + testes unitários básicos (criação, release, cancelamento)
3. **Abstração `payoutGateway` + `ManualGateway`**
4. **Reescrita `createOrder`** (dentro da transação existente)
5. **Reescrita `finalizarEntrega`** (release no entregue)
6. **Reescrita `cancelOrderByCustomer`** (cancel payouts + refund cliente)
7. **Reescrita `withdrawalController`** (request/approve/markPaid consumindo payouts)
8. **Limpar funções obsoletas de `wallet.service.ts`**
9. **Novo `payoutController` + rotas** (list my/list admin)
10. **Frontend: `/seller/wallet`, `/motoboy/wallet`** (available/pending + aba Payouts)
11. **Frontend: `/admin/payouts`** (painel CEO) + link na nav + card no dashboard executivo
12. **Frontend: `/admin/app-cashbox`** (custódia total + lucro líquido + obrigações)
13. **`scripts/wipe-financial-data.ts`**
14. **Build + typecheck backend e frontend**
15. **Teste end-to-end manual** (ver Verificação abaixo)

---

## Verificação

Antes de qualquer teste: rodar `node scripts/wipe-financial-data.ts --confirm` pra garantir estado limpo.

**Cenário 1: Pedido feliz (cria → entrega → saque)**
1. Cliente A cria pedido de R$100 (R$80 produto + R$20 entrega).
2. Distribuição: loja R$72, motoboy R$16, app R$12 (números exemplo).
3. Após `createOrder`:
   - `AppCashbox.balance` = R$100
   - `Wallet` do cliente: −R$100
   - `Payout` de loja: `pending`, R$72. `storeWallet.pendingBalance` = R$72, `availableBalance` = R$0.
   - Motoboy ainda sem payout.
4. Motoboy aceita e finaliza entrega:
   - `Payout` de loja: `pending` → `released`. `storeWallet.pendingBalance`=0, `availableBalance`=R$72.
   - `Payout` de motoboy criado e já released: `motoboyWallet.availableBalance`=R$16.
5. Loja entra em `/seller/wallet` → vê R$72 disponível, R$0 pendente.
6. Loja solicita saque de R$72 → `WithdrawalRequest` criada, payout da loja vira `requested`, `availableBalance`=0.
7. CEO em `/admin/payouts` ou `/admin/withdrawals` aprova → chama `manualGateway.transfer` → retorna `pending`. CEO clica "Marcar como pago" → payout vira `paid`, `AppCashbox.balance -= R$72`, vira R$28 (R$12 comissão + R$16 ainda devido ao motoboy).
8. `/admin/app-cashbox` mostra: custódia R$28, obrigações R$16, lucro líquido R$12. ✅

**Cenário 2: Cancelamento antes da entrega**
1. Cliente faz pedido; loja recebe payout `pending`.
2. Cliente cancela antes de entrega.
3. `cancelPayoutsForOrder` → payout da loja vira `cancelled`, `storeWallet.pendingBalance` -= valor.
4. Cliente é recreditado; AppCashbox debita total.
5. AppCashbox volta ao estado anterior; loja volta a 0. ✅

**Cenário 3: Cancelamento pós-entrega (devolução)**
1. Pedido é entregue; payouts da loja e motoboy estão `released`.
2. Cliente pede devolução via `/api/cancellation/.../return`.
3. `cancelPayoutsForOrder` tenta cancelar:
   - Loja: `released` → `cancelled`, `availableBalance` -= valor (pode ir negativo se loja já tem `requested`/`paid` — se for o caso, retorna erro estruturado e CEO resolve manual).
4. Se bateu: cliente recreditado, AppCashbox debita, fim. ✅

**Cenário 4: Saque com valor não-exato**
1. Motoboy tem 3 payouts released: R$10, R$15, R$20 (total R$45).
2. Pede saque de R$12 → erro `AMOUNT_NOT_EXACT` (não fecha com payouts inteiros).
3. Pede saque de R$10 → OK (pega o de R$10).
4. Pede saque de R$25 → OK (pega R$10 + R$15).

**Cenário 5: Dois papéis no mesmo user**
1. User que é `cliente` e `lojista`.
2. Modo cliente vê `userWallet.balance` normal.
3. Modo lojista vê `storeWallet.availableBalance/pendingBalance`.
4. Transfer-wallet entre os dois continua funcionando (usa `balance` do user, `availableBalance` do store).

**Smoke final:**
- `npx tsc --noEmit -p D:/PROJETOS/Drop/tsconfig.json` → 0 erros.
- `npx tsc --noEmit -p D:/PROJETOS/Drop/frontend/tsconfig.json` → 0 erros.
- Boot do backend sem warnings.
- Criar 2 pedidos, entregar 1, cancelar 1 → AppCashbox/Payouts batem conferindo na mão.

---

## Fora de escopo (anotado pra depois)

- **Integração real com Asaas/Pagar.me/Efi** — arquitetura já preparada via `IPayoutGateway`; implementar é criar uma nova classe e trocar `env.PAYOUT_GATEWAY`. Precisa de KYC, sandbox, webhooks, testes em staging — vira plano próprio.
- **Hold period configurável** (ex.: release só 7 dias após entrega) — fácil de adicionar no futuro mudando o timing de `releasePayoutsForOrder` pra ser um job agendado em vez de imediato.
- **Split de payout** (saque parcial de um payout) — deixando fora pra simplificar; se virar dor, dá pra adicionar depois com campo `remainingAmount` no Payout.
- **Webhook endpoints do gateway** (`POST /webhooks/payouts/asaas`) — criar junto com a integração real.
