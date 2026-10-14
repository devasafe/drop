// frontend/pages/seller/avaliacoes.tsx
import { useCallback, useEffect, useId, useState } from 'react';
import { Reply, Star } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { useSellerPanel } from '../../components/seller/panel/SellerPanelProvider';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { ProgressBar } from '../../components/ui/ProgressBar';
import { formatRating } from '../../components/ui/Rating';
import { Skeleton } from '../../components/ui/Skeleton';
import { useToast } from '../../components/ui/Toast';
import api from '../../lib/api';
import { payload, apiErrorMessage, formatDayMonth } from '../../lib/sellerApi';
import blocks from '../../components/panel/PanelBlocks.module.css';
import styles from './SellerAvaliacoes.module.css';

export interface StoreReview {
  orderId?: string;
  storeRating: number;
  storeComment?: string | null;
  createdAt: string;
  storeReply?: string | null;
  storeRepliedAt?: string | null;
}

export function ratingStats(list: StoreReview[]) {
  const dist: Record<1 | 2 | 3 | 4 | 5, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
  let sum = 0;
  for (const r of list) {
    const n = Math.min(5, Math.max(1, Math.round(Number(r.storeRating) || 0))) as 1 | 2 | 3 | 4 | 5;
    dist[n] += 1;
    sum += Number(r.storeRating) || 0;
  }
  return {
    count: list.length,
    avg: list.length ? sum / list.length : 0,
    dist,
    unanswered: list.filter((r) => !r.storeReply).length,
  };
}

const REPLY_MAX = 500;
const shortId = (id?: string) => (id ? id.slice(-4).toUpperCase() : '----');
function whenLabel(iso: string): string {
  const d = new Date(iso);
  const days = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (days <= 0) return 'hoje';
  if (days === 1) return 'ontem';
  if (days < 7) return `${days} dias`;
  return formatDayMonth(iso) || '';
}

type Filter = 'todas' | 'sem' | 'baixas';

