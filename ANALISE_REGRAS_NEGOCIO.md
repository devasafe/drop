# 📋 ANÁLISE DE REGRAS DE NEGÓCIO - FLUXOS E CANCELAMENTOS

**Data:** 3 de Março de 2026  
**Análise de:** orderController.ts, deliveryController.ts, cancellationController.ts

---

## 🎯 Seção 1: FLUXO HAPPY PATH (Todos Aceitam)

### Caso Ideal: Cliente → Loja → Motoboy → Entregue

```
ESTADO INICIAL:
═══════════════

Cliente: 
├─ role: 'cliente' (activeRole deve ser 'cliente')
├─ Carteira: saldo ≥ totalValue do pedido
└─ Endereço: validado com latitude/longitude

Loja:
├─ role: 'lojista'
├─ Estoque: quantidade ≥ produtos solicitados
├─ Carteira: pode receber crédito
└─ Status: ativa e funcionando

Motoboy:
├─ role: 'motoboy'
├─ Disponível: online e aceitando entregas
└─ Carteira: pode receber pagamento


PASSO 1️⃣: Cliente cria pedido
═══════════════════════════════

Entrada: POST /orders
{
  storeId: "...",
  products: [
    { productId: "...", quantity: 2 },
    { productId: "...", quantity: 1 }
  ],
  deliveryDistanceKm: 5,
  paymentMethod: "wallet",
  address: { street, number, neighborhood, city, state, cep },
  latitude: "-23.5505",
  longitude: "-46.6333",
  idempotentKey: "uuid-unique"
}

Validações:
├─ activeRole === 'cliente' ✅ (BLOQUEIO CRÍTICO!)
├─ Todos os produtos existem
├─ Estoque suficiente para CADA produto
├─ Cliente tem saldo ≥ totalValue
├─ idempotentKey é único (evita duplicação)
└─ Endereço válido (latitude/longitude preenchidos)

Cálculos:
├─ subtotal = Σ(preço × quantidade)
├─ deliveryFee = 7 + (distanceKm × 1)
│  └─ Exemplo: 5km = 7 + (5 × 1) = R$ 12
├─ totalValue = subtotal + deliveryFee
│  └─ Exemplo: 100 + 12 = R$ 112
│
└─ Distribuição (Plano 2 = 20% comissão):
   ├─ storeAmount = 112 × (1 - 0.20) = R$ 89.60
   ├─ ceoAmount = 112 × 0.20 = R$ 22.40
   └─ TOTAL = R$ 112 ✅

Transações (ATÔMICAS - Mongoose session):
├─ ✅ Product.quantity -= para CADA produto
├─ ✅ Wallet(cliente).balance -= 112
│  └─ totalSpent += 112 (vai contar gasto)
│  └─ history.push({ type: 'debit', category: 'payment', amount: 112, ... })
│
├─ ✅ Wallet(loja).balance += 89.60
│  └─ totalIncome += 89.60
│  └─ history.push({ type: 'credit', category: 'payment', amount: 89.60, ... })
│
└─ ✅ Wallet(platform).balance += 22.40
   └─ totalIncome += 22.40
   └─ history.push({ type: 'credit', reason: 'Taxa plataforma', amount: 22.40, ... })

Status Final:
├─ Order.status = 'criado'
├─ Order.idempotentKey = "uuid-unique" (para retry safety)
│  └─ Se cliente reenviar com mesma chave, recebe order existente (200)
└─ WebSocket: emitOrderCreated(order) → Lojista notificado!

Saida: Order document criado with _id

⚠️ PROBLEMA IDENTIFICADO #1:
Se a transação falhar NO MEIO (ex: falha ao creditar loja mas débito cliente OK):
├─ session.abortTransaction() reverte TUDO
└─ Cliente não perde dinheiro! ✅ (transação atômica funciona)


PASSO 2️⃣: Lojista aceita pedido
════════════════════════════════

Entrada: POST /orders/:orderId/accept
{
  distance: 5  // opcional: distância da loja até cliente
}

Validação:
├─ order.status IN ['criado', 'pago'] (pode aceitar)
└─ store.ownerId === userId (é o dono da loja)

O que muda:
├─ Order.status: 'criado' → 'pago' ✅
├─ Order.acceptedAt = now()
│
└─ Cria Delivery (se não existir):
   ├─ Delivery.orderId = order._id
   ├─ Delivery.distance = 5 (ou req.body.distance)
   ├─ Delivery.fee = 7 + (5 × 1) = R$ 12
   ├─ Delivery.status = 'pending'
   ├─ Delivery.pinRetirada = "random6digits" (para motoboy antes de retirar)
   ├─ Delivery.pin = "random6digits" (para cliente validar entrega)
   └─ Delivery.pinCreatedAt = now()

WebSocket Events:
├─ emitOrderAcceptedByStore(order) → Todos sabem que loja aceitou
├─ emitDeliveryCreated(delivery) → Notifica motoboys (room: 'motoboys')
│  └─ Motoboys veem nova entrega disponível com fee, distance, etc
└─ notifier.notifyMotoboys({ type: 'new_delivery', ... })

⚠️ PROBLEMA IDENTIFICADO #2:
NÃO há transação Mongoose aqui!
├─ Se falha ao criar Delivery mas Order foi atualizado:
│  └─ Order fica em status 'pago' mas sem Delivery
│  └─ Delivery nunca foi criada → Motoboys não veem
├─ RISCO: Pedido pago mas sem entrega (ficaria perdido)


PASSO 3️⃣: Motoboy aceita entrega (CRITICAL: first-claim-wins)
═══════════════════════════════════════════════════════════════

Entrada: POST /deliveries/:deliveryId/claim

Operação ATÔMICA (MongoDB atomic update):
├─ Se delivery.motoboyId é NULL → atribui
├─ Se delivery.motoboyId já existe → NEGA

Pseudocódigo:
```
delivery = Delivery.findByIdAndUpdate(
  deliveryId,
  { $set: { motoboyId: motoboyId, status: 'assigned' } },
  { new: true }
)

