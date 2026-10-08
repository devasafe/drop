import { useEffect, useState } from 'react';
import api from '../../../lib/api';
import { Section } from '../../ui/Section';
import { humanizeTransferError, TRANSFER_STATUS_LABEL } from '../../../lib/transferErrors';

interface Row {
  id: string;
  orderId: string;
  motoboyName: string | null;
  status: string;
  amount: number;
  lastError: string | null;
  pixKeyMasked: string;
}

/** Pagamentos (Pix) da loja aos motoboys no modo direto: o lojista vê o que está pendente e por quê. */
export default function MotoboyTransfersCard({ storeId }: { storeId: string }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await api.get(`/stores/${storeId}/transfers`);
        const data = r.data?.data;
        if (!cancelled) setRows(Array.isArray(data) ? data : []);
      } catch {
        if (!cancelled) setError('Não foi possível carregar os pagamentos.');
      }
    })();
    return () => { cancelled = true; };
  }, [storeId]);

  return (
    <Section title="Pagamentos a motoboys">
      {error && <p role="alert" style={{ color: 'var(--danger)' }}>{error}</p>}
      {!error && rows && rows.length === 0 && <p style={{ color: 'var(--text-muted)' }}>Nenhum pagamento a motoboy ainda.</p>}
      <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        {(rows ?? []).map((r) => (
          <li key={r.id} style={{ padding: 'var(--space-3)', border: '1px solid var(--line)', borderRadius: 'var(--r-lg)', background: 'var(--surface)' }}>
            <div style={{ color: 'var(--text)' }}>
              {r.motoboyName ?? 'Motoboy'} — pedido {String(r.orderId).slice(-6)} — R$ {Number(r.amount).toFixed(2).replace('.', ',')}
            </div>
            <div style={{ color: 'var(--text-muted)' }}>
              {TRANSFER_STATUS_LABEL[r.status] ?? r.status}{r.pixKeyMasked ? ` · Pix ${r.pixKeyMasked}` : ''}
            </div>
            {r.lastError && r.status !== 'done' && <div style={{ color: 'var(--danger)' }}>{humanizeTransferError(r.lastError)}</div>}
          </li>
        ))}
      </ul>
    </Section>
  );
}