function ReviewCard({ r, storeId, storeName, onSaved }: { r: StoreReview; storeId: string; storeName: string; onSaved: (r: StoreReview) => void }) {
  const { showToast } = useToast();
  const fieldId = useId();
  const [editing, setEditing] = useState(!r.storeReply);
  const [text, setText] = useState(r.storeReply || '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const trimmed = text.trim();
  const valid = trimmed.length >= 1 && trimmed.length <= REPLY_MAX && !!r.orderId;

  const send = async () => {
    if (!valid) return;
    setBusy(true);
    setError('');
    try {
      const res = await api.put(`/stores/${storeId}/ratings/${r.orderId}/reply`, { text: trimmed });
      const d = payload<{ storeReply?: string; storeRepliedAt?: string }>(res);
      onSaved({ ...r, storeReply: d?.storeReply ?? trimmed, storeRepliedAt: d?.storeRepliedAt ?? new Date().toISOString() });
      setEditing(false);
      showToast('Resposta publicada', 'success');
    } catch (e) {
      setError(apiErrorMessage(e, 'Não foi possível responder agora. Tente de novo.'));
    } finally {
      setBusy(false);
    }
  };

  return (
    <article className={blocks.blk} aria-label={`Avaliação do pedido #${shortId(r.orderId)}`}>
      <div className={blocks.head}>
        <span className={styles.score}>
          <Star size={16} aria-hidden="true" /> <b>{r.storeRating}</b> · {`Pedido #${shortId(r.orderId)}`}
        </span>
        <span className={blocks.meta}>{whenLabel(r.createdAt)}</span>
      </div>
      {r.storeComment ? <p className={blocks.sub}>{`“${r.storeComment}”`}</p> : <p className={blocks.meta}>Sem comentário</p>}

      {!editing && r.storeReply && (
        <div className={styles.reply}>
          <p className={styles.replyText}><b>{storeName}</b></p>
          <p className={styles.replyText}>{r.storeReply}</p>
          <button type="button" className={blocks.link} onClick={() => { setText(r.storeReply || ''); setEditing(true); }}>Editar resposta</button>
        </div>
      )}

      {editing && (
        <>
          <label htmlFor={fieldId} className={blocks.srOnly}>Sua resposta</label>
          <textarea
            id={fieldId}
            className={blocks.textarea}
            value={text}
            maxLength={REPLY_MAX}
            placeholder="Responda com educação. A resposta aparece na página da loja."
            onChange={(e) => setText(e.target.value)}
          />
          <div className={blocks.head}>
            <span className={blocks.meta}>{`${trimmed.length}/${REPLY_MAX} · aparece na página da loja`}</span>
            <Button size="sm" leftIcon={<Reply size={16} />} disabled={!valid} loading={busy} onClick={send}>
              {r.storeReply ? 'Salvar resposta' : 'Responder'}
            </Button>
          </div>
          {error && <p role="alert" className={blocks.errText}>{error}</p>}
        </>
      )}
    </article>
  );
}

export default function SellerAvaliacoes() {
  const { store } = useSellerPanel();
  const storeId = store?._id ? String(store._id) : null;
  const [list, setList] = useState<StoreReview[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [filter, setFilter] = useState<Filter>('todas');

  const load = useCallback(() => {
    if (!storeId) return;
    setFailed(false);
    setList(null);
    api.get(`/stores/${storeId}/ratings`)
      .then((r) => { const d = payload<StoreReview[]>(r); setList(Array.isArray(d) ? d : []); })
      .catch(() => setFailed(true));
  }, [storeId]);
  useEffect(() => { load(); }, [load]);

  const stats = ratingStats(list || []);
  const visible = (list || []).filter((r) => (filter === 'sem' ? !r.storeReply : filter === 'baixas' ? Number(r.storeRating) <= 3 : true));
  const replace = (next: StoreReview) => setList((cur) => (cur || []).map((r) => (r.orderId === next.orderId ? next : r)));

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title="Avaliações" back="/seller/loja">
        <div className={blocks.body}>
          {failed ? (
            <EmptyState variant="error" icon={<Star />} title="Não carregamos as avaliações" onRetry={load} />
          ) : !list ? (
            <>
              <Skeleton height={120} radius="var(--radius-lg)" />
              <Skeleton height={140} radius="var(--radius-lg)" />
            </>
          ) : list.length === 0 ? (
            <EmptyState icon={<Star />} title="As avaliações chegam depois das entregas" description="Pedidos bem embalados e no prazo costumam tirar 5." />
          ) : (
            <>
              <section className={[blocks.blk, styles.summary].join(' ')} aria-label="Resumo das notas">
                <div className={styles.avg}>
                  <span className={blocks.big}>{formatRating(stats.avg)}</span>
                  <span className={blocks.meta}>{stats.count === 1 ? '1 nota' : `${stats.count} notas`}</span>
                </div>
                <div className={styles.dist}>
                  {([5, 4, 3, 2, 1] as const).map((n) => (
                    <div key={n} className={styles.distRow}>
                      <span>{n}</span>
                      <ProgressBar value={stats.dist[n]} max={stats.count} label={`Notas ${n}`} valueText={String(stats.dist[n])} />
                      <span>{stats.dist[n]}</span>
                    </div>
                  ))}
                </div>
              </section>

              <div className={blocks.chips} role="group" aria-label="Filtrar avaliações">
                <Chip label="Todas" active={filter === 'todas'} onClick={() => setFilter('todas')} />
                <Chip label={`Sem resposta ${stats.unanswered}`} active={filter === 'sem'} onClick={() => setFilter('sem')} />
                <Chip label="Notas 1–3" active={filter === 'baixas'} onClick={() => setFilter('baixas')} />
              </div>

              {visible.length === 0 && <p className={blocks.meta}>Nada neste filtro.</p>}
              {visible.map((r) => (
                <ReviewCard key={r.orderId || r.createdAt} r={r} storeId={storeId as string} storeName={store?.name || 'Sua loja'} onSaved={replace} />
              ))}
            </>
          )}
        </div>
      </SellerShell>
    </ProtectedRoute>
  );
}
