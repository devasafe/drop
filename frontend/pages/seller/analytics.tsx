// frontend/pages/seller/analytics.tsx
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChartColumn } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { useMyStore } from '../../hooks/useMyStore';
import { storeAnalytics, type PaymentMethodRow, type PeakHourCell, type StoreOverview, type TopProduct } from '../../lib/analyticsApi';
import { formatMoney } from '../../lib/money';
import { imageUrl } from '../../lib/config';
import blocks from '../../components/seller/ui/SellerBlocks.module.css';
import styles from './Analytics.module.css';

type Period = '7d' | '30d' | '90d';
const PERIODS: Array<{ id: Period; label: string }> = [
  { id: '7d', label: '7 dias' },
  { id: '30d', label: '30 dias' },
  { id: '90d', label: '90 dias' },
];
const PAYMENT_LABELS: Record<string, string> = {
  pix: 'Pix',
  credit_card: 'Cartão de crédito',
  debit_card: 'Cartão de débito',
  cash_on_delivery: 'Pagar na entrega',
  money: 'Dinheiro',
  unknown: 'Não informado',
};

export function fmtPct(n: number): string {
  return `${(Number(n) || 0).toFixed(1).replace('.', ',')}%`;
}

/** Delta em % vindo do servidor (`overview.delta`). */
export function deltaLabel(pct: number): { text: string; tone: 'ok' | 'err' | 'neutral' } {
  const v = Number(pct) || 0;
  if (Math.round(v) === 0) return { text: 'igual ao período anterior', tone: 'neutral' };
  const abs = Math.abs(Math.round(v));
  return v > 0 ? { text: `↑ ${abs}% vs. período anterior`, tone: 'ok' } : { text: `↓ ${abs}% vs. período anterior`, tone: 'err' };
}

/** Soma a matriz dia×hora em 24 posições (pedidos por hora do dia). */
export function hourly(matrix: PeakHourCell[]): number[] {
  const out = new Array(24).fill(0);
  for (const c of matrix || []) if (c.hour >= 0 && c.hour < 24) out[c.hour] += Number(c.count) || 0;
  return out;
}

/** Um bloco que carrega sozinho: erro em um não derruba os outros. */
function useBlock<T>(key: string, load: () => Promise<T>) {
  const loadRef = useRef(load);
  loadRef.current = load;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<{ data: T | null; failed: boolean }>({ data: null, failed: false });
  useEffect(() => {
    let off = false;
    setState({ data: null, failed: false });
    loadRef.current()
      .then((d) => { if (!off) setState({ data: d, failed: false }); })
      .catch(() => { if (!off) setState({ data: null, failed: true }); });
    return () => { off = true; };
  }, [key, attempt]);
  return { ...state, retry: () => setAttempt((a) => a + 1) };
}

function BlockError({ onRetry }: { onRetry: () => void }) {
  return (
    <div className={blocks.stack}>
      <p className={blocks.meta}>Não carregamos este bloco.</p>
      <Button size="sm" variant="secondary" onClick={onRetry}>Tentar de novo</Button>
    </div>
  );
}

function DeltaKpi({ label, value, delta }: { label: string; value: string; delta: number }) {
  const d = deltaLabel(delta);
  return (
    <div className={blocks.kpi}>
      <small>{label}</small>
      <b>{value}</b>
      <em className={d.tone === 'ok' ? blocks.ok : d.tone === 'err' ? blocks.err : undefined}>{d.text}</em>
    </div>
  );
}

function Peak({ hours }: { hours: number[] }) {
  const active = hours.map((c, h) => ({ c, h })).filter((x) => x.c > 0);
  if (active.length === 0) return <p className={blocks.meta}>Sem pedidos no período.</p>;
  const from = active[0].h;
  const to = active[active.length - 1].h;
  const range = hours.slice(from, to + 1).map((c, i) => ({ c, h: from + i }));
  const max = Math.max(...range.map((x) => x.c));
  const top = [...range].sort((a, b) => b.c - a.c).slice(0, 2).map((x) => x.h);
  const peak = top[0];
  return (
    <div className={styles.peak}>
      <div className={styles.bars} role="img" aria-label={`Pedidos por hora, pico às ${peak}h`}>
        {range.map((x) => (
          <i
            key={x.h}
            className={[styles.bar, top.includes(x.h) && styles.barOn].filter(Boolean).join(' ')}
            style={{ height: `${Math.max(4, Math.round((x.c / max) * 100))}%` }}
          />
        ))}
      </div>
      <div className={styles.axis} aria-hidden="true">
        {range.map((x) => <span key={x.h}>{`${x.h}h`}</span>)}
      </div>
      <p className={blocks.sub}>{`Pico às ${peak}h–${peak + 1}h. Deixe a loja aberta e o estoque em dia nesse horário.`}</p>
    </div>
  );
}

