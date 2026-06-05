# 🔧 FIX APLICADO - Socket Update on Accept Order

## Problema
Quando lojista clicava "Aceitar" um pedido, o pedido desaparecia da tela até fazer F5.

## Causa
O endpoint POST `/orders/{id}/accept` não estava emitindo socket event para a loja.

## Solução
Adicionado ao `acceptOrder` no backend:

**Arquivo**: `src/controllers/orderController.ts`

**Mudança**: 
```typescript
// Emit order_update to store owner so order list updates
emitToRoom(
  `store:${order.storeId}`,
  'order_update',
  { orderId: order._id }
);
```

## Fluxo Completo Agora

```
1. Cliente cria pedido
   ├─ Backend POST /orders
   ├─ Emite 'new_order' para lojista
   └─ Frontend mostra pedido em "Pedidos em Andamento"

2. Lojista clica "Aceitar"
   ├─ Backend POST /orders/{id}/accept
   ├─ Cria Delivery
   ├─ Emite 'order_update' para lojista ← NOVO
   └─ Emite 'new_delivery' para motoboys

3. Frontend lojista recebe 'order_update'
   ├─ Socket listener atualiza pedido na lista
   ├─ Pedido NÃO desaparece
   └─ Botões mudam para [Detalhes, Cancelar]

4. Motoboy recebe notificação
   └─ Pode aceitar a entrega

5. Motoboy entrega
   └─ Pedido move para histórico
```

## Status
✅ Compilação: 0 erros
✅ Fluxo testado logicamente
✅ Pronto para testar no servidor

## Próximo Passo
Inicie o servidor e teste o fluxo completo:
1. Cliente cria pedido
2. Lojista aceita
3. Verifique se pedido atualiza sem F5
