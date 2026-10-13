import { useEffect, useId, useState } from 'react';
import api from '../../../lib/api';
import { Sheet } from '../../ui/Sheet';
import { RadioRow } from '../../ui/RadioRow';
import { Checkbox } from '../../ui/Checkbox';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../../lib/money';
import { shortOrderCode } from '../../../lib/customerOrder';
import { apiError, unwrap } from '../../../lib/sellerApi';
import { REJECT_REASONS, orderItems, type RejectReasonCode } from '../../../lib/sellerOrders';
import styles from './RejectSheet.module.css';

export interface RejectResult { refundStatus?: string; refundAmount?: number }

interface Props {
  /** null = fechado. */
  order: any | null;
  /** recusar = antes do aceite; cancelar = aceito e ainda sem motoboy (a regra de taxa é do servidor). */
  mode?: 'recusar' | 'cancelar';
  onClose: () => void;
  onRejected: (r: RejectResult) => void;
  onAlreadyHandled?: () => void;
}

export function RejectSheet({ order, mode = 'recusar', onClose, onRejected, onAlreadyHandled }: Props) {
  const otherId = useId();
  const [code, setCode] = useState<RejectReasonCode | null>(null);
  const [other, setOther] = useState('');
  const [pause, setPause] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<{ result: RejectResult; pauseFailed: string[] } | null>(null);

  useEffect(() => {
    setCode(null); setOther(''); setPause({}); setBusy(false); setError(null); setDone(null);
  }, [order?._id]);

  const items = order ? orderItems(order) : [];
  const cancel = mode === 'cancelar';
  const verb = cancel ? 'Cancelar' : 'Recusar';
  const reasonText = code === 'other' ? other.trim() : REJECT_REASONS.find((r) => r.code === code)?.description || '';
  const canSubmit = !!code && reasonText.length > 0 && !busy;

  const submit = async () => {
    if (!order || !code || !reasonText) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.post(`/orders/${order._id}/reject`, { reason: reasonText, reasonCode: code });
      const d = unwrap<any>(r) || {};
      const pauseFailed: string[] = [];
      if (code === 'not_available') {
        for (const it of items.filter((i) => pause[i.productId])) {
          try {
            await api.put(`/products/${it.productId}/active`, { isActive: false });
          } catch {
            pauseFailed.push(it.name);
          }
        }
      }
      const result: RejectResult = {
        refundStatus: typeof d.refundStatus === 'string' ? d.refundStatus : undefined,
        refundAmount: typeof d.refundAmount === 'number' ? d.refundAmount : undefined,
      };
      setDone({ result, pauseFailed });
      onRejected(result);
    } catch (err) {
      const e = apiError(err);
      if (e.status === 409) {
        setError('Este pedido já foi aceito ou cancelado. A lista foi atualizada.');
        onAlreadyHandled?.();
      } else {
        setError(e.message || `Não deu para ${verb.toLowerCase()} agora. Tente de novo.`);
      }
    } finally {
      setBusy(false);
    }
  };

  const code6 = order ? shortOrderCode(order._id) : '';

  return (
    <Sheet open={!!order} onClose={onClose} presentation="bottom" title={done ? `Pedido ${cancel ? 'cancelado' : 'recusado'}` : `${verb} o pedido #${code6}?`}>
      {order && done ? (
        <div className={styles.body}>
          {done.result.refundStatus === 'processed' && typeof done.result.refundAmount === 'number' ? (
            <p className={styles.text}>{formatMoney(done.result.refundAmount)} voltam para o cliente.</p>
          ) : (
            <Alert tone="info" title="Reembolso em análise">O reembolso está em análise pela DROP. Avisamos quando sair.</Alert>
          )}
          {done.pauseFailed.length > 0 && (
            <Alert tone="warning" title="Não deu para pausar">
              {done.pauseFailed.join(', ')}. Pause em Produtos.
            </Alert>
          )}
          <Button onClick={onClose}>Fechar</Button>
        </div>
      ) : order ? (
        <div className={styles.body}>
          <p className={styles.text}>Diga o motivo.</p>
          <div role="radiogroup" aria-label="Motivo" className={styles.reasons}>
            {REJECT_REASONS.map((r) => (
              <RadioRow
                key={r.code}
                name={`motivo-${order._id}`}
                value={r.code}
                checked={code === r.code}
                onChange={(v) => setCode(v as RejectReasonCode)}
                label={r.label}
                tone="danger"
              />
            ))}
          </div>
          {code === 'other' && (
            <div className={styles.other}>
              <label htmlFor={otherId} className={styles.label}>Conte o motivo</label>
              <textarea id={otherId} className={styles.textarea} rows={3} maxLength={300} value={other} onChange={(e) => setOther(e.target.value)} />
            </div>
          )}
          {code === 'not_available' && items.length > 0 && (
            <div className={styles.pause}>
              {items.map((it) => (
                <Checkbox
                  key={it.productId}
                  label={`Pausar ${it.name} até eu repor`}
                  checked={!!pause[it.productId]}
                  onChange={(v) => setPause((p) => ({ ...p, [it.productId]: v }))}
                />
              ))}
            </div>
          )}
          {cancel ? (
            <Alert tone="info">O valor devolvido ao cliente aparece na confirmação.</Alert>
          ) : (
            <Alert tone="info">
              {`${order.customerName || 'O cliente'} recebe ${formatMoney(Number(order.totalValue) || 0)} de volta. Recusas entram na sua taxa de cancelamento.`}
            </Alert>
          )}
          {error && <p role="alert" className={styles.error}>{error}</p>}
          <div className={styles.actions}>
            <Button variant="secondary" onClick={onClose} disabled={busy}>Voltar</Button>
            <Button variant="danger" onClick={submit} disabled={!canSubmit} loading={busy}>{`${verb} pedido`}</Button>
          </div>
        </div>
      ) : null}
    </Sheet>
  );
}
