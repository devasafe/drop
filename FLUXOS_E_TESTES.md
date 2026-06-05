# 📊 DIAGRAMAS E FLUXOGRAMAS - CASOS DE TESTE

---

## 1. FLUXO FELIZ - Todos Aceitam

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     HAPPY PATH - 7 PASSOS                               │
└─────────────────────────────────────────────────────────────────────────┘

LINHA DE TEMPO VISUAL:
═══════════════════════════════════════════════════════════════════════════

T+0min    Cliente cria pedido
├─────────────────────────────────────────────────┐
│ POST /orders                                      │
│ clientId: "123"                                   │
│ storeId: "456"                                    │
│ totalValue: R$ 112                                │
│ ✅ Validação: role='cliente', saldo >= 112      │
│ ✅ Stock: -2 (product.quantity -= 2)            │
│ ✅ Wallet(client): -112 (saldo reduz)           │
│ ✅ Wallet(store): +89.60 (comissão 20%)         │
│ ✅ Wallet(platform): +22.40                      │
│ Status: 'criado'                                 │
│ 📬 Lojista é notificado                          │
└─────────────────────────────────────────────────┘
        ⬇️ Lojista vê notificação imediatamente

T+3min    Lojista aceita pedido  
├─────────────────────────────────────────────────┐
│ POST /orders/:id/accept                          │
│ storeId: "456" (dono da loja)                    │
│ ✅ Validação: status IN [criado, pago]          │
│ Status: 'criado' → 'pago'                        │
│ Delivery.status = 'pending'                      │
│ Delivery.pin = "654321" (para cliente)           │
│ Delivery.pinRetirada = "123456" (para motoboy)   │
│ 📬 Motoboys são notificados (toda a cidade)      │
│ 📬 Cliente vê "Loja aceitou!" ✅                 │
└─────────────────────────────────────────────────┘
        ⬇️ Motoboys veem nova entrega disponível