SE delivery.motoboyId !== motoboyId (perdeu a corrida):
  └─ return { error: 'Entrega já foi aceita por outro motoboy' }
ELSE:
  └─ Entrega agora é DESSE motoboy!
```

Status:
├─ Delivery.motoboyId = motoboy._id (AGORA TEM MOTOBOY!)
├─ Delivery.status = 'assigned'
└─ Delivery.updatedAt = now()

WebSocket Events (CRÍTICO):
├─ emitDeliveryStatusChanged(delivery) → Lojista vê
├─ emitToRoom(`user:${customerId}`, 'delivery:assigned', {...})
│  └─ CLIENTE VÊ EM TEMPO REAL! ⏳ → 🚗
│  └─ Com nome e rating do motoboy!
│
├─ emitToRoom(`user:${motoboyId}`, 'delivery:assigned_to_you', {...})
│  └─ Motoboy confirma que foi atribuído
│
└─ emitToRoom(`user:${storeId}`, ...)
   └─ Lojista vê quem vai buscar

✅ Isso é EXCELENTE! Cliente vê em tempo real!

⚠️ PROBLEMA IDENTIFICADO #3:
Motoboy pode nunca finalizar a entrega (simplesmente desaparece):
├─ Delivery fica em 'assigned' para sempre
├─ Cliente fica esperando (nunca sai do status 🚗)
├─ RISCO: Não há timeout ou limite de tempo


PASSO 4️⃣: Motoboy valida PIN de retirada na loja
════════════════════════════════════════════════

Entrada: POST /deliveries/:deliveryId/validar-pin-retirada
{
  pinRetirada: "123456"
}

Validação:
├─ pinRetirada === delivery.pinRetirada ✅
├─ delivery.status === 'assigned' (ainda não retirou)
└─ Só lojista pode validar

O que muda:
├─ Delivery.status = 'picked' (pegou na loja!)
└─ Motoboy agora possui o produto fisicamente

WebSocket Events:
├─ delivery:picked → Cliente sabe que pedido saiu da loja!
│  └─ "🚗 Motoboy retirou seu pedido da loja"
├─ order:picked_up → Lojista confirma entrega
└─ delivery:pin_validated → Motoboy pode ir pro cliente


PASSO 5️⃣: Motoboy entrega ao cliente
══════════════════════════════════════

Entrada: POST /deliveries/:deliveryId/finalizar
{
  pin: "654321"  // PIN que cliente recebeu
}

Validação:
├─ pin === delivery.pin ✅
├─ delivery.status IN ['picked', 'assigned'] (pode finalizar)
├─ delivery.motoboyId === userId (é o mesmo motoboy)
└─ Vê credenciais do cliente se necessário

Transação (ATÔMICA):
├─ Delivery.status = 'delivered'
├─ Order.status = 'entregue'
│
└─ ✅ Wallet(motoboy).balance += fee
   ├─ fee = 7 + (5 × 1) + bonus
   ├─ bonus = 2 se rating >= 4.5, 1 se >= 3.5
   │  └─ Neste caso: sem rating ainda, bonus = 0
   │  └─ fee = 12
   │
   ├─ Wallet(motoboy).totalIncome += 12
   └─ history.push({ type: 'credit', reason: 'Entrega completada', amount: 12 })

WebSocket Events:
├─ emitDeliveryCompleted(delivery, order)
│  └─ Todas as partes notificadas
├─ emitDeliveryStatusChanged(delivery) → Updated
├─ emitOrderStatusChanged(order) → Updated
│
└─ Cliente agora pode avaliar!

Gamificação (Motoboy):
├─ gamification.points += 10 (por finalizar)
├─ gamification.totalPoints += 10
└─ Possível ganhar badges ("Primeira entrega", "5 estrelas", etc)


PASSO 6️⃣: Cliente avalia loja
══════════════════════════════

Entrada: POST /orders/:orderId/evaluate-store
{
  storeRating: 5,
  storeComment: "Excelente! Muito bom mesmo!"
}

Validação:
├─ order.status === 'entregue' (só após entrega)
├─ order.customerId === userId (é o cliente)
└─ !order.storeRating (não avaliou ainda)

O que muda:
├─ Order.storeRating = 5
└─ Order.storeComment = "Excelente! ..."

PASSO 7️⃣: Cliente avalia motoboy
═════════════════════════════════

Entrada: POST /deliveries/:deliveryId/avaliar
{
  rating: 5,
  comment: "Entrega super rápida!"
}

Validação:
├─ delivery.status === 'delivered' (após entregar)
├─ order.customerId === userId (é o cliente do pedido)
└─ !delivery.rating (não avaliou ainda)

O que muda:
├─ Delivery.rating = 5
├─ Delivery.comment = "Entrega super rápida!"
│
└─ Gamificação motoboy:
   ├─ base: 10 pontos
   ├─ bônus rating >= 4: +5 pontos
   ├─ penalty rating <= 2: -2 pontos
   ├─ total aqui: 10 + 5 = 15 pontos
   │
   ├─ totalPoints += 15 (vai subindo nível)
   ├─ Verifica se ganhou badges
   └─ emitGamificationPointsEarned(...)


RESUMO DO FLUXO HAPPY PATH:
═════════════════════════════════════════════════════════════════════════════

Cliente         Loja            Motoboy         Sistema
│               │               │               │
├─ Order.status = 'criado'
│   └─ Wallets atualizadas (transação atômica)
│
├─ Notifica loja (WebSocket!) 🔔
│
└──────────────────→  POST /accept
                │
                ├─ Order.status = 'pago'
                ├─ Delivery.status = 'pending'
                │   └─ [PROBLEMA #2: sem transação!]
                │
                ├─ Notifica motoboys (WebSocket!) 🔔
                │
                └────────────────────→  POST /claim
                                   │
                                   ├─ Delivery.motoboyId = motoboy
                                   ├─ Delivery.status = 'assigned'
                                   │   └─ [PROBLEMA #3: sem timeout!]
                                   │
                                   ├─ Notifica cliente em tempo real! 🎯
                                   │   └─ "🚗 Motoboy a caminho!"
                                   │
                                   ├─ PIN retirada
                                   │
                                   ├─ POST /validar-pin-retirada
                                   │   └─ Delivery.status = 'picked'
                                   │
                                   ├─ [ENTREGA FÍSICA]
                                   │
                                   ├─ POST /finalizar
                                   │   ├─ Order.status = 'entregue'
                                   │   ├─ Wallet(motoboy) += 12
                                   │   └─ Gamification += 10 points
                                   │
                                   └─ Cliente avalia
                                       ├─ Order.storeRating = 5
                                       ├─ Delivery.rating = 5
                                       └─ Gamification += 15 points


WALLETS FINAIS (Happy Path):
═══════════════════════════════════════════════════════════════════════════════

Cliente:
├─ Saldo inicial: R$ 200
├─ Débito (pedido): -R$ 112
├─ Saldo final: R$ 88
└─ totalSpent: +R$ 112

Loja:
├─ Saldo inicial: R$ 1.000
├─ Crédito (venda): +R$ 89.60
├─ Saldo final: R$ 1.089.60
└─ totalIncome: +R$ 89.60

Plataforma (CEO):
├─ Saldo inicial: R$ 5.000
├─ Crédito (comissão): +R$ 22.40
├─ Saldo final: R$ 5.022.40
└─ totalIncome: +R$ 22.40

Motoboy:
├─ Saldo inicial: R$ 300
├─ Crédito (entrega): +R$ 12
├─ Crédito (bonus rating): +R$ 2 (futuro, após rating)
├─ Saldo final: R$ 314 (ou mais com bonus)
└─ totalIncome: +R$ 12 (ou más)

═══════════════════════════════════════════════════════════════════════════════
```

