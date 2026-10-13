// frontend/components/seller/panel/sellerPanelState.ts
/** Estado puro do painel da loja (D1). Sem React: testável à parte. */
export interface ReturnRequest {
  deliveryId: string;
  orderId: string;
  motoboyId: string;
  message: string;
  pinRequired: boolean;
  returnedAt: string;
}

export const sameId = (a: unknown, b: unknown): boolean =>
  a !== null && a !== undefined && b !== null && b !== undefined && String(a) === String(b);

/** Devoluções já pendentes quando o painel carrega (mesma regra do antigo store-dashboard). */
export function pendingReturnsFromOrders(orders: any[]): ReturnRequest[] {
  return (orders || [])
    .filter((o) => o?.delivery?.statusDevolucao === 'aguardando_confirmacao')
    .map((o) => {
      const raw = o.delivery.motoboyId;
      const motoboyId = o.delivery.motoboyName
        || (raw && typeof raw === 'object' ? raw.name || raw._id?.toString() : raw)
        || '';
      return {
        deliveryId: String(o.delivery._id),
        orderId: String(o._id),
        motoboyId: String(motoboyId),
        message: 'Motoboy solicitou devolução do produto',
        pinRequired: true,
        returnedAt: o.delivery.updatedAt || new Date().toISOString(),
      };
    });
}

/** Junta as devoluções do servidor com as que chegaram pelo socket e ainda valem (pedido ainda ativo). */
export function mergeReturns(prev: ReturnRequest[], fromOrders: ReturnRequest[], activeOrders: any[]): ReturnRequest[] {
  const kept = prev.filter((r) =>
    !fromOrders.some((f) => f.deliveryId === r.deliveryId)
    && (activeOrders || []).some((o) => sameId(o?._id, r.orderId)));
  return [...fromOrders, ...kept];
}

/** Atualiza a devolução da mesma entrega ou põe a nova no topo. */
export function upsertReturn(list: ReturnRequest[], r: ReturnRequest): ReturnRequest[] {
  return list.some((x) => x.deliveryId === r.deliveryId)
    ? list.map((x) => (x.deliveryId === r.deliveryId ? r : x))
    : [r, ...list];
}