T+5min    Motoboy #1 aceita entrega (ATOMIC!)
├─────────────────────────────────────────────────┐
│ POST /deliveries/:id/claim                       │
│ motoboyId: "789"                                 │
│ ✅ ATOMIC: Se outro motoboy reclamou no meio,   │
│    este é rejeitado (database constraint)        │
│ Delivery.motoboyId = "789"                       │
│ Delivery.status = 'assigned'                     │
│ 📬 Cliente vê "🚗 Motoboy a caminho!"           │
│    └─ Com nome, foto e rating do motoboy        │
│ 📬 Lojista vê quem vai buscar                    │
│ ⏰ [PROBLEMA #6: Sem timeout de 30min]           │
└─────────────────────────────────────────────────┘
        ⬇️ Motoboy se dirige à loja

T+12min   Motoboy chega na loja, pega o pedido
├─────────────────────────────────────────────────┐
│ POST /deliveries/:id/validar-pin-retirada       │
│ pinRetirada: "123456" (dado pela loja)           │
│ ✅ Validação: PIN correto, status='assigned'    │
│ Delivery.status = 'assigned' → 'picked'         │
│ 📬 Cliente vê "🎁 Pedido saiu da loja"          │
│ 📬 Lojista vê "Motoboy pegou"                    │
│ Motoboy agora tem o produto fisicamente          │
└─────────────────────────────────────────────────┘
        ⬇️ Motoboy se dirige ao endereço do cliente

T+25min   Motoboy entrega ao cliente
├─────────────────────────────────────────────────┐
│ POST /deliveries/:id/finalizar                  │
│ pin: "654321" (dado ao cliente via SMS/app)     │
│ ✅ Validação: PIN correto, motoboy é o mesmo   │
│ Delivery.status = 'picked' → 'delivered'        │
│ Order.status = 'criado' → 'entregue'            │
│                                                  │
│ ✅ Wallet(motoboy).balance += 12 (fee)          │
│   └─ Porque não há rating ainda, bonus=0        │
│   └─ fee = 7 + (5km × 1) = 12                   │
│                                                  │
│ 📬 Cliente vê "✅ Entregue!"                     │
│ 📬 Motoboy vê "Entrega completada"              │
│ 📬 Lojista vê "Pedido entregue"                 │
│                                                  │
│ 🎮 Gamification:                                 │
│    └─ motoboy.points += 10 (por entregar)       │
└─────────────────────────────────────────────────┘
        ⬇️ Cliente e motoboy podem avaliar

T+26min   Cliente avalia loja (opcional)
├─────────────────────────────────────────────────┐
│ POST /orders/:orderId/evaluate-store             │
│ storeRating: 5 ⭐⭐⭐⭐⭐                         │
│ ✅ Validação: status='entregue', não avaliou    │
│ Order.storeRating = 5                           │
│ 📬 Lojista vê "Nota 5 do cliente"               │
└─────────────────────────────────────────────────┘
        ⬇️

T+27min   Cliente avalia motoboy
├─────────────────────────────────────────────────┐
│ POST /deliveries/:id/avaliar                    │
│ rating: 5 ⭐⭐⭐⭐⭐                            │
│ comment: "Entrega super rápida!"                │
│ ✅ Validação: status='delivered', não avaliou   │
│ Delivery.rating = 5                             │
│                                                  │
│ 🎮 Gamification Motoboy:                         │
│    ├─ base: 10 pontos                           │
│    ├─ bonus (rating >= 4): +5 pontos             │
│    ├─ total: 15 pontos                          │
│    └─ totalPoints: 10 + 15 = 25 pontos          │
│       └─ Pode ganhar badge: "5 Entregas"        │
│       └─ Pode ganhar badge: "Avaliação 5⭐"     │
│                                                  │
│ 📬 Motoboy vê "Ganhou 15 pontos!"               │
│ 📬 Lojista pode ver rating do motoboy           │
└─────────────────────────────────────────────────┘

═══════════════════════════════════════════════════════════════════════════


DIAGRAMA DE ESTADOS - ORDEM
═══════════════════════════════════════════════════════════════════════════

                    createdAt
                        ⬇️
                    ┌─────────┐
                    │ CRIADO  │  ← Cliente criou, loja não viu
                    └────┬────┘
                   Post /accept by store
                         ⬇️
                    ┌─────────┐
                    │  PAGO   │  ← Loja aceitou, delivery 'pending'
                    └────┬────┘
                    ⬇️              ⬇️
        postAcceptedAt    (implicito na lógica)
            (waiting)          
                    │
        motoboy claims delivery
                    ⬇️
            Order.status NÃO MUDA!
            MAS delivery.status='assigned'
                    │
        Delivery finalizada
            (motoboy POST /finalizar)
                    ⬇️
                    ┌─────────┐
                    │ ENTREGUE│  ← Delivery 'delivered', cliente pode avaliar
                    └─────────┘


DIAGRAMA DE ESTADOS - DELIVERY
═══════════════════════════════════════════════════════════════════════════

    Order accepted
    by store
        ⬇️
    ┌─────────┐
    │ PENDING │  ← Aguardando motoboy
    └────┬────┘
         │
    POST /claim
    motoboy aceita
         ⬇️
    ┌──────────┐
    │ ASSIGNED │  ← Motoboy a caminho da loja
    └────┬─────┘  ⏰ [SEM TIMEOUT - PODE FICAR AQUI PRA SEMPRE]
         │
    POST /validar-pin-retirada
    (by store)
         ⬇️
    ┌─────────┐
    │ PICKED  │  ← Motoboy pegou, indo pro cliente
    └────┬────┘
         │
    POST /finalizar
    (by motoboy com PIN)
         ⬇️
    ┌───────────┐
    │ DELIVERED │  ← Entregue, cliente pode avaliar
    └───────────┘
    
    OU (de qualquer estado)
    
    DELETE (cancelamento)
         ⬇️
    ┌───────────┐
    │ CANCELLED │
    └───────────┘

```

---

## 2. FLUXO: CLIENTE CANCELA

```
┌─────────────────────────────────────────────────────────────────────────┐
│              CANCELAMENTO POR CLIENTE                                    │
└─────────────────────────────────────────────────────────────────────────┘

CENÁRIO 1: Cliente cancela ANTES de loja aceitar
═════════════════════════════════════════════════════════════════════════════

T+0min    Client creates order
                    ⬇️
        Order.status = 'criado' ✅
        Wallets alteradas
        Stock: -2
                    ⬇️
T+1min    Cliente se arrepende IMEDIATAMENTE
        POST /orders/:id/cancel
        reason: 'customer_request'
                    ⬇️
        ✅ Validação: status IN [criado, pago, enviado]
                    ⬇️
        Order.status = 'cancelado'
        Cancellation.cancelledBy = 'customer'
        Cancellation.refundStatus = 'processed'
                    ⬇️
        ✅ Refund processado:
        ├─ Wallet(cliente).balance += 112
        ├─ Wallet(cliente).history.push({type:'refund'})
        │
        ✅ Reverter distribuição:
        ├─ Wallet(loja).balance -= 89.60
        ├─ Wallet(platform).balance -= 22.40
        │
        ✅ Reverter estoque:
        ├─ Product.quantity += 2
        │
        📬 Lojista é notificado: "Pedido cancelado"
        📬 Cliente vê: "Cancelamento confirmado. R$ 112 devolvidos"

═════════════════════════════════════════════════════════════════════════════

CENÁRIO 2: Cliente cancela DEPOIS que loja aceita
═════════════════════════════════════════════════════════════════════════════

T+0min    Order created, loja aceita em T+3min
T+3min    Order.status = 'pago'
        Delivery.status = 'pending' (aguardando motoboy)
                    ⬇️
T+4min    Cliente cancela antes de motoboy
        POST /orders/:id/cancel
                    ⬇️
        ✅ Still allowed (status='pago' está em lista cancellable)
                    ⬇️
        Order.status = 'cancelado'
        Delivery.status = 'cancelled' (se existir)
                    ⬇️
        ✅ Same refund/revert as Cenário 1
                    ⬇️
        📬 Motoboys não veem mais esta entrega
        📬 Lojista: "Pedido foi cancelado pelo cliente"

═════════════════════════════════════════════════════════════════════════════

CENÁRIO 3: Cliente tenta cancelar DEPOIS que motoboy pegou
═════════════════════════════════════════════════════════════════════════════

T+0min    Order created
T+3min    Order.status = 'pago', Delivery='pending'
T+5min    Motoboy claims: Delivery='assigned'
T+12min   Motoboy pega: Delivery='picked'
                    ⬇️
T+13min   Cliente tenta cancelar:
        POST /orders/:id/cancel
        
        ❌ Order.status = 'enviado' (implícito de delivery 'assigned')
                    ⬇️
        [PROBLEMA #1: Código PERMITE cancelar 'enviado'!]
                    ⬇️
        IF (status IN ['criado, pago, enviado']) {
            ✅ Permite (BUG!)
        }
                    ⬇️
        Order.status = 'cancelado'
        Delivery.status = 'cancelled'
                    ⬇️
        Wallet refund processado
        Stock revertido
                    ⬇️
        MAS... Motoboy JÁ TEM O PRODUTO FISICAMENTE!
        Motoboy vê: "Entrega foi cancelada"
        Motoboy não sabe o que fazer com o produto
                    ⬇️
        ❌ CONFLITO: Motoboy com produto, Cliente sem pagamento

═════════════════════════════════════════════════════════════════════════════

RECOMENDAÇÃO:
├─ Remover 'enviado' de cancellableStatuses
└─ Apenas ['criado', 'pago'] podem ser cancelados pelo cliente
```

---

## 3. FLUXO: LOJA REJEITA

```
┌─────────────────────────────────────────────────────────────────────────┐
│              REJEIÇÃO POR LOJA                                           │
└─────────────────────────────────────────────────────────────────────────┘

CENÁRIO 1: Loja rejeita ANTES de aceitar
═════════════════════════════════════════════════════════════════════════════

T+0min    Client creates order
        Order.status = 'criado'
        Wallets alteradas ✅
                    ⬇️
T+2min    Lojista vê e diz "não temos em estoque"
        POST /orders/:id/reject
        reason: 'not_available'
                    ⬇️
        ✅ Validação: status IN [criado, pago] → PERMITE
                    ⬇️
        Order.status = 'rejeitado'
                    ⬇️
        Cancellation.cancelledBy = 'store'
                    ⬇️
        ❌ [PROBLEMA #8: Refund NÃO é processado!]
        ├─ refundAmount é calculado
        ├─ refundStatus = 'processed' (simulado)
        ├─ MAS Wallet(cliente) NÃO é creditada
        │
        ❌ Cliente fica sem seu dinheiro!
                    ⬇️
        ❌ [PROBLEMA #4: Wallets não são revertidas!]
        ├─ Wallet(loja) CONTINUA com +89.60
        ├─ Wallet(platform) CONTINUA com +22.40
        │
        ❌ "Dinheiro do nada" foi criado!
                    ⬇️
        ❌ [PROBLEMA #5: Estoque NÃO é revertido!]
        ├─ Product.quantity continua decrementado
        ├─ Estoque fica inconsistente
                    ⬇️
        📬 Cliente vê: Pedido rejeitado (SEM saber que perdeu dinheiro)
        📬 Lojista vê: Pedido rejeitado com sucesso

═════════════════════════════════════════════════════════════════════════════

RESULTADO FINAL (BROKEN):
├─ Cliente:  tinha R$ 200, perdeu R$ 112, saldo = R$ 88
│            Cliente pensa que deveria ter R$ 200 (ou R$ 112 devolvido)
│
├─ Loja:     ganhou R$ 89.60
│            nunca preparou o produto
│
├─ Platform: ganhou R$ 22.40
│            sem fazer nada
│
├─ Estoque:  perdeu 2 unidades
│            produtos nunca foram removidos da prateleira
│
└─ SISTEMA:  R$ 111.60 "apareceu do nada"

═════════════════════════════════════════════════════════════════════════════

CENÁRIO 2: Loja "aceita" (status='pago') e depois rejeita
═════════════════════════════════════════════════════════════════════════════

[PROBLEMA #7: Loja pode aceitar e depois rejeitar!]

T+0min    Order.status = 'criado'
T+3min    Loja POST /accept
        Order.status = 'pago' ✅
        Delivery.status = 'pending'
                    ⬇️
T+5min    Loja muda de ideia
        POST /orders/:id/reject
        reason: 'store_closed_now' (loja fechou)
                    ⬇️
        ✅ status='pago' está em ['criado', 'pago']
                    ⬇️
        Order.status = 'rejeitado'
                    ⬇️
        ❌ MESMOS PROBLEMAS (#4, #5, #8):
        ├─ Sem refund do cliente
        ├─ Wallets loja/platform não revertidas
        ├─ Estoque não revertido
        │
        ❌ Cliente pior ainda porque pensa que foi aceito!
                    ⬇️
        📬 Cliente vê: Pedido rejeitado (confuso, porque viu "aceito")
        📬 Motoboys nunca viram (Delivery foi criada mas depois cancelada?)

═════════════════════════════════════════════════════════════════════════════

RECOMENDAÇÃO:
├─ Separar "reject" (apenas 'criado') de "cancel" (apenas 'pago')
├─ Implementar refund, wallet revert, stock revert NO REJECT
├─ Usar transação Mongoose para atomicidade
└─ Notificar cliente

```

---

## 4. FLUXO: MOTOBOY CANCELA

```
┌─────────────────────────────────────────────────────────────────────────┐
│              CANCELAMENTO POR MOTOBOY                                    │
└─────────────────────────────────────────────────────────────────────────┘

CENÁRIO 1: Motoboy 'reassign' (volta para pool)
═════════════════════════════════════════════════════════════════════════════

T+0min    Order created, loja aceita
T+3min    Order.status='pago', Delivery='pending'
T+7min    Motoboy #1 claims
        Delivery.motoboyId = motoboy1
        Delivery.status='assigned'
                    ⬇️
        📬 Cliente vê "🚗 Motoboy a caminho!"
                    ⬇️
T+12min   Motoboy #1 pensa "não gosto disso"
        POST /deliveries/:id/reject
        action: 'reassign'
        reason: 'acho local perigoso'
                    ⬇️
        Delivery.motoboyId = NULL
        Delivery.status = 'pending' (volta ao início)
                    ⬇️
        Cancellation.cancelledBy = 'motoboy'
        ❌ Sem refund (não deve envolver cliente)
                    ⬇️
        ❌ [PROBLEMA #9: Cliente NÃO é notificado!]
        ├─ Cliente continua vendo "🚗 Motoboy a caminho"
        ├─ Confuso por 20+ minutos
        ├─ Depois outro motoboy é atribuído
        └─ Cliente nunca soube que houve mudança
                    ⬇️
        📬 Lojista vê: "Motoboy recusou, reatrbuindo"
        📬 Motoboy viu: "Devolvida ao pool"

═════════════════════════════════════════════════════════════════════════════

CENÁRIO 2: Motoboy 'cancel' (cancela tudo)
═════════════════════════════════════════════════════════════════════════════

T+0-12min  [Mesmo como acima até linha 1]
                    ⬇️
T+12min   Motoboy #1 escolhe 'cancel'
        POST /deliveries/:id/reject
        action: 'cancel'
        reason: 'endereco invalido'
                    ⬇️
        Delivery.status = 'cancelled'
        Order.status = 'cancelado'
                    ⬇️
        ❌ [PROBLEMA #10: Refund NÃO é processado!]
        ├─ Wallet(cliente) NÃO é creditada
        ├─ Cliente paga R$ 112
        ├─ Motoboy desaparece
        ├─ Cliente fica sem dinheiro
        │
        └─ ISSO É BUG CRITÍCO!
                    ⬇️
        Cancellation.cancelledBy = 'motoboy'
                    ⬇️
        📬 Cliente vê: "Entrega cancelada" (sem razão, sem
 crédito)
        📬 Lojista vê: "Entrega cancelada"
        📬 Motoboy: operação concluída

═════════════════════════════════════════════════════════════════════════════

RECOMENDAÇÃO:
├─ Adicionar refund quando motoboy cancela (action='cancel')
├─ Notificar cliente quando motoboy reatribui (action='reassign')
├─ [+] Auto-timeout depois de 30min em 'assigned'
└─ Colocar limite de quantas vezes uma delivery pode ser reatribuída

```

---

## 5. MATRIZ DE TESTES - COMBINAÇÕES

```
┌──────────────────────────────────────────────────────────────────────┐
│                    MATRIZ DE TESTES RECOMENDADA                      │
└──────────────────────────────────────────────────────────────────────┘

TEST SUITE 1: HAPPY PATH (Todos aceitam)
═════════════════════════════════════════════════════════════════════════

✅ T1.1: Cliente cria → Loja aceita → Motoboy pega → Entrega → Avalia
  Validation:
  ├─ Order.status: criado → pago → entregue
  ├─ Delivery.status: pending → assigned → picked → delivered
  ├─ Wallet(cliente): -112
  ├─ Wallet(loja): +89.60
  ├─ Wallet(platform): +22.40
  ├─ Wallet(motoboy): +12
  ├─ Product.quantity: -2
  └─ Gamification(motoboy): +10 base + 15 rating = 25 pontos

✅ T1.2: Happy path com rating loja
  Validation:
  ├─ Order.storeRating = 5
  ├─ Loja pode ver que foi avaliada
  └─ Rating aparece no histórico da loja

✅ T1.3: Happy path com múltiplas tentativas de motoboy
  Cenário: 2 motoboys tentam claim simultaneamente
  ├─ Apenas 1 consegue (atomic operation)
  ├─ Outro recebe erro "Já foi reclamada"
  └─ Delivery.motoboyId definido apenas para winner


TEST SUITE 2: CANCELAMENTO CLIENTE
═════════════════════════════════════════════════════════════════════════

✅ T2.1: Cliente cancela em status 'criado' (T+1min)
  Validation:
  ├─ Order.status: criado → cancelado ✅
  ├─ Wallet(cliente): +112 ✅
  ├─ Wallet(loja): -89.60 ✅
  ├─ Wallet(platform): -22.40 ✅
  ├─ Product.quantity: +2 ✅
  └─ Cancellation.refundStatus = 'processed'

✅ T2.2: Cliente cancela em status 'pago'
  Validation:
  ├─ Order.status: pago → cancelado ✅
  ├─ Delivery.status: pending → cancelled
  ├─ Wallet refund funciona ✅
  ├─ Stock revert funciona ✅
  └─ Lojista não vê mais esta entrega

✅ T2.3: Cliente tenta cancelar em status 'entregue'
  Validation:
  ├─ return error("Pedido já foi entregue")
  ├─ Order.status continua 'entregue'
  ├─ Wallet NÃO é alterada
  └─ Cancel NÃO acontece

❌ T2.4: Cliente tenta cancelar em status 'enviado' [BUG #1]
  Current behavior:
  ├─ Cancela (ERRONEAMENTE)
  ├─ Order.status: enviado → cancelado
  ├─ Wallet refund acontece
  ├─ MAS Motoboy já tem o produto!
  │
  Future behavior:
  ├─ return error("Entrega já saiu, contacte o motoboy")
  ├─ Order.status continua 'enviado'
  └─ Wallet NÃO é alterada

✅ T2.5: Cliente cancela 2x o mesmo pedido
  Validation:
  ├─ First cancel: sucesso
  ├─ Second cancel: erro "Pedido já foi cancelado"
  └─ Idempotência funcionando


TEST SUITE 3: REJEIÇÃO LOJA
═════════════════════════════════════════════════════════════════════════

❌ T3.1: Loja rejeita em status 'criado' [BUG #2, #4, #5]
  Current behavior:
  ├─ Order.status: criado → rejeitado
  ├─ Wallet(cliente): NÃO é alterada (cliente perde dinheiro!)
  ├─ Wallet(loja): continua com +89.60 (deveria ter -89.60)
  ├─ Wallet(platform): continua com +22.40 (deveria ter -22.40)
  ├─ Product.quantity: NÃO é revertida
  ├─ Cancellation criada mas com statusRefund='processed'
  │  (refund não foi realmente processado)
  │
  Future behavior:
  ├─ Order.status: criado → rejeitado
  ├─ Wallet(cliente): +112 ✅
  ├─ Wallet(loja): -89.60 ✅
  ├─ Wallet(platform): -22.40 ✅
  ├─ Product.quantity: +2 ✅
  └─ Cancellation.refundStatus = 'processed' (realmente processado)

❌ T3.2: Loja 'aceita' (status='pago') e depois 'rejeita' [BUG #7]
  Current behavior:
  ├─ Order.status: criado → pago → rejeitado ✓ (permitido)
  ├─ Delivery foi criada mas depois cancelada
  ├─ MAS refund/wallet/stock bugs (#2, #4, #5) continuam
  │
  Future behavior:
  ├─ Separar em dois métodos:
  │  ├─ acceptOrderByStore: criado → pago (se não aceitou ainda)
  │  ├─ cancelOrderByStore: pago → cancelado (se aceitou mas muda de ideia)
  │
  └─ ambos deve processar refund/wallet/stock

✅ T3.3: Loja tenta rejeitar em status 'entregue'
  Validation:
  ├─ return error("Pedido já foi entregue")
  └─ Rejeição NÃO acontece


TEST SUITE 4: CANCELAMENTO MOTOBOY
═════════════════════════════════════════════════════════════════════════

✅ T4.1: Motoboy reassign (volta para pool)
  Validation:
  ├─ Delivery.status: assigned → pending
  ├─ Delivery.motoboyId: {motoboy1} → NULL
  ├─ Cancellation.cancelledBy = 'motoboy'
  ├─ Wallet NÃO é alterada ✅
  ├─ [PENDENTE] Cliente é notificado
  └─ Próximo motoboy pode claim

❌ T4.2: Motoboy cancela (action='cancel') [BUG #3]
  Current behavior:
  ├─ Order.status: pago → cancelado
  ├─ Delivery.status: assigned → cancelled
  ├─ Wallet(cliente): NÃO é alterada (BUG!)
  ├─ Cliente perde dinheiro
  │
  Future behavior:
  ├─ Wallet(cliente): +112 ✅
  ├─ Wallet refund processado ✅
  ├─ Order.status: pago → cancelado
  └─ Cliente é notificado

✅ T4.3: Motoboy tenta cancelar quando não é mais assignado
  Validation:
  ├─ return error("Você não é o motoboy designado")
  └─ Cancelamento NÃO acontece

✅ T4.4: Motoboy tenta reassign em status 'delivered'
  Validation:
  ├─ return error("Não pode cancelar entrega já concluída")
  └─ Cancelamento NÃO acontece


TEST SUITE 5: TIMEOUT & EDGE CASES
═════════════════════════════════════════════════════════════════════════

❌ T5.1: Delivery fica em 'assigned' por 60+ minutos [BUG #6]
  Current behavior:
  ├─ Delivery continua em 'assigned'
  ├─ Cliente vê "🚗 Motoboy a caminho" por 1 hora
  ├─ Motoboy desapareceu
  │
  Future behavior:
  ├─ Auto-reassignment após 30min
  ├─ Cliente é notificado: "Novo motoboy atribuído"
  ├─ Delivery.status continua 'assigned' (novo motoboy)
  └─ Log para análise: "Motoboy {id} timeout"

✅ T5.2: Múltiplas requisições simultâneas
  Validation:
  ├─ POST /orders/:id/cancel (2x simultaneamente)
  ├─ Primeira: sucesso
  ├─ Segunda: erro "Pedido já foi cancelado"
  └─ Idempotência funcionando

✅ T5.3: Cliente cria, imediatamente cancela antes de resposta
  Validation:
  ├─ Transação: Order criada → Wallets atualizadas
  ├─ Simultâneo: Cancelamento processado
  ├─ Resultado final: Order.status = 'cancelado'
  ├─ Wallets reverted
  └─ Stock reverted


TEST SUITE 6: CONVERSÃO DE ESTADO
═════════════════════════════════════════════════════════════════════════

✅ T6.1: Order.status 'enviado' não deveria existir
  Nota: 'enviado' é implícito quando Delivery.status IN ['assigned', 'picked']
  ├─ Order.status deve ser apenas: 'criado', 'pago', 'entregue', 'cancelado'
  ├─ 'enviado' é derivado de Delivery.status
  └─ Isso evita bugs de transição de estado

✅ T6.2: Validação de transições de estado
  Criado  → Pago:              ✅ (loja aceita)
  Criado  → Cancelado:         ✅ (cliente/loja/motoboy)
  Pago    → Entregue:          ✅ (motoboy finaliza)
  Pago    → Cancelado:         ✅ (cliente/loja/motoboy)
  Entregue → Cancelado:        ❌ (não permitir)
  Cancelado → Qualquer outro:  ❌ (estado terminal)


TEST SUITE 7: TRANSAÇÃO ATOMICIDADE
═════════════════════════════════════════════════════════════════════════

✅ T7.1: acceptOrderByStore deve ser transacional
  ├─ Atualiza Order.status
  ├─ Cria Delivery
  ├─ Se falhar no meio: rollback completo
  └─ [PENDENTE] Implementar com Mongoose session

✅ T7.2: createOrder é transacional
  ├─ Valida stock
  ├─ Atualiza Product.quantity
  ├─ Cria Order
  ├─ Atualiza 3 Wallets
  ├─ Se falha: tudo volta
  └─ ✅ Já implementado com session

```

---

## 6. CHECKLIST DE IMPLEMENTAÇÃO

```
CRÍTICO (Esta semana):
═════════════════════════════════════════════════════════════════════════

□ [BUG #1] Remover 'enviado' de cancellableStatuses em cancelOrderByCustomer
  └─ Apenas ['criado', 'pago'] podem ser cancelados

□ [BUG #2] Implementar refund em rejectOrderByStore
  └─ Usar código de refund do cancelOrderByCustomer

□ [BUG #3] Implementar refund em rejectDeliveryByMotoboy (action='cancel')
  └─ Mesma lógica de refund

□ [BUG #4] Implementar revert de wallets (loja e platform) em cancelamentos
  └─ Função: revertWalletDistribution(orderId)

□ [BUG #5] Implementar revert de estoque em rejectOrderByStore
  └─ Função: revertOrderStock(orderId)
  └─ Usar em todos os cancelamentos

□ Adicionar transação em acceptOrderByStore
  └─ Usar Mongoose session para Order update + Delivery create

□ Testes:
  └─ Suite 1 (Happy Path): 3 testes
  └─ Suite 2 (Cliente Cancel): 5 testes
  └─ Suite 3 (Loja Reject): 3 testes
  └─ Suite 4 (Motoboy Cancel): 4 testes


ALTO (Este mês):
═════════════════════════════════════════════════════════════════════════

□ [BUG #6] Implementar auto-reassignment timeout (30min)
  └─ Usar cron job para verificar periodicamente
  └─ Notificar cliente quando acontece

□ [BUG #7] Separar 'rejectOrderByStore' em dois métodos
  └─ rejectOrderByStore: apenas status='criado'
  └─ cancelOrderByStore: apenas status='pago'

□ [BUG #9] Notificar cliente quando motoboy reassign
  └─ emitToRoom(`user:${customerId}`, 'delivery:reassigned', ...)

□ Adicionar idempotência em cancelamentos
  └─ Evitar segunda tentativa de cancelar mesmo pedido

□ Testes Suite 5: Timeout & Edge Cases

□ Testes Suite 6: Conversão de estado


MÉDIO (Próximo quarter):
═════════════════════════════════════════════════════════════════════════

□ Implementar auditoria completa (AuditLog collection)
  └─ Logar toda operação financeira

□ Rate limiting em cancelamentos
  └─ Evitar abuse (100 cancelamentos em 1 hora)

□ Notificação push ao cliente quando motoboy timeout
  └─ "Seu pedido foi reatribuído para outro motoboy"

□ Dashboard admin com alertas
  └─ Motoboys com alto % de timeout
  └─ Lojas com alto % de rejeição
  └─ Usuários com padrão de cancelamento suspeito

□ Análise de fraude:
  └─ Cliente cancela 100% dos pedidos → bloqueio
  └─ Cliente cria pedido e cancela em < 1min → análise
  └─ Padrão de cancelamento suspeito

```

---

## 7. FLUXOGRAMA JSON PARA IMPLEMENTAÇÃO

```json
{
  "stateMachine": {
    "Order": {
      "states": ["criado", "pago", "entregue", "cancelado"],
      "transitions": [
        {
          "from": "criado",
          "to": "pago",
          "trigger": "acceptOrderByStore",
          "guards": ["order.storeId === userId"],
          "actions": ["updateOrder", "createDelivery", "notifyAll"]
        },
        {
          "from": ["criado", "pago"],
          "to": "cancelado",
          "trigger": "cancelOrderByCustomer",
          "guards": ["order.customerId === userId"],
          "actions": ["updateOrder", "processRefund", "revertWallets", "revertStock", "notifyAll"]
        },
        {
          "from": ["criado", "pago"],
          "to": "cancelado",
          "trigger": "rejectOrderByStore",
          "guards": ["order.storeId === userId", "order.status !== 'entregue'"],
          "actions": ["updateOrder", "processRefund", "revertWallets", "revertStock", "cancelDelivery", "notifyAll"]
        },
        {
          "from": "pago",
          "to": "entregue",
          "trigger": "finalizeDeliveryByMotoboy",
          "guards": ["delivery.motoboyId === userId", "delivery.pin === inputPin"],
          "actions": ["updateOrder", "updateDelivery", "creditMotoboy", "checkoutGamification", "notifyAll"]
        }
      ]
    },
    "Delivery": {
      "states": ["pending", "assigned", "picked", "delivered", "cancelled"],
      "transitions": [
        {
          "from": "pending",
          "to": "assigned",
          "trigger": "claimDelivery",
          "guards": ["atomic: delivery.motoboyId === null"],
          "actions": ["updateDelivery", "creditNotifications"]
        },
        {
          "from": "assigned",
          "to": "picked",
          "trigger": "validatePickupPin",
          "guards": ["store.ownerId === userId", "pin === delivery.pinRetirada"],
          "actions": ["updateDelivery", "notifyAll"]
        },
        {
          "from": ["assigned", "picked"],
          "to": "delivered",
          "trigger": "finalizeDelivery",
          "guards": ["delivery.motoboyId === userId", "pin === delivery.pin"],
          "actions": ["updateDelivery", "creditMotoboy", "notifyAll"]
        },
        {
          "from": "assigned",
          "to": "pending",
          "trigger": "reassignDelivery",
          "guards": ["delivery.motoboyId === userId", "action === 'reassign'"],
          "actions": ["updateDelivery.motoboyId=null", "notifyLoja"]
        },
        {
          "from": ["pending", "assigned", "picked"],
          "to": "cancelled",
          "trigger": "cancelDelivery",
          "guards": ["validated by order cancellation"],
          "actions": ["updateDelivery", "notifyAll"]
        }
      ]
    }
  }
}
```

---

**Documento de Fluxos e Testes Concluído**
Data: 3 de Março de 2026
