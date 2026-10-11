import {
  AlertTriangle,
  Bell,
  Bike,
  Clock,
  CreditCard,
  Lock,
  MapPin,
  Headphones,
  Package,
  PenLine,
  Repeat,
  Settings,
  User,
  XCircle,
  type LucideIcon,
} from 'lucide-react';
import { ICON_STROKE_WIDTH } from '../../ui/Icon';
import { Alert } from '../../ui/Alert';
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

/** Estorno do pedido direto (modo loja), como o backend entrega ao cliente (`customerRefund`). */
export interface DirectRefundView {
  stage: 'devolvendo' | 'conferindo' | 'resolvendo' | 'devolvido';
  amount: number;
  requestedAt: string;
  acceptedAt?: string | null;
  doneAt?: string | null;
}

export interface CancellationStatusProps {
  cancellation: CancellationInfo;
  direct?: DirectRefundView | null;
  storeName?: string;
  paymentMethod?: string;
  /** `paymentStatus` do pedido: 'pending'/'failed' = nunca foi pago, não há estorno a mostrar. */
  paymentStatus?: string;
  /** Saldo da carteira usado no pedido (volta para a carteira no cancelamento). */
  walletApplied?: number;
  onSupport?: () => void;
  onBuyElsewhere?: () => void;
}

const ddmm = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '');
const hhmm = (iso?: string | null) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');
const DIRECT_LABEL: Record<DirectRefundView['stage'], string> = {
  devolvendo: 'Devolvendo',
  conferindo: 'Conferindo com a loja',
  resolvendo: 'O DROP está resolvendo',
  devolvido: 'Devolvido',
};

type Step = { label: string; detail?: string; time?: string; state: 'done' | 'current' | 'upcoming' };

