import { useEffect, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { Sheet } from '../../ui/Sheet';
import { Button } from '../../ui/Button';
import { Alert } from '../../ui/Alert';
import { RadioRow } from '../../ui/RadioRow';
import { Skeleton } from '../../ui/Skeleton';
import { ICON_STROKE_WIDTH } from '../../ui/Icon';
import { formatBRL } from '../../ui/PriceTag';
import { useCancelPreview, type CancelPreview } from '../../../hooks/useCancelPreview';
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
 * Para onde volta cada parte, como o servidor calculou (`walletPart`/`providerPart`).
 * Resposta sem a divisão (antiga): o valor inteiro volta para onde pagou.
 */
function voltaTexto(p: CancelPreview): string {
  const wallet = p.walletPart ?? 0;
  const provider = p.walletPart == null && p.providerPart == null ? (p.refund ?? 0) : (p.providerPart ?? 0);
  const parts: string[] = [];
  if (wallet > 0) parts.push(`${formatBRL(wallet)} voltam para a carteira`);
  // M2: estorno de cartão aparece na fatura conforme o emissor — sem prazo prometido.
  if (provider > 0) {
    parts.push(p.paymentMethod === 'credit_card'
      ? `${formatBRL(provider)} voltam para o cartão; o estorno aparece na fatura`
      : `${formatBRL(provider)} voltam ${destino(p.paymentMethod)} em até 1 dia útil`);
  }
  return parts.length ? `${parts.join(' e ')}.` : 'Não há valor a devolver.';
}

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
  const unpaid = preview?.paid === false;
  const label = refund != null && !unpaid ? `Cancelar e receber ${formatBRL(refund)}` : 'Cancelar o pedido';

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
        ) : preview?.cancellable && unpaid ? (
          (preview.walletPart ?? 0) > 0 ? (
            <Alert tone="info" title={`Nada foi cobrado ${preview.paymentMethod === 'credit_card' ? 'no cartão' : 'no Pix'}`}>
              {`${formatBRL(preview.walletPart ?? 0)} do saldo voltam para a carteira.`}
            </Alert>
          ) : (
            <Alert tone="info" title="Nada foi cobrado">
              Você ainda não pagou este pedido. Cancelar não custa nada.
            </Alert>
          )
        ) : preview?.motoboyEnRoute ? (
          <Alert tone="warning" title={`O ${courierName || 'entregador'} já retirou seu pedido`}>
            {`A entrega (${formatBRL(preview.fee ?? 0)}) fica com ele, que já fez a viagem. ${voltaTexto(preview)}`}
          </Alert>
        ) : preview?.cancellable ? (
          <Alert tone="success" title="Cancelamento grátis">
            {voltaTexto(preview)}
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