function stockTag(n: number | undefined) {
  if (n == null) return null;
  if (n <= 0) return <span className={[blocks.tag, blocks.tagErr].join(' ')}>esgotado</span>;
  if (n <= 3) return <span className={[blocks.tag, blocks.tagWarn].join(' ')}>{`${n} em estoque`}</span>;
  return <span className={[blocks.tag, blocks.tagOk].join(' ')}>{`${n} em estoque`}</span>;
}

function Desempenho() {
  const [period, setPeriod] = useState<Period>('30d');
  const { products } = useMyStore();
  const overview = useBlock<StoreOverview>(`ov-${period}`, () => storeAnalytics.overview(period));
  const peak = useBlock<number[]>(`ph-${period}`, () => storeAnalytics.peakHours(period).then((r) => hourly(r.matrix)));
  const top = useBlock<TopProduct[]>(`tp-${period}`, () => storeAnalytics.topProducts(period, 5).then((r) => r.products || []));
  const pay = useBlock<PaymentMethodRow[]>(`pm-${period}`, () => storeAnalytics.paymentMethods(period).then((r) => r.methods || []));

  const stock = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products || []) m.set(String(p._id ?? p.id), Number(p.quantity ?? 0));
    return m;
  }, [products]);

  const ov = overview.data;
  const empty = !!ov && ov.current.orders === 0 && ov.previous.orders === 0;
  const platform = ov?.platformCancellationRate;

  return (
    <div className={blocks.body}>
      <div className={blocks.chips} role="group" aria-label="Período">
        {PERIODS.map((p) => <Chip key={p.id} label={p.label} active={period === p.id} onClick={() => setPeriod(p.id)} />)}
      </div>

      {overview.failed ? (
        <div className={blocks.blk}><BlockError onRetry={overview.retry} /></div>
      ) : !ov ? (
        <Skeleton height={168} radius="var(--radius-lg)" />
      ) : empty ? (
        <EmptyState
          icon={<ChartColumn />}
          title="Seus números aparecem depois das primeiras vendas"
          description="Divulgue o QR code da loja e crie um cupom para trazer os primeiros clientes."
        />
      ) : (
        <div className={blocks.kpis4}>
          <DeltaKpi label="Vendas" value={formatMoney(ov.current.revenue)} delta={ov.delta.revenue} />
          <DeltaKpi label="Pedidos" value={String(ov.current.orders)} delta={ov.delta.orders} />
          <DeltaKpi label="Ticket médio" value={formatMoney(ov.current.avgTicket)} delta={ov.delta.avgTicket} />
          <div className={blocks.kpi}>
            <small>Cancelamentos</small>
            <b>{fmtPct(ov.current.cancellationRate)}</b>
            {platform == null
              ? <em>no período</em>
              : <em className={ov.current.cancellationRate <= platform ? blocks.ok : blocks.warn}>{`média DROP ${fmtPct(platform)}`}</em>}
          </div>
        </div>
      )}

      {!empty && (
        <div className={styles.grid}>
          <section className={blocks.blk} aria-label="Quando vendem mais">
            <div className={blocks.head}>
              <h2 className={blocks.headTitle}>Quando vendem mais</h2>
              <span className={blocks.meta}>pedidos por hora</span>
            </div>
            {peak.failed ? <BlockError onRetry={peak.retry} /> : !peak.data ? <Skeleton height={120} /> : <Peak hours={peak.data} />}
          </section>

          <section className={blocks.stack} aria-label="Mais vendidos">
            <h2 className={blocks.cap}>Mais vendidos</h2>
            {top.failed ? (
              <div className={blocks.blk}><BlockError onRetry={top.retry} /></div>
            ) : !top.data ? (
              <Skeleton height={120} radius="var(--radius-lg)" />
            ) : top.data.length === 0 ? (
              <p className={blocks.meta}>Nenhuma venda no período.</p>
            ) : (
              <ul className={blocks.list}>
                {top.data.map((p) => (
                  <li key={p._id} className={blocks.row}>
                    {p.image ? <img className={styles.thumb} src={imageUrl(p.image)} alt="" /> : <span className={blocks.ico} aria-hidden="true">{(p.name || '?')[0]}</span>}
                    <span className={blocks.tx}>
                      <b>{p.name || 'Produto'}</b>
                      <span>{`${p.quantity} vendas · ${formatMoney(p.revenue)}`}</span>
                    </span>
                    {stockTag(stock.get(String(p._id)))}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className={blocks.blk} aria-label="Como pagam">
            <h2 className={blocks.headTitle}>Como pagam</h2>
            {pay.failed ? <BlockError onRetry={pay.retry} /> : !pay.data ? <Skeleton height={80} /> : pay.data.length === 0 ? (
              <p className={blocks.meta}>Nenhum pagamento no período.</p>
            ) : (
              <div className={blocks.sum}>
                {pay.data.map((m) => (
                  <div key={m.method}>
                    <span>{PAYMENT_LABELS[m.method] || m.method}</span>
                    <span>{`${Math.round(Number(m.percent) || 0)}%`}</span>
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

export default function SellerAnalytics() {
  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title="Desempenho" back="/seller/loja">
        <Desempenho />
      </SellerShell>
    </ProtectedRoute>
  );
}
