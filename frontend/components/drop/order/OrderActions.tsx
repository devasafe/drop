import { CheckCircle2, XCircle } from 'lucide-react';
import { ICON_STROKE_WIDTH } from '../../ui/Icon';
import { Button } from '../../ui/Button';
import styles from './OrderActions.module.css';

export interface OrderActionsProps {
  onCancel?: () => void;
  onConfirmReceived?: () => void;
  canCancel: boolean;
  canConfirmReceived: boolean;
  confirming?: boolean;
}

/**
 * Botões contextuais da tela de acompanhamento de pedido — renderiza só o
 * que é cabível no estado atual (`canCancel`/`canConfirmReceived`). Cancelar
 * usa `ghost` com cor `--danger` (regra D do spec: ghost não empilha roxo,
 * então o tom de perigo entra via classe própria, não uma variante nova no
 * `Button`). Avaliações não entram aqui — ficam no `RatingForm` da página.
 */
export function OrderActions({
  onCancel,
  onConfirmReceived,
  canCancel,
  canConfirmReceived,
  confirming = false,
}: OrderActionsProps) {
  if (!canCancel && !canConfirmReceived) {
    return null;
  }

  return (
    <div className={styles.wrap}>
      {canCancel && (
        <Button
          variant="ghost"
          className={styles.cancel}
          leftIcon={<XCircle size={16} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
          onClick={() => onCancel?.()}
        >
          Cancelar
        </Button>
      )}
      {canConfirmReceived && (
        <Button
          variant="primary"
          loading={confirming}
          leftIcon={<CheckCircle2 size={16} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
          onClick={() => onConfirmReceived?.()}
        >
          Confirmar recebimento
        </Button>
      )}
    </div>
  );
}
