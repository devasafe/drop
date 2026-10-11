import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { Alert } from '../../ui/Alert';
import { RadioRow } from '../../ui/RadioRow';
import { Skeleton } from '../../ui/Skeleton';
import { ICON_STROKE_WIDTH } from '../../ui/Icon';
import { formatBRL } from '../../ui/PriceTag';
import { useCancelPreview } from '../../../hooks/useCancelPreview';
import styles from './CancelOrderSheet.module.css';

export interface CancelOrderSheetProps {
  open: boolean;
  onClose: () => void;
  onConfirm: (payload: { reason: string; reasonCode: string }) => void;
  /** Taxa em R$ quando a página já a conhece (sem `orderId`). Com `orderId`, a prévia do servidor manda. */
  fee?: number;
  /** Feedback de carregamento enquanto `onConfirm` está em andamento. */
  submitting?: boolean;
  /** Pedido: o sheet busca a prévia (quanto volta) a cada abertura. */
  orderId?: string;
  /** Primeiro nome do entregador, para o aviso "já retirou seu pedido". */
  courierName?: string;
}

/** Os códigos são os que o backend e o `CancellationStatus` conhecem. */
const CANCEL_REASONS = [
  { key: 'ideia', code: 'customer_request', label: 'Mudei de ideia' },
  { key: 'endereco', code: 'address_invalid', label: 'Informei o endereço errado' },
  { key: 'demora', code: 'other', label: 'Está demorando demais' },
  { key: 'outro', code: 'other', label: 'Outro motivo' },
];

const destino = (m?: string) => (m === 'credit_card' ? 'para o cartão' : m === 'pix' ? 'para o Pix' : 'para onde você pagou');

/**
 * Sheet de cancelamento: mostra o que volta e por quê ANTES de confirmar.
 * O valor vem de `GET /orders/:id/cancel-preview` (só leitura, buscado de novo a cada
 * abertura); a confirmação continua decidida pelo servidor em `POST /orders/:id/cancel`.
 */
export function CancelOrderSheet({ open, onClose, onConfirm, fee, submitting, orderId, courierName }: CancelOrderSheetProps) {
  const [key, setKey] = useState(CANCEL_REASONS[0].key);
  const [other, setOther] = useState('');
  const { preview, loading, failed, retry } = useCancelPreview(orderId, open);

  useEffect(() => {
    if (open) { setKey(CANCEL_REASONS[0].key); setOther(''); }
  }, [open]);

  const reason = CANCEL_REASONS.find((r) => r.key === key)!;
  const text = key === 'outro' ? other.trim() : reason.label;
  const blocked = preview?.cancellable === false;
  const refund = preview?.refund;
  // Com pedido, só confirma depois de ver o valor (falha fecha a porta; o servidor ainda decide o final).
  const canConfirm = !!text && (!orderId || preview?.cancellable === true);
  const label = refund != null ? `Cancelar e receber ${formatBRL(refund)}` : 'Cancelar o pedido';

  return (
    <Sheet open={open} onClose={onClose} title="Cancelar o pedido?" presentation="center">
      <div className={styles.wrap}>
        {loading && <Skeleton height={64} />}
        {failed && !loading ? (
          <Alert tone="error" title="Não deu para calcular quanto volta" action={{ label: 'Tentar de novo', onClick: retry }}>
            Sem ver o valor, o cancelamento fica travado. Tente de novo.
          </Alert>
        ) : blocked ? (
          <Alert tone="info" title="Este pedido não pode mais ser cancelado">
            Se algo deu errado, fale com o suporte pelo pedido.
          </Alert>
        ) : preview?.motoboyEnRoute ? (
          <Alert tone="warning" title={`O ${courierName || 'entregador'} já retirou seu pedido`}>
            {`A entrega (${formatBRL(preview.fee ?? 0)}) fica com ele, que já fez a viagem. Você recebe de volta ${formatBRL(refund ?? 0)} ${destino(preview.paymentMethod)} em até 1 dia útil.`}
          </Alert>
        ) : preview?.cancellable ? (
          <Alert tone="success" title="Cancelamento grátis">
            {`${formatBRL(refund ?? 0)} voltam ${destino(preview.paymentMethod)} em até 1 dia útil.`}
          </Alert>
        ) : fee !== undefined && fee > 0 ? (
          <div className={styles.feeWarning} role="alert">
            <AlertTriangle size={18} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
            <span>
              Uma taxa de cancelamento de <strong>{formatBRL(fee)}</strong> será descontada do reembolso.
            </span>
          </div>
        ) : null}

        {!blocked && (
          <>
            <p className={styles.cap}>Por quê?</p>
            <div className={styles.reasons} role="radiogroup" aria-label="Motivos de cancelamento">
              {CANCEL_REASONS.map((r) => (
                <RadioRow key={r.key} name="motivo-cancelamento" value={r.key} checked={key === r.key} onChange={setKey} label={r.label} />
              ))}
            </div>
            {key === 'outro' && (
              <>
                <label htmlFor="cancel-outro" className={styles.label}>Motivo do cancelamento</label>
                <textarea
                  id="cancel-outro"
                  className={styles.textarea}
                  value={other}
                  onChange={(e) => setOther(e.target.value)}
                  placeholder="Descreva o motivo do cancelamento"
                  maxLength={200}
                  rows={3}
                />
              </>
            )}
            <Button variant="danger" disabled={!canConfirm} loading={submitting} onClick={() => text && onConfirm({ reason: text, reasonCode: reason.code })}>
              {label}
            </Button>
          </>
        )}
        <Button onClick={onClose}>Manter o pedido</Button>
      </div>
    </Sheet>
  );
}

export default CancelOrderSheet;