---

## ⚠️ Seção 2: TODOS OS CASOS DE CANCELAMENTO

### Matriz de Cancelamentos

```
┌─────────────────────────────────────────────────────────────────────┐
│                    CASOS DE CANCELAMENTO                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ CANCELADO POR CLIENTE (cancelOrderByCustomer)                       │
│ ─────────────────────────────────────────────────────────────────  │
│                                                                      │
│ Pré-requisitos:                                                     │
│ ├─ Order.customerId === userId                                      │
│ ├─ Order.status IN ['criado', 'pago', 'enviado']                   │
│ │  └─ NÃO pode ser 'entregue'!                                     │
│ │  └─ [PROBLEMA #4: Pode cancelar 'enviado'? Cliente tá sem        │
│ │     internet e pensa que cancelou, motoboy segue entregando]     │
│ │                                                                   │
│ └─ Requisição pode ter motivo/reasonCode:                          │
│    ├─ 'customer_request': Cliente quer cancelar mesmo              │
│    ├─ 'wrong_items': Itens errados                                  │
│    ├─ 'changed_mind': Mudei de ideia                                │
│    └─ etc                                                            │
│                                                                      │
│ O que acontece:                                                      │
│ ├─ Cria Cancellation document:                                      │
│ │  └─ cancelledBy: 'customer'                                       │
│ │  └─ refundAmount: order.totalValue                                │
│ │  └─ refundStatus: 'processed' (simulado porque não tem payment    │
│ │                                 gateway integrado)                 │
│ │                                                                    │
│ ├─ Order.status = 'cancelado' ❌                                    │
│ ├─ Order.cancelledAt = now()                                        │
│ ├─ Order.cancellationId = cancellation._id                          │
│ │                                                                    │
│ └─ ✅ REFUND AUTOMÁTICO:                                            │
│    └─ Wallet(cliente).balance += refundAmount                       │
│       ├─ totalSpent = Math.max(0, totalSpent - refundAmount)        │
│       │  └─ [PROBLEMA #5: Isso está ERRADO!]                       │
│       │  └─ Se cliente gastou R$ 112, depois cancelou:             │
│       │     ├─ totalSpent = max(0, 112 - 112) = 0                  │
│       │     └─ Parece que cliente NUNCA gastou!                     │
│       │     └─ Deveria ter DOIS tipos de transação:                 │
│       │        ├─ debit (gasto original)                            │
│       │        └─ refund (devolução)                                │
│       │        └─ E totalSpent deveria ser 112 mesmo após refund    │
│       │                                                              │
│       └─ Adiciona ao history:                                       │
│          └─ type: 'refund' (não 'credit')                           │
│          └─ category: 'refund'                                      │
│          └─ amount: refundAmount                                    │
│                                                                      │
│ └─ Se há Delivery:                                                  │
│    └─ Delivery.status = 'cancelled'                                 │
│    └─ Delivery.cancelledAt = now()                                  │
│    └─ [PROBLEMA #6: Delivery pode estar 'picked' ou 'delivered']   │
│       └─ Se 'picked': motoboy tem o produto! Não pode devolver    │
│       └─ Se 'delivered': cliente já recebeu! Não pode cancelar    │
│                                                                      │
│ WebSocket:                                                           │
│ └─ emitOrderCancelled(order, cancellation)                          │
│ └─ emitDeliveryCancelled(if applicable)                             │
│                                                                      │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ CANCELADO POR LOJA (rejectOrderByStore)                             │
│ ────────────────────────────────────────────────────────────────── │
│                                                                      │
│ Pré-requisitos:                                                      │
│ ├─ store.ownerId === userId                                         │
│ ├─ Order.storeId === store._id                                      │
│ ├─ Order.status IN ['criado', 'pago']                               │
│ │  └─ PODE rejeitar logo quando recebe (status 'criado')            │
│ │  └─ OU depois de aceitar (status 'pago')                          │
│ │  └─ [PROBLEMA #7: Por que rejeitar DEPOIS de aceitar?]           │
│ │     └─ Isso não deveria ser permitido!                            │
│                                                                      │
│ └─ Requisição pode ter motivo:                                      │
│    ├─ 'not_available': Produto não está disponível                  │
│    ├─ 'store_closed': Loja fechou                                   │
│    ├─ 'store_busy': Muito ocupado                                   │
│    └─ etc                                                            │
│                                                                      │
│ O que acontece:                                                      │
│ ├─ Cria Cancellation:                                               │
│ │  └─ cancelledBy: 'store'                                          │
│ │  └─ refundAmount: order.totalValue                                │
│ │  └─ refundStatus: 'processed' (simulado)                          │
│ │                                                                    │
│ ├─ Order.status = 'rejeitado' ❌                                    │
│ ├─ Order.cancelledAt = now()                                        │
│ │                                                                    │
│ ├─ ❌ PROBLEMA #8: NÃO FAZ REFUND!                                  │
│ │    └─ Wallet do cliente NÃO é creditada!                         │
│ │    └─ Cliente pagou, pedido foi rejeitado, cliente fica com       │
│ │       saldo zerado!                                               │
│ │    └─ ISSO É UM BUG GRAVE!                                        │
│ │                                                                    │
│ └─ Se há Delivery:                                                  │
│    ├─ Delivery.status = 'cancelled'                                 │
│    ├─ Delivery.cancelledAt = now()                                  │
│    └─ emitDeliveryCancelled(...)                                    │
│                                                                      │
│ WebSocket:                                                           │
│ ├─ emitOrderRejectedByStore(order, reason)                          │
│ └─ emitOrderCancelled(order, cancellation)                          │
│                                                                      │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ CANCELADO POR MOTOBOY - REATRIBUIÇÃO (rejectDeliveryByMotoboy)    │
│ ───────────────────────────────────────────────────────────────── │
│                                                                      │
│ Pré-requisitos:                                                      │
│ ├─ delivery.motoboyId === userId                                    │
│ ├─ delivery.status IN ['assigned', 'picked']                        │
│ │  └─ Não pode rejeitar 'pending' (não foi atribuído)               │
│ │  └─ Não pode rejeitar 'delivered' (já entregou)                   │
│                                                                      │
│ └─ action: 'reassign' (devolve para o pool)                        │
│                                                                      │
│ O que acontece:                                                      │
│ ├─ Cria Cancellation:                                               │
│ │  └─ cancelledBy: 'motoboy'                                        │
│ │  └─ Sem refund (não envolve cliente)                              │
│ │                                                                    │
│ ├─ Delivery.status = 'pending' (volta ao início!)                   │
│ ├─ Delivery.motoboyId = NULL (remove motoboy)                       │
│ ├─ Delivery.updatedAt = now()                                       │
│ │                                                                    │
│ └─ Próximo motoboy pode 'claim' novamente                           │
│                                                                      │
│ WebSocket:                                                           │
│ └─ emitDeliveryRejected(delivery, 'motoboy', reason)                │
│                                                                      │
│ [PROBLEMA #9: Cliente não é notificado!]                           │
│ └─ Cliente estava vendo "🚗 Motoboy a caminho"                     │
│ └─ De repente, quem sabe por quanto tempo, fica 'reassignando'      │
│ └─ Cliente fica confuso                                             │
│                                                                      │
│                                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│ CANCELADO POR MOTOBOY - CANCELAMENTO COMPLETO                       │
│ ───────────────────────────────────────────────────────────────── │
│                                                                      │
│ Pré-requisitos:                                                      │
│ ├─ delivery.motoboyId === userId                                    │
│ ├─ delivery.status IN ['assigned', 'picked']                        │
│ └─ action: 'cancel' (cancela tudo, não só reatribui)               │
│                                                                      │
│ O que acontece:                                                      │
│ ├─ Delivery.status = 'cancelled'                                    │
│ ├─ Delivery.cancelledAt = now()                                     │
│ │                                                                    │
│ ├─ Order também é cancelada:                                        │
│ │  ├─ Order.status = 'cancelado'                                    │
│ │  ├─ Order.cancelledAt = now()                                     │
│ │  │                                                                │
│ │  └─ ❌ PROBLEMA #10: TAMBÉM NÃO FAZ REFUND!                      │
│ │     └─ Cliente fica sem seu dinheiro!                             │
│ │                                                                    │
│ └─ Cria Cancellation:                                               │
│    └─ cancelledBy: 'motoboy'                                        │
│                                                                      │
│ WebSocket:                                                           │
│ └─ emitDeliveryCancelled(delivery, cancellation)                    │
│ └─ emitOrderCancelled(order, cancellation)                          │
│                                                                      │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 🔴 Seção 3: PROBLEMAS ENCONTRADOS

### CRÍTICOS 🔴

#### PROBLEMA #1: Order.status = 'enviado' é permitido em cancelamento do cliente
```
O quê:
├─ Cliente pode cancelar um pedido que já foi aceito E motoboy pegou!
├─ Status 'enviado' significa motoboy está no caminho
│
Código:
├─ const cancellableStatuses = ['criado', 'pago', 'enviado'];
│  └─ Permite cancelar 'enviado'!
│
Risco:
├─ Cliente cancela porque perdeu conexão com WiFi
├─ Backend processa cancelamento
├─ Reembolsa o cliente
├─ MAS motoboy segue entregando!
│  └─ Motoboy chega, cliente diz "Cancelei!"
│  └─ Motoboy tem o produto fisicamente
│  └─ Conflict: Quem fica com o produto?
│
Impacto:
└─ Fraude potencial, perda de estoque, confusão

