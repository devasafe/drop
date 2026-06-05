
# Testing Cancelamentos e Rejeições

## Configuração do Teste

### Pré-requisitos

- Backend rodando em `http://localhost:3333`
- Frontend rodando em `http://localhost:3000`
- Socket.IO conectado
- Base de dados MongoDB com dados de teste

### Dados de Teste Necessários

```bash
# Criar usuários e pedidos de teste
# Pode ser feito via script ou manualmente através do dashboard

1. Cliente: test@cliente.com (senha: 123456)
2. Lojista: loja@teste.com (senha: 123456)
3. Motoboy: moto@teste.com (senha: 123456)
```

## Testes via cURL

### 1. Test - Cliente Cancela Pedido

```bash
# 1. Obter token do cliente
curl -X POST http://localhost:3333/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@cliente.com",
    "password": "123456"
  }'

# Salvar token em variável
export CLIENTE_TOKEN="seu_token_aqui"

# 2. Listar pedidos do cliente
curl -X GET http://localhost:3333/orders \
  -H "Authorization: Bearer $CLIENTE_TOKEN"

# Salvar ID do pedido em status 'pago' ou 'criado'
export ORDER_ID="id_do_pedido"

# 3. Cancelar pedido
curl -X POST http://localhost:3333/orders/$ORDER_ID/cancel \
  -H "Authorization: Bearer $CLIENTE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Mudei de ideia sobre o produto",
    "reasonCode": "changed_mind"
  }'

# Esperado (200):
{
  "success": true,
  "orderId": "...",
  "status": "cancelado",
  "refundAmount": 99.90,
  "refundStatus": "processed",
  "cancellationId": "..."
}

# 4. Verificar histórico de cancelamento
curl -X GET http://localhost:3333/orders/$ORDER_ID/cancellations \
  -H "Authorization: Bearer $CLIENTE_TOKEN"

# Esperado (200):
{
  "success": true,
  "count": 1,
  "history": [
    {
      "_id": "...",
      "orderId": "...",
      "cancelledBy": "customer",
      "reason": "Mudei de ideia sobre o produto",
      "reasonCode": "changed_mind",
      "refundAmount": 99.90,
      "refundStatus": "processed",
      "createdAt": "2024-01-15T10:30:00Z"
    }
  ]
}
```

### 2. Test - Motoboy Rejeita Entrega (Reassign)

```bash
# 1. Obter token do motoboy
curl -X POST http://localhost:3333/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "moto@teste.com",
    "password": "123456"
  }'

export MOTO_TOKEN="seu_token_aqui"

# 2. Listar entregas disponíveis
curl -X GET http://localhost:3333/deliveries/available \
  -H "Authorization: Bearer $MOTO_TOKEN"

# 3. Reivindicar uma entrega
export DELIVERY_ID="id_da_entrega"

curl -X POST http://localhost:3333/deliveries/$DELIVERY_ID/claim \
  -H "Authorization: Bearer $MOTO_TOKEN"

# 4. Rejeitar entrega com ação 'reassign'
curl -X POST http://localhost:3333/deliveries/$DELIVERY_ID/reject \
  -H "Authorization: Bearer $MOTO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Não consigo chegar ao local. Trânsito muito pesado.",
    "reasonCode": "unable_to_deliver",
    "action": "reassign"
  }'

# Esperado (200):
{
  "success": true,
  "deliveryId": "...",
  "status": "pending",
  "action": "reassign",
  "reason": "Não consigo chegar ao local. Trânsito muito pesado."
}

# ✓ Entrega volta ao pool, outro motoboy pode reivindicar
```

### 3. Test - Motoboy Rejeita Entrega (Cancel)

```bash
# 1. Assumir que há uma entrega em status 'picked'
export DELIVERY_ID="id_da_entrega_picked"

# 2. Rejeitar e cancelar completamente
curl -X POST http://localhost:3333/deliveries/$DELIVERY_ID/reject \
  -H "Authorization: Bearer $MOTO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Cliente não está respondendo há 30 minutos",
    "reasonCode": "customer_unavailable",
    "action": "cancel"
  }'

# Esperado (200):
{
  "success": true,
  "deliveryId": "...",
  "status": "cancelled",
  "action": "cancel",
  "reason": "Cliente não está respondendo há 30 minutos"
}

# ✓ Pedido e entrega cancelados, cliente recebe refund automático
```

