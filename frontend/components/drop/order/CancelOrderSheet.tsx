import { useEffect, useId, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { ICON_STROKE_WIDTH } from '../../ui/Icon';
import { formatBRL } from '../../ui/PriceTag';
import styles from './CancelOrderSheet.module.css';

export interface CancelOrderSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: { reason: string; reasonCode: string }) => void;
  /** Taxa de cancelamento em R$, quando aplicável. Ver nota abaixo — não tem
   * origem em preview no backend, então quem calcula/decide passar (ou não)
   * é a página; o sheet nunca inventa um valor. */
  fee?: number;
  /** Feedback de carregamento enquanto `onConfirm` está em andamento — o
   * sheet não tem estado próprio de submissão, só reflete o que a página
   * (dona da chamada `POST /orders/:id/cancel`) já rastreia. */
  submitting?: boolean;
}

/** Portado de `CancelOrderModal` (motivos pré-definidos, mesmo `code`/label/description). */
const CANCEL_REASONS = [
  { code: 'customer_request', label: 'Cancelamento solicitado', description: 'Mudei de ideia' },
  { code: 'address_invalid', label: 'Endereço errado', description: 'Informei o endereço incorretamente' },
  { code: 'not_available', label: 'Itens indisponíveis', description: 'Os itens não estão disponíveis' },
  { code: 'payment_issue', label: 'Problema de pagamento', description: 'Problema com o pagamento' },
  { code: 'other', label: 'Outro motivo', description: '' },
];

const DEFAULT_REASON = CANCEL_REASONS[0];

/**
 * Sheet de cancelamento de pedido: lista de motivos pré-definidos (portada de
 * `CancelOrderModal`), textarea de motivo (pré-preenchida com a descrição do
 * motivo selecionado, editável) e aviso de taxa.
 *
 * Sobre `fee`: `POST /orders/:id/cancel` calcula a taxa NO MOMENTO do
 * cancelamento (`calculateCancellationFee`, backend), com base em
 * `acceptedAt`/envolvimento de motoboy/config — não existe endpoint de
 * preview nem campo persistido no `order`. Por isso o sheet só formata e
 * exibe `fee` quando o chamador (página) já tem um valor pra mostrar;
 * sem `fee` (ou `fee <= 0`) mostra só o aviso genérico de irreversibilidade,
 * nunca um valor calculado aqui.
 *
 * Botão "Confirmar cancelamento" é `variant="primary"` com override local de
 * cor (`--danger` no lugar de `--brand`) — mesmo espírito de `OrderActions`
 * (Regra D: cor de perigo entra via classe própria, não uma variante nova em
 * `Button`).
 */
export function CancelOrderSheet({ open, onClose, onConfirm, fee, submitting }: CancelOrderSheetProps) {
  const [reasonCode, setReasonCode] = useState(DEFAULT_REASON.code);
  const [reason, setReason] = useState(DEFAULT_REASON.description);
  const reasonFieldId = useId();

  useEffect(() => {
    if (!open) return;
    setReasonCode(DEFAULT_REASON.code);
    setReason(DEFAULT_REASON.description);
  }, [open]);

  const selectReason = (code: string) => {
    setReasonCode(code);
    setReason(CANCEL_REASONS.find((option) => option.code === code)?.description ?? '');
  };

  const canConfirm = reason.trim().length > 0;

  const handleConfirm = () => {
    if (!canConfirm) return;
    onConfirm({ reason: reason.trim(), reasonCode });
  };

  return (
    <Sheet open={open} onClose={onClose} title="Cancelar pedido">
      <div className={styles.wrap}>
        <p className={styles.hint}>
          Cancelar o pedido é irreversível. O reembolso é processado automaticamente após a confirmação.
        </p>

        {fee !== undefined && fee > 0 && (
          <div className={styles.feeWarning} role="alert">
            <AlertTriangle size={18} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
            <span>
              Uma taxa de cancelamento de <strong>{formatBRL(fee)}</strong> será descontada do reembolso.
            </span>
          </div>
        )}

        <div className={styles.reasons} role="radiogroup" aria-label="Motivos de cancelamento">
          {CANCEL_REASONS.map((option) => {
            const active = reasonCode === option.code;
            return (
              <button
                key={option.code}
                type="button"
                role="radio"
                aria-checked={active}
                className={[styles.reason, active && styles.reasonActive].filter(Boolean).join(' ')}
                onClick={() => selectReason(option.code)}
              >
                <span className={styles.reasonLabel}>{option.label}</span>
              </button>
            );
          })}
        </div>

        <label htmlFor={reasonFieldId} className={styles.label}>
          Motivo do cancelamento
        </label>
        <textarea
          id={reasonFieldId}
          className={styles.textarea}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Descreva o motivo do cancelamento"
          maxLength={200}
          rows={3}
        />

        <Button
          variant="primary"
          className={styles.confirm}
          disabled={!canConfirm}
          loading={submitting}
          onClick={handleConfirm}
        >
          Confirmar cancelamento
        </Button>
      </div>
    </Sheet>
  );
}

export default CancelOrderSheet;
