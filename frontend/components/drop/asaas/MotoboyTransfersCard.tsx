import { useEffect, useRef, useState } from 'react';
import api from '../../../lib/api';
import { Section } from '../../ui/Section';
import { Button } from '../../ui/Button';
import { humanizeTransferError, TRANSFER_STATUS_LABEL } from '../../../lib/transferErrors';
import styles from './MotoboyTransfersCard.module.css';

export interface TransferRow {
  id: string;
  orderId: string;
  motoboyName: string | null;
  status: string;
  amount: number;
  lastError: string | null;
  pixKeyMasked: string;
  attempts?: number;
  nextAttemptAt?: string | null;
  firstFailedAt?: string | null;
  createdAt?: string;
}

const STUCK = new Set(['failed', 'failed_final', 'uncertain']);

/**
 * Pagamentos (Pix) da loja aos motoboys no modo direto: o lojista vê o que está pendente e por quê.
 * Com `onOpen`, cada Pix parado oferece "Ver o que fazer" (sheet da tela Dinheiro).
 */
export default function MotoboyTransfersCard({ storeId, onOpen }: { storeId: string; onOpen?: (row: TransferRow) => void }) {
  const [rows, setRows] = useState<TransferRow[] | null>(null);
  const [error, setError] = useState('');
  // Paginação por cursor: o backend devolve `nextCursor` (null = acabou).
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  // Geração da consulta: trocar de loja invalida um "Carregar mais" em voo da loja anterior.
  const queryGen = useRef(0);

  useEffect(() => {
    let cancelled = false;
    ++queryGen.current;
    setNextCursor(null);
    (async () => {
      try {
        const r = await api.get(`/stores/${storeId}/transfers`);
        const data = r.data?.data;
        if (!cancelled) {
          setRows(Array.isArray(data) ? data : []);
          setNextCursor(r.data?.nextCursor ?? null);
        }
      } catch {
        if (!cancelled) setError('Não foi possível carregar os pagamentos.');
      }
    })();
    return () => { cancelled = true; };
  }, [storeId]);

  const loadMore = async () => {
    if (!nextCursor || loadingMore) return;
    const gen = queryGen.current;
    setLoadingMore(true);
    try {
      const r = await api.get(`/stores/${storeId}/transfers`, { params: { cursor: nextCursor } });
      if (gen !== queryGen.current) return; // outra loja: resposta da lista antiga
      const more: TransferRow[] = Array.isArray(r.data?.data) ? r.data.data : [];
      setRows((prev) => [...(prev ?? []), ...more.filter((m) => !(prev ?? []).some((p) => p.id === m.id))]);
      setNextCursor(r.data?.nextCursor ?? null);
    } catch {
      if (gen === queryGen.current) setError('Não foi possível carregar os pagamentos.');
    } finally {
      setLoadingMore(false);
    }
  };

  return (
    <Section title="Pagamentos a motoboys">
      {error && <p role="alert" className={styles.error}>{error}</p>}
      {!error && rows && rows.length === 0 && <p className={styles.empty}>Nenhum pagamento a motoboy ainda.</p>}
      <ul className={styles.list}>
        {(rows ?? []).map((r) => (
          <li key={r.id} className={styles.item}>
            <div className={styles.title}>
              {r.motoboyName ?? 'Motoboy'} — pedido {String(r.orderId).slice(-6)} — R$ {Number(r.amount).toFixed(2).replace('.', ',')}
            </div>
            <div className={styles.meta}>
              {TRANSFER_STATUS_LABEL[r.status] ?? r.status}{r.pixKeyMasked ? ` · Pix ${r.pixKeyMasked}` : ''}
            </div>
            {r.lastError && r.status !== 'done' && <div className={styles.error}>{humanizeTransferError(r.lastError)}</div>}
            {onOpen && r.status !== 'done' && (STUCK.has(r.status) || !!r.lastError) && (
              <div className={styles.action}>
                <Button variant="tertiary" size="sm" onClick={() => onOpen(r)}>Ver o que fazer</Button>
              </div>
            )}
          </li>
        ))}
      </ul>
      {!error && nextCursor && (
        <div className={styles.more}>
          <Button variant="tertiary" loading={loadingMore} onClick={loadMore}>Carregar mais</Button>
        </div>
      )}
    </Section>
  );
}