### 4. Test - Loja Aceita Pedido

```bash
# 1. Obter token do lojista
curl -X POST http://localhost:3333/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "loja@teste.com",
    "password": "123456"
  }'

export LOJA_TOKEN="seu_token_aqui"

# 2. Listar pedidos em status 'criado'
curl -X GET http://localhost:3333/orders \
  -H "Authorization: Bearer $LOJA_TOKEN"

# Pegar ID de um pedido em 'criado'
export ORDER_ID="..."

# 3. Aceitar pedido
curl -X POST http://localhost:3333/orders/$ORDER_ID/accept \
  -H "Authorization: Bearer $LOJA_TOKEN"

# Esperado (200):
{
  "success": true,
  "orderId": "...",
  "status": "pago",
  "acceptedAt": "2024-01-15T10:35:00Z"
}

# ✓ Pedido muda para 'pago', pronto para preparação
```

### 5. Test - Loja Rejeita Pedido

```bash
# 1. Com LOJA_TOKEN já obtido, rejeitar um pedido
export ORDER_ID="id_do_pedido_criado"

curl -X POST http://localhost:3333/orders/$ORDER_ID/reject \
  -H "Authorization: Bearer $LOJA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Produto em falta no estoque",
    "reasonCode": "inventory_error"
  }'

# Esperado (200):
{
  "success": true,
  "orderId": "...",
  "status": "cancelado",
  "reason": "Produto em falta no estoque",
  "refundAmount": 99.90,
  "refundStatus": "processed",
  "cancellationId": "..."
}

# ✓ Pedido cancelado, cliente recebe refund automático
```

### 6. Test - Obter Estatísticas de Cancelamento

```bash
# Apenas lojista pode ver suas próprias estatísticas
curl -X GET http://localhost:3333/orders/stats/cancellations \
  -H "Authorization: Bearer $LOJA_TOKEN"

# Esperado (200):
{
  "success": true,
  "byReason": [
    {
      "_id": "customer_request",
      "count": 3,
      "totalRefund": 299.70
    },
    {
      "_id": "inventory_error",
      "count": 1,
      "totalRefund": 99.90
    }
  ],
  "byRefundStatus": [
    {
      "_id": "processed",
      "count": 4,
      "total": 399.60
    },
    {
      "_id": "pending",
      "count": 0,
      "total": 0
    },
    {
      "_id": "failed",
      "count": 0,
      "total": 0
    }
  ],
  "totalCancellations": 4
}
```

## Testes via Frontend

### 1. Teste - Cliente Cancela Pedido

```typescript
// 1. Acessar como cliente
// Home → Meus Pedidos → Selecionar pedido em status "pago"

// 2. Na página de detalhes do pedido:
// - Deve ver botão "Cancelar Pedido"
// - Clique no botão

// 3. Modal abre com:
// - Opções de motivo (Mudei de ideia, Endereço errado, etc)
// - Campo de motivo customizado se selecionar "Outro"
// - Aviso sobre refund em até 2 horas

// 4. Confirme o cancelamento

// 5. Esperado:
// ✓ Toast de sucesso: "Pedido cancelado com sucesso"
// ✓ Status do pedido muda para "cancelado"
// ✓ Loja recebe notificação via socket
// ✓ Cliente recebe notificação de refund processado
```

### 2. Teste - Motoboy Rejeita Entrega

```typescript
// 1. Acessar como motoboy
// Home → Minhas Entregas → Selecionar entrega em status "assigned" ou "picked"

// 2. Na página de detalhes da entrega:
// - Deve ver botão "Rejeitar Entrega"
// - Clique no botão

// 3. Modal Step 1 - Motivo:
// - Selecione um motivo (não consigo chegar, cliente não atende, etc)
// - Clique "Próximo"

// 4. Modal Step 2 - Ação:
// - Opção "Devolver ao Pool" (entrega volta para retirada)
// - Opção "Cancelar Entrega" (cancelamento total com refund)
// - Selecione uma ação, clique "Próximo"

// 5. Modal Step 3 - Confirmação:
// - Revise motivo e ação
// - Confirme

// 6. Esperado:
// ✓ Toast de sucesso apropriado
// ✓ Se "reassign": volta para lista de entregas disponíveis
// ✓ Se "cancel": pedido cancelado, cliente notificado
// ✓ Loja recebe notificação via socket
```

