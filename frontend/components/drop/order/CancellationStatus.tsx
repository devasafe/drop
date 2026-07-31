import {
  AlertTriangle,
  Bell,
  Bike,
  Clock,
  CreditCard,
  Lock,
  MapPin,
  Package,
  PenLine,
  Settings,
  User,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { ICON_STROKE_WIDTH } from '../../ui/Icon';
import { formatBRL } from '../../ui/PriceTag';
import styles from './CancellationStatus.module.css';

export interface CancellationInfo {
  cancelledBy: 'customer' | 'motoboy' | 'store' | 'admin';
  reasonCode: string;
  reason: string;
  refundAmount?: number;
  refundStatus?: 'pending' | 'processed' | 'failed';
  createdAt: string;
  cancellationFee?: number;
  /** PIN de confirmação de devolução do produto à loja (fluxo motoboy → loja), quando gerado. */
  pinDevolucao?: string;
}

export interface CancellationStatusProps {
  cancellation: CancellationInfo;
}

/** Portado de `CancellationStatusDisplay` (mesmos `reasonCode`/labels), ícone Lucide no lugar de `Icon` (Tailwind órfão). */
const REASON_LABELS: Record<string, { label: string; icon: LucideIcon }> = {
  customer_request: { label: 'Cancelamento solicitado', icon: User },
  not_available: { label: 'Itens indisponíveis', icon: Package },
  store_closed: { label: 'Loja fechada', icon: Lock },
  store_busy: { label: 'Loja muito ocupada', icon: Clock },
  motoboy_unavailable: { label: 'Motoboy indisponível', icon: Bike },
  delivery_failed: { label: 'Falha na entrega', icon: XCircle },
  customer_unreachable: { label: 'Cliente não contactável', icon: Bell },
  address_invalid: { label: 'Endereço inválido', icon: MapPin },
  payment_issue: { label: 'Problema de pagamento', icon: CreditCard },
  wrong_order: { label: 'Pedido errado', icon: AlertTriangle },
  damaged_items: { label: 'Itens danificados', icon: AlertTriangle },
  other: { label: 'Outro motivo', icon: PenLine },
};

const CANCELLED_BY_LABELS: Record<CancellationInfo['cancelledBy'], { label: string; icon: LucideIcon }> = {
  customer: { label: 'Cancelado pelo cliente', icon: User },
  store: { label: 'Rejeitado pela loja', icon: Lock },
  motoboy: { label: 'Rejeitado pelo motoboy', icon: Bike },
  admin: { label: 'Cancelado pelo admin', icon: Settings },
};

const REFUND_STATUS_LABEL: Record<NonNullable<CancellationInfo['refundStatus']>, string> = {
  pending: 'Pendente',
  processed: 'Processado',
  failed: 'Falhou',
};

/**
 * Redesign de `CancellationStatusDisplay` (que usava classes Tailwind órfãs)
 * pro DS: só renderiza os dados de um cancelamento já carregado — quem
 * cancelou, motivo (label do `reasonCode`, portado 1:1), taxa e reembolso,
 * e o PIN de devolução do fluxo motoboy → loja quando presente. Sem fetch
 * próprio (era acoplado a `orderId`/`useCancellation` antes); quem busca o
 * cancelamento é a página.
 */
export function CancellationStatus({ cancellation }: CancellationStatusProps) {
  const reasonInfo = REASON_LABELS[cancellation.reasonCode] ?? REASON_LABELS.other;
  const byInfo = CANCELLED_BY_LABELS[cancellation.cancelledBy];
  const ReasonIcon = reasonInfo.icon;
  const ByIcon = byInfo?.icon ?? XCircle;

  const formattedDate = new Date(cancellation.createdAt).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const hasFee = cancellation.cancellationFee !== undefined && cancellation.cancellationFee > 0;

  return (
    <section className={styles.wrap} aria-label="Status do cancelamento">
      <div className={styles.header}>
        <span className={styles.by}>
          <ByIcon size={18} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
          {byInfo?.label ?? 'Cancelado'}
        </span>
        <span className={styles.date}>{formattedDate}</span>
      </div>

      <div className={styles.reason}>
        <ReasonIcon size={24} strokeWidth={ICON_STROKE_WIDTH} className={styles.reasonIcon} aria-hidden="true" />
        <div>
          <h3 className={styles.reasonLabel}>{reasonInfo.label}</h3>
          <p className={styles.reasonText}>
            Motivo: <strong>{cancellation.reason}</strong>
          </p>
        </div>
      </div>

      {hasFee && (
        <div className={styles.row}>
          <span className={styles.rowLabel}>Taxa de cancelamento</span>
          <span className={styles.fee}>{formatBRL(cancellation.cancellationFee as number)}</span>
        </div>
      )}

      {cancellation.refundAmount !== undefined && (
        <div className={styles.refund}>
          <div className={styles.row}>
            <span className={styles.rowLabel}>Reembolso</span>
            <span className={styles.refundAmount}>{formatBRL(cancellation.refundAmount)}</span>
          </div>
          {cancellation.refundStatus && (
            <div className={styles.row}>
              <span className={styles.rowLabel}>Status</span>
              <span className={[styles.refundStatus, styles[cancellation.refundStatus]].join(' ')}>
                {REFUND_STATUS_LABEL[cancellation.refundStatus]}
              </span>
            </div>
          )}
        </div>
      )}

      {cancellation.refundStatus === 'failed' && (
        <div className={styles.warning} role="alert">
          <AlertTriangle size={14} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
          <span>Houve um erro ao processar o reembolso. Entre em contato com o suporte.</span>
        </div>
      )}

      {cancellation.pinDevolucao && (
        <div className={styles.pinWrap}>
          <span className={styles.pinLabel}>PIN de devolução</span>
          <span className={styles.pin}>{cancellation.pinDevolucao}</span>
        </div>
      )}
    </section>
  );
}

export default CancellationStatus;
