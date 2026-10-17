/**
 * Mensagens em português dos códigos de dinheiro da D3b-3 (P1: repasses; P2: caixa e ajuste de saldo).
 * Código desconhecido → a mensagem do servidor (serverErrorMessage), como antes.
 * flattenMoneyError é o que se joga dentro do onClick da AdminSheet ou do send do runBatch: a folha e o lote
 * mostram `data.error` e o status, o código e os campos do corpo (currentStatus, blocked, available) continuam lá.
 */
import { formatMoney } from '../../../lib/money';
import { serverErrorCode, serverErrorMessage } from './serverError';

/** "Já feito" do lote de Repasses (spec 4.1): o repasse saiu da fila porque foi liberado. */
export const PAYOUT_DONE_STATUSES: readonly string[] = ['released', 'requested', 'paid'];

interface HttpLike { response?: { status?: number; data?: unknown } }

const dataOf = (err: unknown): Record<string, unknown> => {
  const d = ((err ?? {}) as HttpLike).response?.data;
  return d && typeof d === 'object' && !Array.isArray(d) ? (d as Record<string, unknown>) : {};
};

export function moneyErrorMessage(err: unknown, fallback?: string): string {
  const code = serverErrorCode(err);
  const d = dataOf(err);
  switch (code) {
    case 'PAYOUT_NOT_FOUND':
      return 'Repasse não encontrado. Atualize a lista.';
    case 'PAYOUT_NOT_PENDING':
      // Em andamento vence a marca de bloqueado: a transferência já começou.
      if (d.currentStatus === 'releasing') {
        return 'Em andamento: a transferência deste repasse já começou. Se não concluir, ele aparece em "Incertos".';
      }
      if (d.blocked === true) return 'Bloqueado: desbloqueie antes de liberar.';
      if (d.currentStatus === 'cancelled') return 'Cancelado: este repasse não pode ser liberado.';
      if (typeof d.currentStatus === 'string' && PAYOUT_DONE_STATUSES.includes(d.currentStatus)) return 'Este repasse já foi liberado.';
      return 'Este repasse não está mais aguardando liberação.';
    case 'PAYOUT_NOT_BLOCKED':
      return 'Este repasse já não está bloqueado.';
    case 'PAYOUT_NOT_RESOLVABLE':
      return 'Este repasse já foi resolvido (ou não está mais incerto). A lista foi atualizada.';
    case 'PAYOUT_TRANSFER_UNCERTAIN':
      return 'O Asaas não confirmou a transferência: o repasse ficou incerto. Confira no painel do Asaas e use "Resolver".';
    case 'PAYOUT_TRANSFER_REFUSED': {
      const text = serverErrorMessage(err, 'O Asaas recusou a transferência');
      return d.currentStatus === 'pending'
        ? `${text.replace(/[.\s]+$/, '')}. O repasse voltou para "Aguardando liberação".`
        : text;
    }
    case 'CASHBOX_SELF_APPROVAL':
      return 'Outra pessoa precisa aprovar esta retirada';
    case 'CASHBOX_WITHDRAWAL_NOT_PENDING':
      return 'Esta retirada já foi decidida. A lista foi atualizada.';
    case 'WITHDRAWAL_NOT_PENDING':
      return 'Este saque já foi decidido. A lista foi atualizada.';
    case 'VERIFICATION_NOT_PENDING':
      return 'Esta verificação já foi decidida. A lista foi atualizada.';
    case 'IDEMPOTENCY_KEY_REUSED':
      return 'Este ajuste já foi usado com outros valores. Feche e abra de novo para fazer um ajuste novo.';
    case 'INSUFFICIENT_BALANCE':
      return typeof d.available === 'number' && Number.isFinite(d.available)
        ? `Saldo insuficiente para este débito: a carteira tem ${formatMoney(d.available)}.`
        : 'Saldo insuficiente para este débito.';
    default:
      return serverErrorMessage(err, fallback);
  }
}

export function flattenMoneyError(
  err: unknown,
  fallback?: string,
): { response: { status?: number; data: Record<string, unknown> & { error: string } } } {
  const status = ((err ?? {}) as HttpLike).response?.status;
  const code = serverErrorCode(err);
  return { response: { status, data: { ...dataOf(err), error: moneyErrorMessage(err, fallback), ...(code ? { code } : {}) } } };
}