Recomendação:
└─ Cancelamento deve ser BLOQUEADO quando status IN ['enviado', 'entregue']
```

#### PROBLEMA #2: rejectOrderByStore NÃO faz refund!
```
O quê:
├─ Quando loja rejeita um pedido (status 'pago'), cliente NÃO recebe dinheiro de volta
│
Código:
├─ const refundAmount = order.paymentStatus === 'paid' ? order.totalValue : 0;
├─ Mas refund nunca é processado na wallet do cliente!
│
Risco:
├─ Cliente pagou R$ 112
├─ Loja rejeita
├─ Cliente fica com R$ 0 (dinheiro desapareceu!)
├─ Isso viola o contrato de negócio!
│
Impacto:
└─ GRAVE: Cliente perde dinheiro

Recomendação:
└─ Adicionar código de refund igual ao cancelOrderByCustomer
```

#### PROBLEMA #3: rejectDeliveryByMotoboy com action='cancel' NÃO faz refund!
```
O quê:
├─ Quando motoboy cancela uma entrega, cliente também deveria receber refund
│
Código:
├─ Delivery fica 'cancelled'
├─ Order fica 'cancelado'
├─ Mas Wallet(cliente) NÃO é creditada!
│
Risco:
├─ Motoboy desiste ("achei perigoso o bairro", "cliente irrealizável")
├─ Cliente perde o dinheiro dele
│
Impacto:
└─ GRAVE: Cliente perde dinheiro