### 3. Teste - Loja Aceita/Rejeita Pedido

```typescript
// 1. Acessar como lojista
// Dashboard → Painel de Pedidos

// 2. Procure pedidos com status "Pendente" (amarelo)

// 3. Para cada pedido pendente, você vê:
// - Botão verde "✓ Aceitar Pedido"
// - Botão vermelho "✕ Rejeitar"

// ===== ACEITAR =====
// 4a. Clique em "Aceitar Pedido"
// 5a. Confirme na caixa de diálogo
// 6a. Esperado:
//     ✓ Toast: "Pedido aceito com sucesso"
//     ✓ Status muda para "Aceito" (verde)
//     ✓ Pedido pronto para preparação
//     ✓ Cliente notificado via socket

// ===== REJEITAR =====
// 4b. Clique em "Rejeitar"
// 5b. Modal abre com opções:
//     - Loja fechada
//     - Erro de inventário
//     - Alto volume de pedidos
//     - Outro motivo (com texto custom)
// 6b. Selecione motivo e confirme
// 7b. Esperado:
//     ✓ Toast: "Pedido rejeitado com sucesso"
//     ✓ Status muda para "Cancelado" (cinza)
//     ✓ Cliente recebe refund
//     ✓ Email/SMS de rejeição enviado ao cliente
```

## Testes via Socket Listener

### Criar Test File: test-cancellations.js

```javascript
const io = require('socket.io-client');

const socket = io('http://localhost:3333', {
  auth: {
    token: 'seu_token_aqui' // Token de um usuário
  }
});

const events = [
  'order:cancelled',
  'delivery:rejected_by_motoboy',
  'delivery:cancelled',
  'order:accepted_by_store',
  'order:rejected_by_store',
];

events.forEach(event => {
  socket.on(event, (data) => {
    console.log(`\n✓ EVENTO: ${event}`);
    console.log('Data:', JSON.stringify(data, null, 2));
  });
});

socket.on('connect', () => {
  console.log('✓ Conectado ao socket');
});

// Mantém a conexão por 2 minutos
setTimeout(() => {
  socket.disconnect();
  process.exit(0);
}, 120000);
```

### Rodar Teste:

```bash
node test-cancellations.js &
# Depois execute os testes via cURL ou via interface web
# Os eventos devem aparecer em tempo real
```

## Verificação de Banco de Dados

### Collection: cancellations

```javascript
// Verificar cancellations criadas
db.cancellations.find({}).pretty()

// Exemplo de documento:
{
  "_id": ObjectId("..."),
  "orderId": ObjectId("..."),
  "deliveryId": ObjectId("..."),
  "cancelledBy": "customer",
  "reason": "Mudei de ideia",
  "reasonCode": "changed_mind",
  "refundAmount": 99.90,
  "refundStatus": "processed",
  "createdAt": ISODate("2024-01-15T10:30:00Z"),
  "updatedAt": ISODate("2024-01-15T10:30:00Z")
}

// Contar cancelamentos por motivo
db.cancellations.aggregate([
  {
    $group: {
      _id: "$reasonCode",
      count: { $sum: 1 }
    }
  }
])

// Contar por quem cancelou
db.cancellations.aggregate([
  {
    $group: {
      _id: "$cancelledBy",
      count: { $sum: 1 },
      totalRefund: { $sum: "$refundAmount" }
    }
  }
])
```

## Cenários de Erro

### 1. Cliente tenta cancelar pedido já entregue

```bash
curl -X POST http://localhost:3333/orders/$ORDER_ID/cancel \
  -H "Authorization: Bearer $CLIENTE_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Mudei de ideia",
    "reasonCode": "customer_request"
  }'

# Esperado (400):
{
  "error": "Pedido não pode ser cancelado no estado: entregue",
  "currentStatus": "entregue"
}
```

### 2. Motoboy tenta rejeitar entrega que não é sua

