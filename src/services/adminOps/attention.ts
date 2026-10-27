/**
 * D3b-1 · "Por que importa" (spec 3.2). Função pura: o primeiro motivo que bate vence, na ordem
 * efetiva da decisão R1 do plano. "Há mais de N min" é estrito (exatamente N ainda não conta).
 */
import { acceptDeadline, isAwaitingStoreAccept } from '../../utils/acceptDeadline';
import { saoPauloDayRange } from '../moneyOverview.service';
import { AttentionReason } from './types';
import { ACTIVE_ORDER_STATUSES, CANCELLED_ORDER_STATUSES, MIN_MS, OpsLimits } from './common';

export const RETIRADA_DEMORADA_MIN = 20;
export const ATRASO_FOLGA_MIN = 15;
export const ATRASO_SEM_DURACAO_MIN = 45;

/** Ordem efetiva (decisão R1): cliente_decidindo antes de sem_motoboy. Sinal perdido (antifraude) primeiro. */
export const ATTENTION_ORDER: readonly AttentionReason[] = [
  'sinal_perdido', 'estorno_pendente', 'loja_parada', 'cliente_decidindo', 'sem_motoboy', 'retirada_demorada', 'atrasado',
];

export interface AttentionInput {
  status: string;
  paymentStatus: string | null;
  createdAt: Date;
  paidAt: Date | null;
  acceptedAt: Date | null;
  cancelledAt: Date | null;
  updatedAt: Date;
  awaitingCustomerPoolDecision: boolean;
  /** Segundos (Order.deliveryDuration, da rota). */
  deliveryDuration: number | null;
  delivery: { status: string; createdAt: Date; assignedAt: Date | null; pickedAt: Date | null; signalLostAt?: Date | null } | null;
  /** Estorno não concluído (Cancellation de custódia aberta ou DirectRefund ≠ done). */
  refundPending: boolean;
}

export function attentionFor(row: AttentionInput, limits: OpsLimits, now: Date): AttentionReason | null {
  const t = now.getTime();
  const olderThan = (d: Date | null | undefined, minutes: number) => !!d && t - d.getTime() > minutes * MIN_MS;

  if ((CANCELLED_ORDER_STATUSES as string[]).includes(row.status)) {
    const cancelledAt = row.cancelledAt ?? row.updatedAt;
    const today = cancelledAt.getTime() >= saoPauloDayRange(now).start.getTime();
    return row.refundPending && today ? 'estorno_pendente' : null;
  }
  if (!(ACTIVE_ORDER_STATUSES as string[]).includes(row.status)) return null;

  if (isAwaitingStoreAccept(row) && t > acceptDeadline(row, limits.storeAcceptTimeoutMin).getTime()) return 'loja_parada';
  if (row.awaitingCustomerPoolDecision) return 'cliente_decidindo';

  const d = row.delivery;
  // Antifraude: posição do motoboy parou de chegar com a corrida em andamento (job rideSignal).
  if ((d?.status === 'assigned' || d?.status === 'picked') && d.signalLostAt) return 'sinal_perdido';
  if (d?.status === 'pending' && olderThan(d.createdAt, limits.poolTimeoutMin)) return 'sem_motoboy';
  if (d?.status === 'assigned' && olderThan(d.assignedAt, RETIRADA_DEMORADA_MIN)) return 'retirada_demorada';
  if (d?.status === 'picked') {
    const limitMin = row.deliveryDuration ? row.deliveryDuration / 60 + ATRASO_FOLGA_MIN : ATRASO_SEM_DURACAO_MIN;
    if (olderThan(d.pickedAt, limitMin)) return 'atrasado';
  }
  return null;
}