Recomendação:
└─ Processar refund quando motoboy cancela
```

#### PROBLEMA #4: Não há lógica de reembolso cruzado de wallets!
```
O quê:
├─ Quando o cliente é compensado com refund, as wallets da loja e CEO
│  não são "desfeitas"
│
Cenário:
├─ Client pagou: 112
│  └─ Loja +89.60, CEO +22.40
├─ Client cancela (refund processado)
│  └─ Client recebe 112 de volta
│  └─ MAS Loja e CEO CONTINUAM com os 89.60 e 22.40!
│
Impacto:
└─ CRÍTICO: "Dinheiro do nada" é criado no sistema!
```

#### PROBLEMA #5: Estoque é revertido no cancelamento do cliente, MAS NÃO no refund da loja!
```
O quê:
├─ Cliente faz pedido:
│  └─ Product.quantity -= 2 (estoque vai de 10 para 8)
│
├─ Cliente cancela:
│  └─ Product.quantity += 2 (estoque volta para 10) ✅ Correto!
│
├─ MAS quando loja rejeita (s'sem refund), estoque fica como?
│  └─ NÃO há código que REVERTA o estoque!
│  └─ Estoque continua decrementado
│
Impacto:
└─ BUG: Estoque inconsistente

Recomendação:
└─ Sempre reverter estoque quando ordem é cancelada
```

### ALTOS 🟠

#### PROBLEMA #6: Sem timeout para motoboy em delivery 'assigned'
```
O quê:
├─ Delivery pode ficar em status 'assigned' por DIAS
│  └─ Motoboy desapareceu, não rejeita, não finaliza
├─ Cliente fica esperando indefinidamente
│  └─ Status 'enviado' nunca muda para 'entregue'
│
Impacto:
└─ Cliente frustrado, sem saber se será entregue

Recomendação:
├─ Auto-rejeição após X minutos (ex: 30 min)
│  └─ Volta para 'pending', outro motoboy pega
└─ Ou notificar cliente: "Motoboy não compareceu"
```

#### PROBLEMA #7: Loja pode ACEITAR e depois REJEITAR
```
O quê:
├─ Order pode estar em status 'pago' (já foi aceita)
├─ Loja AINDA consegue rejeitar!
│
Código:
├─ if (!['criado', 'pago'].includes(order.status))
│  └─ Se status é 'pago', permite rejeitar
│
Impacto:
├─ Confusão: Loja já começou a preparar, depois muda de ideia
├─ Motoboy já é notificado, depois é cancelado
└─ Cliente entende como "aceito" mas é rejeitado

Recomendação:
├─ Apenas 'criado' pode ser rejeitado
├─ 'pago' NO MÁXIMO consegue "cancel" (não "reject")
└─ Semântica diferente
```

#### PROBLEMA #8: refundAmount em rejectOrderByStore NUNCA é processado
```
O quê:
├─ Há código que define refundAmount e refundStatus
├─ MAS não há código que credita Wallet(cliente)!
│
Código:
```:
let refundAmount = 0;
let refundStatus = 'pending';

if (order.paymentStatus === 'paid') {
  refundAmount = order.totalValue || 0;
  try {
    // TODO: Integrar com payment gateway
    refundStatus = 'processed';
  } catch (error) {
    refundStatus = 'failed';
  }
}

// ❌ MISSING: Wallet credit code!
// ❌ Cancellation é criada com refundAmount
// ❌ MAS NUNCA processa na wallet do cliente
```

Recomendação:
└─ Adiciona refund logic

### MÉDIOS 🟡

#### PROBLEMA #9: Quando motoboy 'reassign', cliente não é notificado
```
O quê:
├─ Motoboy rejeita entrega com action='reassign'
├─ Delivery volta para 'pending'
├─ MAS cliente segue vendo "🚗 Motoboy a caminho"
│
Impacto:
└─ Cliente confuso, não sabe que foi cancelado

Recomendação:
└─ emitToRoom(`user:${customerId}`, 'delivery:reassigned', ...)
```

#### PROBLEMA #10: Order.status === 'entregue' mas pode ser cancelado se cliente está offline
```
O quê:
├─ O código valida:
│  └─ if (order.status === 'entregue') return error
├─ MAS é possível race condition se:
│  ├─ Cliente envia request de cancelamento ANTES de saber que foi entregue
│  ├─ Servidor recebe request com latência
│  ├─ Entrega finaliza no meio do caminho
│  └─ Cancelamento é processado depois
│
Recomendação:
└─ Usar idempotentKey também em cancelamento (ex: cada cliente pode ter 1 cancelamento por pedido)
```

---

## 💡 Seção 4: RECOMENDAÇÕES DE MELHORIA

### Priority 1: CRÍTICO - Implementar Imediatamente

#### 1.1 Adicionar Refund Logic em rejectOrderByStore
```typescript
// Em rejectOrderByStore, após atualizar Order.status

// ✅ NOVO: Processa refund automático
if (refundAmount > 0 && refundStatus === 'processed') {
  try {
    let wallet = await Wallet.findOne({ 
      owner: order.customerId, 
      ownerType: 'user' 
    });

    if (!wallet) {
      wallet = await Wallet.create({
        owner: order.customerId,
        ownerType: 'user',
        balance: refundAmount,
        totalIncome: 0,
        history: [{
          type: 'refund',
          category: 'refund',
          amount: refundAmount,
          reason: 'Reembolso - Pedido rejeitado pela loja',
          date: new Date(),
          reference: `REJECT_${orderId}`
        }]
      });
    } else {
      wallet.balance += refundAmount;
      // ✅ NÃO decrementa totalSpent (foi uma devolução, não um novo gasto)
      wallet.history.push({
        type: 'refund',
        category: 'refund',
        amount: refundAmount,
        reason: 'Reembolso - Pedido rejeitado pela loja',
        date: new Date(),
        reference: `REJECT_${orderId}`
      });
      await wallet.save();
    }
    
    console.log(`✅ Refund processado: R$ ${refundAmount} para cliente ${order.customerId}`);
  } catch (walletError) {
    console.error('Erro ao processar refund:', walletError);
    // Log para manual processing depois
  }
}
```

#### 1.2 Adicionar Refund Logic em rejectDeliveryByMotoboy (action='cancel')
```typescript
// Similar ao acima, mas com mensagem diferente

if (action === 'cancel') {
  delivery.status = 'cancelled';
  delivery.cancelledAt = new Date();
  await delivery.save();

  const order = await Order.findById(delivery.orderId);
  if (order && order.status !== 'entregue') {
    order.status = 'cancelado';
    order.cancelledAt = new Date();
    
    // ✅ NOVO: Refund automático
    const refundAmount = order.totalValue || 0;
    if (refundAmount > 0) {
      try {
        let wallet = await Wallet.findOne({
          owner: order.customerId,
          ownerType: 'user'
        });

        if (!wallet) {
          wallet = await Wallet.create({
            owner: order.customerId,
            ownerType: 'user',
            balance: refundAmount,
            history: [{
              type: 'refund',
              amount: refundAmount,
              reason: 'Reembolso - Entrega cancelada por motoboy',
              date: new Date(),
              reference: `CANCEL_DELIVERY_${delivery._id}`
            }]
          });
        } else {
          wallet.balance += refundAmount;
          wallet.history.push({
            type: 'refund',
            amount: refundAmount,
            reason: `Reembolso - Entrega cancelada: ${reason}`,
            date: new Date(),
            reference: `CANCEL_DELIVERY_${delivery._id}`
          });
          await wallet.save();
        }
      } catch (err) {
        console.error('Erro ao refund:', err);
      }
    }

    await order.save();
    emitOrderCancelled(order.toObject(), cancellation.toObject());
  }
  
  emitDeliveryCancelled(delivery.toObject(), cancellation.toObject());
  
  return res.json({ success: true, ... });
}
```

#### 1.3 Revert Cruzado de Wallets em Cancelamento
```typescript
/**
 * Quando um pedido é cancelado, reverter a distribuição original
 */
async function revertWalletDistribution(orderId: string) {
  const order = await Order.findById(orderId);
  if (!order || !order.walletDistribution) return;

  const { storeAmount, ceoAmount } = order.walletDistribution;

  try {
    // Debita loja
    await Wallet.updateOne(
      { owner: order.storeId, ownerType: 'store' },
      { 
        $inc: { balance: -storeAmount },
        $push: {
          history: {
            type: 'debit',
            category: 'refund',
            amount: storeAmount,
            reason: `Reembolso de venda - Pedido ${orderId} cancelado`,
            date: new Date()
          }
        }
      }
    );

    // Debita CEO
    await Wallet.updateOne(
      { owner: 'platform', ownerType: 'platform' },
      { 
        $inc: { balance: -ceoAmount },
        $push: {
          history: {
            type: 'debit',
            category: 'refund',
            amount: ceoAmount,
            reason: `Reembolso de comissão - Pedido ${orderId} cancelado`,
            date: new Date()
          }
        }
      }
    );

    console.log(`✅ Wallets revertidas: Loja -${storeAmount}, CEO -${ceoAmount}`);
  } catch (err) {
    console.error('Erro ao reverter wallets:', err);
  }
}
```

#### 1.4 Revert de Estoque em Todos os Cancelamentos
```typescript
// Criar função auxiliar
async function revertOrderStock(orderId: string) {
  const order = await Order.findById(orderId);
  if (!order) return;

  for (const item of order.products) {
    await Product.findByIdAndUpdate(
      item.productId,
      { $inc: { quantity: item.quantity } },
      { new: true }
    );
  }
  
  console.log(`✅ Estoque revertido para pedido ${orderId}`);
}

// Chamar em:
// - cancelOrderByCustomer
// - rejectOrderByStore
// - rejectDeliveryByMotoboy (cancel)
```

#### 1.5 Bloquear Cancelamento em Status Críticos
```typescript
// Em cancelOrderByCustomer

// ✅ AJUSTADO: Remover 'enviado' da lista
const cancellableStatuses = ['criado', 'pago'];  // Removeu 'enviado'
if (!cancellableStatuses.includes(order.status)) {
  return res.status(400).json({
    error: `Pedido não pode ser cancelado no estado: ${order.status}. ` +
           `Contate a loja ou aguarde a entrega.`,
    currentStatus: order.status,
  });
}
```

#### 1.6 Adicionar Transação Mongoose em acceptOrderByStore
```typescript
// ✅ NOVO: Envolver em transação

const session = await mongoose.startSession();
session.startTransaction();

try {
  // ... validações ...

  // Atualiza order
  await Order.updateOne(
    { _id: orderId },
    { status: 'pago', acceptedAt: new Date() },
    { session }
  );

  // Cria delivery (dentro da transação)
  const delivery = new Delivery({ /* ... */ });
  await delivery.save({ session });

  // Atualiza order com deliveryId
  await Order.updateOne(
    { _id: orderId },
    { deliveryId: delivery._id },
    { session }
  );

  // Commit
  await session.commitTransaction();
  
  return res.json({ ... });
} catch (err) {
  await session.abortTransaction();
  throw err;
} finally {
  await session.endSession();
}
```

### Priority 2: ALTO - Implementar em Seguida

#### 2.1 Auto-Rejeição de Deliveries com Timeout
```typescript
// Novo endpoint: /deliveries/check-timeouts (rodar a cada 5 min via cron)

import cron from 'node-cron';

// Rodar a cada 5 minutos
cron.schedule('*/5 * * * *', async () => {
  try {
    const TIMEOUT_MINUTES = 30;
    const cutoffTime = new Date(Date.now() - TIMEOUT_MINUTES * 60 * 1000);

    const timedOut = await Delivery.find({
      status: 'assigned',
      createdAt: { $lt: cutoffTime }
    });

    for (const delivery of timedOut) {
      // Volta para pending
      delivery.status = 'pending';
      delivery.motoboyId = undefined;
      await delivery.save();

      // Notifica cliente
      const order = await Order.findById(delivery.orderId);
      if (order) {
        emitToRoom(`user:${order.customerId}`, 'delivery:reassigned', {
          reason: 'Motoboy não compareceu',
          message: 'Outro motoboy será atribuído',
          timestamp: new Date()
        });
      }

      // Notifica loja
      emitToRoom(`store:${order.storeId}`, 'delivery:motoboy_timeout', {
        deliveryId: delivery._id,
        message: 'Motoboy desapareceu, reatrbuindo'
      });

      console.log(`⏰ Timeout: Delivery ${delivery._id} foi reatribuída`);
    }
  } catch (err) {
    console.error('Erro em timeout check:', err);
  }
});
```

#### 2.2 Separar 'Reject' de 'Cancel' em rejectOrderByStore
```typescript
// Novo: Apenas 'criado' pode rejeitar
// Novo: 'pago' pode ser "cancelado" (não rejeitado)

export const rejectOrderByStore = async (req, res) => {
  const order = await Order.findById(orderId);

  if (order.status !== 'criado') {
    return res.status(400).json({
      error: 'Apenas pedidos recém-criados podem ser rejeitados'
    });
  }

  // Processa rejeição (sem refund, porque nunca foi aceito)
  // Client pode tentar outra loja
  ...
};

export const cancelOrderByStore = async (req, res) => {
  const order = await Order.findById(orderId);

  if (order.status !== 'pago') {
    return res.status(400).json({
      error: 'Apenas pedidos aceitos podem ser cancelados'
    });
  }

  // Processa cancelamento COM REFUND
  ...
};
```

#### 2.3 Notificar Cliente em Reassignment
```typescript
// Em rejectDeliveryByMotoboy, action='reassign':

if (action === 'reassign') {
  delivery.status = 'pending';
  delivery.motoboyId = undefined;
  await delivery.save();

  const order = await Order.findById(delivery.orderId);

  // ✅ NOVO: Notificar cliente
  emitToRoom(`user:${order.customerId}`, 'delivery:reassigned', {
    orderId: order._id,
    deliveryId: delivery._id,
    reason: reason || 'Motoboy indisponível',
    message: 'Um novo motoboy será atribuído em breve',
    timestamp: new Date()
  });

  emitDeliveryRejected(delivery.toObject(), 'motoboy', reason);
  
  return res.json({ ... });
}
```

### Priority 3: MÉDIO - Nice to Have

#### 3.1 Idempotência em Cancelamento
```typescript
// Cliente não pode cancelar o mesmo pedido 2x

const cancellationKey = `${orderId}_${customerId}_cancel`;
const existingCancellation = await Cancellation.findOne({
  orderId,
  cancelledBy: 'customer'
});

if (existingCancellation) {
  return res.status(200).json({
    message: 'Pedido já foi cancelado',
    cancellationId: existingCancellation._id
  });
}
```

#### 3.2 Auditoria Completa
```typescript
// Toda operação financeira deve logar em AuditLog

interface IAuditLog {
  action: string;  // 'order_created', 'refund_processed', etc
  actor: string;   // userId
  actorRole: string; // 'cliente', 'loja', 'admin'
  targetId: string; // orderId, deliveryId, walletId
  before: any;     // estado anterior
  after: any;      // estado novo
  impact: {        // impacto financeiro
    wallets: Array<{ walletId, delta }>
  },
  timestamp: Date;
  metadata?: any;
}

// Criar quando:
// - Ordem criada/cancelada
// - Refund processado
// - Wallet alterada
// - Delivery atribuída/cancelada
```

---

## 📊 Resumo de Problemas por Severidade

```
🔴 CRÍTICOS (Implementar hoje):
├─ rejectOrderByStore não faz refund
├─ rejectDeliveryByMotoboy (cancel) não faz refund
├─ Wallets da loja/CEO não são revertidas em cancelamento
├─ Estoque não é revertido em rejectOrderByStore
└─ Cliente pode cancelar 'enviado' (race condition)

🟠 ALTOS (Esta semana):
├─ Sem timeout para motoboy em delivery 'assigned'
├─ Loja pode aceitar e depois rejeitar (confusão)
├─ Cliente não é notificado de reassignment
├─ Sem transação Mongoose em acceptOrderByStore
└─ Status 'enviado' não deveria existir (ou ser bem definido)

🟡 MÉDIOS (Este mês):
├─ Sem idempotência em cancelamento
├─ Sem auditoria completa
├─ Sem rate limiting em cancelamentos
└─ Sem notificação de timeout para cliente
```

---

## 🎯 Recomendação Final

**O sistema de pagamentos está perigoso!** 

Os bugs #2, #3 e #4 fazem com que clientes percam dinheiro sem compensação. Isso vai resultar em:
- Chargebacks (pelo sistema de pagamento real quando integrado)
- Reclamações no suporte
- Confiança perdida na plataforma

**Implementar Priority 1 HOJE** antes de qualquer outra coisa!

---

**Análise concluída:** 3 de Março de 2026
