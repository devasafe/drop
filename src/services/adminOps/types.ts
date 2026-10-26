/**
 * D3b-1 · Operação ao vivo — formatos de resposta das rotas /api/admin (plano mestre,
 * "Tipos de resposta"). Espelhados em frontend/lib/adminOps.ts (P3.1). Não mudar sem avisar a P3.
 */
export type QueueType =
  | 'refund' | 'withdrawal' | 'motoboy_transfer' | 'verification' | 'support'
  | 'payout' | 'plan_change' | 'order_no_motoboy' | 'order_store_late';
export type QueueGroup = 'customer_money' | 'person_waiting' | 'revenue' | 'operation';
export type QueueTag = 'Urgente' | 'Esperando' | 'Lote' | 'KYC' | 'Suporte' | 'Receita' | 'Operação';
export interface QueueItem { id: string; title: string; context: string; since: string /*ISO*/; tag: QueueTag; href: string }
export interface QueueGroupEntry { type: QueueType; group: QueueGroup; count: number; items: QueueItem[] /*até 5*/; error?: string }
export interface QueueResponse { groups: QueueGroupEntry[] } // ordenado: customer_money, person_waiting, revenue, operation; dentro do grupo pelo item mais antigo

export interface OpsSummary {
  today: {
    gmv: number; gmvLastWeekSameTime: number;
    orders: number; ordersActive: number;
    cancelPct: number; cancelLate: number;
    motoboysOnline: number; motoboysDelivering: number; motoboysFree: number;
  };
  perHour: { hour: number; count: number }[];               // 0..23, só até a hora atual
  health: { storeAcceptAvgMin: number | null; findMotoboyAvgMin: number | null; deliveryAvgMin: number | null }; // últimas 2 h
}

export type AttentionReason =
  | 'estorno_pendente' | 'loja_parada' | 'cliente_decidindo' | 'sem_motoboy' | 'retirada_demorada' | 'atrasado';
export type OrdersFilter = 'atencao' | 'todos' | 'aguardando_pix' | 'na_loja' | 'em_entrega' | 'cancelados_hoje';
export interface AdminOrderRow {
  id: string; shortId: string;
  status: string; deliveryStatus: string | null;
  store: { id: string; name: string };
  motoboy: { id: string; name: string } | null;
  createdAt: string; stageSince: string;                    // ISO; stageSince = início da etapa atual
  total: number;
  attention: AttentionReason | null;
  /** Caso B: a linha é a corrida de devolução de um pedido entregue (etapa e motoboy são dela). */
  returnRide?: boolean;
}
export interface AdminOrdersResponse {
  items: AdminOrderRow[]; nextCursor: string | null;
  meta: {
    active: number; activePaid: number; awaitingPix: number; attention: number;
    acceptAvgMin: number | null; acceptLimitMin: number;
    findMotoboyAvgMin: number | null; poolTimeoutMin: number;
    deliveredToday: number;
    attentionTruncated: boolean;                            // a varredura de atenção bateu o teto (lista cortada)
  };
}

export type TimelineKey = 'created' | 'paid' | 'accepted' | 'assigned' | 'picked' | 'delivered' | 'cancelled';
export interface TimelineStep { key: TimelineKey; at: string | null; sincePrevMin: number | null }
export interface AdminOrderActionView {
  id: string; action: 'cancel' | 'reassign'; actorName: string; reason: string;
  faultParty: 'customer' | 'store' | 'motoboy' | 'platform' | null; at: string;
}
export type AdminOrderAllowedAction = 'cancel' | 'reassign';
export interface AdminOrderDetail {
  id: string; shortId: string; status: string; deliveryStatus: string | null;
  settlementMode: 'custody' | 'direct';
  store: { id: string; name: string };
  customer: { id: string; name: string; ordersCount: number; cancellations30d: number };
  motoboy: { id: string; name: string; vehicle: string | null; plate: string | null; rating: number | null } | null;
  timeline: TimelineStep[];
  adminActions: AdminOrderActionView[];
  items: { name: string; quantity: number; unitPrice: number; total: number }[];
  money: {
    subtotal: number; deliveryFee: number; couponDiscount: number; walletApplied: number; paidByCustomer: number;
    storeShare: number | null; motoboyShare: number | null; platformShare: number | null;
    payouts: { id: string; recipientType: string; amount: number; status: string }[];
    motoboyTransfer: { status: string; amount: number } | null;
  };
  cancellation: {
    cancelledBy: string; faultParty: string | null; reason: string; adminName: string | null;
    at: string; refundStatus: string;
  } | null;
  refundPending: boolean;
  allowedActions: AdminOrderAllowedAction[];   // já descontadas permissão e regra
}

export interface OpsMapResponse {
  motoboys: { id: string; name: string; lat: number; lng: number; updatedAt: string; state: 'free' | 'delivering' | 'stale';
              orderId: string | null; shortId: string | null /* da entrega assigned/picked; null quando livre */ }[];
  waiting: { orderId: string; shortId: string; storeName: string; storeLat: number | null; storeLng: number | null;
             since: string; radiusKm: number | null /* null = aberto a todos */; customerDeciding: boolean }[];
  inDelivery: { orderId: string; shortId: string; motoboyName: string; stage: 'indo_para_loja' | 'levando' }[];
  dispatch: { initialKm: number; stepKm: number; stepSeconds: number; maxKm: number; poolTimeoutMin: number };
  /** D3b-4b: lojas abertas pela regra da vitrine, com ponto e com 0 motoboy online a até dispatch.maxKm. */
  storesWithoutCourier: OpsMapStorePoint[];
}
/** D3b-4b: uma loja com ponto no mapa. */
export interface OpsMapStorePoint { id: string; name: string; lat: number; lng: number }

export type CancelFault = 'customer' | 'store' | 'motoboy' | 'platform';
/** Estados em que o admin pode cancelar (spec 4.2). Fonte única: orderDetail (P1.5) e a P2 importam daqui. */
export const ADMIN_CANCELLABLE_STATUSES: readonly string[] = ['criado', 'pago', 'aguardando_motoboy', 'enviado'];
export interface CancelPreview {
  fault: CancelFault;
  customerRefund: number;
  feeCharged: number;                        // taxa cobrada do culpado (cliente ou loja), 0 se nenhuma
  motoboyCompensation: number;
  compensationPaidBy: 'customer' | 'store' | 'platform' | null;
  countsAgainst: 'customer' | 'store' | 'motoboy' | null;
}
export interface CancelResult { ok: true; cancellationId: string; refundAmount: number; refundStatus: string }