function Timeline({ steps }: { steps: Step[] }) {
  return (
    <ol className={styles.tl}>
      {steps.map((s) => (
        <li key={s.label} className={styles[s.state]}>
          <span className={styles.dot} aria-hidden="true" />
          <span className={styles.tlText}>
            {s.label}
            {s.detail && <small>{s.detail}</small>}
          </span>
          {s.time && <time className={styles.tlTime}>{s.time}</time>}
        </li>
      ))}
    </ol>
  );
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

/**
 * Redesign de `CancellationStatusDisplay` (que usava classes Tailwind órfãs)
 * pro DS: só renderiza os dados de um cancelamento já carregado — quem
 * cancelou, motivo (label do `reasonCode`, portado 1:1), taxa e reembolso,
 * e o PIN de devolução do fluxo motoboy → loja quando presente. Sem fetch
 * próprio (era acoplado a `orderId`/`useCancellation` antes); quem busca o
 * cancelamento é a página.
 */
export function CancellationStatus({ cancellation, direct, storeName, paymentMethod, paymentStatus, walletApplied, onSupport, onBuyElsewhere }: CancellationStatusProps) {
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
  const failed = cancellation.refundStatus === 'failed';
  const processed = cancellation.refundStatus === 'processed';
  // Pedido cancelado antes de pagar: o cancelamento grava refundAmount = total, mas nada foi cobrado.
  const unpaid = paymentStatus === 'pending' || paymentStatus === 'failed';
  const walletBack = unpaid && (walletApplied ?? 0) > 0 ? (walletApplied as number) : 0;

  const custodySteps: Step[] = [
    { label: 'Cancelado', detail: hasFee ? 'Com taxa de cancelamento' : 'Sem taxa para você', time: `${ddmm(cancellation.createdAt)} ${hhmm(cancellation.createdAt)}`, state: 'done' },
    { label: 'Estorno pedido ao banco', detail: paymentMethod === 'credit_card' ? 'No cartão que pagou' : 'Pix para a conta que pagou', state: failed ? 'current' : 'done' },
    { label: 'Dinheiro na sua conta', detail: processed ? 'Concluído' : 'Até 1 dia útil', state: processed ? 'done' : failed ? 'upcoming' : 'current' },
  ];
  const directSteps: Step[] | null = direct
    ? [
        { label: 'Pedido cancelado', time: hhmm(cancellation.createdAt), state: 'done' },
        { label: 'Devolução pedida à conta da loja', time: hhmm(direct.requestedAt), state: 'done' },
        { label: 'Asaas processando o Pix de volta', time: hhmm(direct.acceptedAt), state: direct.stage === 'devolvido' ? 'done' : 'current' },
        { label: 'Dinheiro na sua conta', time: hhmm(direct.doneAt), state: direct.stage === 'devolvido' ? 'done' : 'upcoming' },
      ]
    : null;

  return (
    <section className={styles.wrap} aria-label="Status do cancelamento">
      <div className={styles.header}>
        <span className={styles.by}>
          <ByIcon size={18} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
          {byInfo?.label ?? 'Cancelado'}
        </span>
        <span className={styles.date}>{formattedDate}</span>
      </div>

      {unpaid ? (
        <div>
          <p className={styles.big}>{walletBack > 0 ? `Nada foi cobrado ${paymentMethod === 'credit_card' ? 'no cartão' : 'no Pix'}` : 'Nada foi cobrado'}</p>
          <p className={styles.sub}>
            {walletBack > 0 ? `${formatBRL(walletBack)} do saldo voltaram para a carteira.` : 'O pedido foi cancelado antes do pagamento.'}
          </p>
        </div>
      ) : direct ? (
        <div className={styles.directHead}>
          <span className={styles.pill}>{DIRECT_LABEL[direct.stage]}</span>
          <p className={styles.big}>
            {direct.stage === 'devolvido' && direct.doneAt
              ? `${formatBRL(direct.amount)} devolvidos em ${ddmm(direct.doneAt)} às ${hhmm(direct.doneAt)}`
              : `${formatBRL(direct.amount)} voltam para você`}
          </p>
          <p className={styles.sub}>{`Pelo mesmo Pix, direto da conta da ${storeName || 'loja'}.${direct.stage === 'devolvendo' ? ' Costuma cair em minutos.' : ''}`}</p>
        </div>
      ) : (
        cancellation.refundAmount !== undefined && (
          <p className={styles.big}>
            {processed ? 'Estorno concluído' : failed ? 'Seu estorno precisa de ajuda' : 'Seu dinheiro está voltando'}
          </p>
        )
      )}

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

      {unpaid ? null : directSteps ? (
        <Timeline steps={directSteps} />
      ) : (
        cancellation.refundAmount !== undefined && (
          <div className={styles.refund}>
            <p className={styles.cap}>{`Estorno de ${formatBRL(cancellation.refundAmount)}`}</p>
            <Timeline steps={custodySteps} />
          </div>
        )
      )}

      {cancellation.refundStatus === 'failed' && (
        <div className={styles.warning} role="alert">
          <AlertTriangle size={14} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
          <span>Houve um erro ao processar o reembolso. O suporte já foi avisado e resolve com prioridade.</span>
        </div>
      )}

      {cancellation.pinDevolucao && (
        <div className={styles.pinWrap}>
          <span className={styles.pinLabel}>PIN de devolução</span>
          <span className={styles.pin}>{cancellation.pinDevolucao}</span>
        </div>
      )}

      {direct && direct.stage !== 'devolvido' && (
        <Alert tone="info" title="Se demorar mais de 1 dia">O DROP acompanha com a loja. Você não precisa fazer nada.</Alert>
      )}

      {(onBuyElsewhere || onSupport) && (
        <div className={styles.exits}>
          {onBuyElsewhere && (
            <button type="button" className={styles.exit} onClick={onBuyElsewhere}>
              <span className={styles.exitIcon}><Repeat size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" /></span>
              <span className={styles.exitText}><b>Comprar em outra loja</b><small>Os mesmos produtos em lojas perto</small></span>
            </button>
          )}
          {onSupport && (
            <button type="button" className={styles.exit} onClick={onSupport}>
              <span className={styles.exitIcon}><Headphones size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" /></span>
              <span className={styles.exitText}><b>Falar com o suporte</b><small>Com o pedido já anexado</small></span>
            </button>
          )}
        </div>
      )}
    </section>
  );
}

export default CancellationStatus;