```bash
# Usar MOTO_TOKEN diferente
curl -X POST http://localhost:3333/deliveries/$DELIVERY_ID/reject \
  -H "Authorization: Bearer $OUTRO_MOTO_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Teste",
    "reasonCode": "motoboy_rejected",
    "action": "reassign"
  }'

# Esperado (403):
{
  "error": "Permissão negada"
}
```

### 3. Loja tenta rejeitar pedido já sendo preparado

```bash
curl -X POST http://localhost:3333/orders/$ORDER_ID/reject \
  -H "Authorization: Bearer $LOJA_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reason": "Erro de inventário",
    "reasonCode": "inventory_error"
  }'

# Esperado (400):
{
  "error": "Pedido não pode ser rejeitado no estado: pago"
}

# nota: apenas 'criado' pode ser rejeitado
```

## Checklist de Testes

### Backend
- [ ] Cancelamento por cliente funciona
- [ ] Rejeição de entrega (reassign) funciona
- [ ] Rejeição de entrega (cancel) funciona
- [ ] Aceitação por loja funciona
- [ ] Rejeição por loja funciona
- [ ] Histórico de cancelamentos retorna dados corretos
- [ ] Estatísticas retornam agregações corretas
- [ ] Validações de permissão funcionam
- [ ] Validações de estado funcionam
- [ ] Refund é marcado como 'processed' (ou 'pending' se falhar)

### Frontend
- [ ] Modal de cancelamento abre corretamente
- [ ] Modal de rejeição tem todos os (os 3 steps aparecem
- [ ] Modal de ações da loja aparece para pedidos pendentes
- [ ] Componente CancellationStatusDisplay mostra info do cancelamento
- [ ] Todos os campos do formulário validam (motivo obrigatório)
- [ ] Toast/alertas aparecem após sucesso/erro
- [ ] Loading states aparecem durante requisições

### Socket
- [ ] order:cancelled emitido quando cliente cancela
- [ ] delivery:rejected_by_motoboy emitido quando reassign
- [ ] order:cancelled emitido quando motoboy cancela entrega
- [ ] order:accepted_by_store emitido quando loja aceita
- [ ] order:rejected_by_store emitido quando loja rejeita
- [ ] Notificações chegam ao cliente quando ordem muda
- [ ] Notificações chegam à loja quando entrega rejeitada

### Database
- [ ] Documento Cancellation criado corretamente
- [ ] Indexes criados para queries rápidas
- [ ] Order.status atualizado para 'cancelado'
- [ ] Delivery.status atualizado para 'cancelled' ou 'pending'
- [ ] refundStatus reflete tentativa de refund

## Performance

### Queries

```javascript
// Verificar índices estão sendo usados
db.cancellations.explain("executionStats").find({ orderId: ObjectId("...") })

// Deve mostrar "IXSCAN" (Index Scan), não "COLLSCAN"
```

### Limits

- Máximo de requisições simultâneas: 100/segundo (rate limiting recomendado)
- Timeout de refund: 5 segundos
- Socket emit timeout: 2 segundos

## Limpeza Pós-Teste

```bash
# Deletar dados de teste
curl -X DELETE http://localhost:3333/admin/test-data \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# Ou manualmente no MongoDB:
db.cancellations.deleteMany({ reason: /^teste|^test|^Teste/i })
db.orders.updateMany(
  { status: 'cancelado', reason: /teste/i },
  { $set: { status: 'criado' } }
)
```

## Monitoramento

### Logs a procurar

```
// Sucesso
[INFO] Cancellation created: {orderId, cancellationId, refundStatus}
[INFO] Order status updated to 'cancelado'
[INFO] Socket emitted: order:cancelled

// Erro
[ERROR] Refund processing failed: {reason}
[WARN] Socket emit timeout for order:cancelled
[ERROR] Permission denied: not order owner
```

### Métricas Recomendadas

1. Taxa de cancelamentos por hora
2. Taxa de falha de refund
3. Tempo médio de processamento de refund
4. Socket delivery rate (% de eventos entregues)
5. Latência média de cancellation API

## Conclusão

Execute os testes na seguinte ordem:
1. cURL tests (API isolada)
2. Frontend tests (UI e API integrados)
3. Socket tests (Real-time data sync)
4. Error scenario tests (Validações)

Todos os testes devem passar antes de deploy em produção.
