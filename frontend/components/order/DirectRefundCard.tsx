import { useState } from 'react';
import api from '../../lib/api';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';
import { humanizeRefundError, REFUND_STATUS_LABEL } from '../../lib/refundErrors';

export interface DirectRefundSummary {
  status: string;
  amount: number;
  lastError?: string | null;
  attempts?: number;
}

/** Card "Estorno" do pedido direto. O botão só existe para pending/failed. */
export function DirectRefundCard({ orderId, refund, onChange }: {
  orderId: string;
  refund: DirectRefundSummary;
  onChange?: () => void;
}) {
  const [current, setCurrent] = useState(refund);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const canRetry = current.status === 'pending' || current.status === 'failed';
  const detail = humanizeRefundError(current.lastError);

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.post(`/orders/${orderId}/refund-direct`);
      const d = r.data?.data;
      if (d) setCurrent({ status: d.status, amount: d.amount, lastError: d.lastError, attempts: d.attempts });
      onChange?.();
    } catch (e: any) {
      setError(e?.response?.data?.error?.message || e?.response?.data?.error || 'Não foi possível estornar agora.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <h3 style={{ margin: 0, fontFamily: 'var(--font-display)', color: 'var(--text)' }}>Estorno</h3>
      <p style={{ margin: 'var(--space-2) 0', color: 'var(--text)' }}>
        {REFUND_STATUS_LABEL[current.status] ?? current.status} — R$ {Number(current.amount).toFixed(2).replace('.', ',')}
      </p>
      {detail && current.status !== 'done' && <p role="status" style={{ margin: 0, color: 'var(--danger)' }}>{detail}</p>}
      {error && <p role="alert" style={{ margin: 0, color: 'var(--danger)' }}>{error}</p>}
      {canRetry && (
        <div style={{ marginTop: 'var(--space-3)' }}>
          <Button onClick={run} loading={busy}>Estornar</Button>
        </div>
      )}
    </Card>
  );
}
