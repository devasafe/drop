import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ClipboardList, PackageCheck, Search, Undo2 } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { useSellerPanel } from '../../components/seller/panel/SellerPanelProvider';
import { Tabs, tabPanelProps } from '../../components/ui/Tabs';
import { SearchField } from '../../components/ui/SearchField';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import { IconButton } from '../../components/ui/IconButton';
import { ReturnConfirm } from '../../components/seller/order/ReturnConfirm';
import { AcceptCountdown } from '../../components/seller/order/AcceptCountdown';
import { StageTag } from '../../components/seller/StageTag';
import api from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { shortOrderCode } from '../../lib/customerOrder';
import { SELLER_ROUTES } from '../../lib/sellerRoutes';
import { hasPendingReturn, isAwaitingAccept, isCancelled, itemsSummary, orderStage, parseSeg, sortOngoing, type PedidosSeg } from '../../lib/sellerOrders';
import { formatDayMonth, formatHour, todayISO } from '../../lib/sellerApi';
import styles from './PedidosLoja.module.css';

const TABS_ID = 'pedidos';

interface Row { o: any; meta: ReactNode }

/** Linhas em card: pedido e cliente à esquerda, valor e selo à direita; com título de período, se pedido. */
function OrderList({ rows, label, periodOf }: { rows: Row[]; label: string; periodOf?: (o: any) => string }) {
  const groups: Array<{ title: string | null; items: Row[] }> = [];
  for (const r of rows) {
    const title = periodOf ? periodOf(r.o) : null;
    const last = groups[groups.length - 1];
    if (last && last.title === title) last.items.push(r);
    else groups.push({ title, items: [r] });
  }
  return (
    <div className={styles.groups} role="group" aria-label={label}>
      {groups.map((g, i) => (
        <section key={`${g.title ?? 'g'}-${i}`} className={styles.group}>
          {g.title && <h2 className={styles.period}>{g.title}</h2>}
          <ul className={styles.list}>
            {g.items.map(({ o, meta }) => {
              const st = orderStage(o);
              return (
                <li key={o._id} className={styles.row}>
                  <div className={styles.rowMain}>
                    <Link href={SELLER_ROUTES.pedido(o._id)} className={styles.code}>{`#${shortOrderCode(o._id)}`}</Link>
                    <span className={styles.customer}>{o.customerName || 'Cliente'}</span>
                    <p className={styles.rowMeta}>{meta}</p>
                  </div>
                  <div className={styles.rowEnd}>
                    <span className={[styles.money, isCancelled(o) ? styles.moneyOff : ''].filter(Boolean).join(' ')}>{formatMoney(Number(o.totalValue) || 0)}</span>
                    <StageTag label={st.label} tone={st.tone} />
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}

const ongoingTime = (o: any) => (o.acceptedAt ? `aceito às ${formatHour(o.acceptedAt)}` : `recebido às ${formatHour(o.createdAt) ?? '—'}`);
const doneAt = (o: any) => o.delivery?.deliveredAt || o.cancelledAt || o.createdAt;
const doneTs = (o: any) => Date.parse(doneAt(o)) || 0;
const doneTime = (o: any) => `${isCancelled(o) ? 'cancelado' : 'entregue'} às ${formatHour(doneAt(o)) ?? '—'}`;

/** "Hoje", "Ontem" ou dia/mês, no fuso de São Paulo. */
function periodOf(o: any): string {
  const d = new Date(doneAt(o));
  if (Number.isNaN(d.getTime())) return 'Mais antigos';
  const day = todayISO(d);
  if (day === todayISO()) return 'Hoje';
  if (day === todayISO(new Date(Date.now() - 86400000))) return 'Ontem';
  return formatDayMonth(d) ?? 'Mais antigos';
}

export default function SellerPedidosPage() {
  const router = useRouter();
  const sellerPanel = useSellerPanel();
  const { orders, returnRequests, refresh, dismissReturn } = sellerPanel;
  // V12: no painel, os concluídos vêm do histórico que o SellerPanelProvider já leu; fora, o GET próprio.
  const inPanel = sellerPanel?.inPanel === true;
  const [ownHistory, setHistory] = useState<any[] | null>(null);
  const [ownHistoryError, setHistoryError] = useState(false);
  const panelHistory: any[] = Array.isArray(sellerPanel?.history) ? sellerPanel.history : [];
  const panelFailed = inPanel && !sellerPanel.loading && !!sellerPanel.error && panelHistory.length === 0;
  const history = inPanel ? (sellerPanel.loading || panelFailed ? null : panelHistory) : ownHistory;
  const historyError = inPanel ? panelFailed : ownHistoryError;
  const retryHistory = () => { if (inPanel) refresh(); else setAttempt((n) => n + 1); };
  const [attempt, setAttempt] = useState(0);
  const [limit, setLimit] = useState(30);
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const list = Array.isArray(orders) ? orders : [];
  const sorted = sortOngoing(list);
  const novos = sorted.filter(isAwaitingAccept);
  const ongoing = sorted.filter((o) => !isAwaitingAccept(o));
  // Sem ?seg, abre onde há trabalho: pedido esperando aceite primeiro. Calculado uma vez ao entrar,
  // com o router e o painel prontos: um pedido que chega depois não troca o segmento (V13).
  const routerReady = router.isReady !== false;
  const ordersReady = !(inPanel && sellerPanel.loading);
  const defaultSeg = useRef<PedidosSeg | null>(null);
  if (defaultSeg.current === null && routerReady && router.query.seg === undefined && ordersReady) {
    defaultSeg.current = novos.length > 0 ? 'novos' : 'andamento';
  }
  const seg: PedidosSeg | null = !routerReady ? null
    : router.query.seg === undefined ? defaultSeg.current : parseSeg(router.query.seg);

  useEffect(() => {
    if (seg !== 'concluidos' || inPanel) return;
    let off = false;
    setHistoryError(false);
    api.get('/stores/dashboard')
      .then((r) => { if (!off) setHistory(Array.isArray(r?.data?.history) ? r.data.history : []); })
      .catch(() => { if (!off) setHistoryError(true); });
    return () => { off = true; };
  }, [seg, attempt, inPanel]);

  // Devolução pendente vem do pedido e também do aviso em tempo real (panel.returnRequests).
  const requested = new Set((Array.isArray(returnRequests) ? returnRequests : []).map((r) => String(r.orderId)));
  const returns = list.filter((o) => hasPendingReturn(o) || (requested.has(String(o._id)) && o.delivery?._id));
  const term = q.trim().toLowerCase();
  const match = (o: any) => !term
    || shortOrderCode(o._id).toLowerCase().includes(term)
    || String(o.customerName || '').toLowerCase().includes(term);
  const historySorted = useMemo(
    () => [...(history || [])].sort((a, b) => doneTs(b) - doneTs(a)),
    [history],
  );

  const go = (id: string) => router.replace(SELLER_ROUTES.pedidos(id as PedidosSeg), undefined, { shallow: true });

  const noMatch = (
    <EmptyState icon={<ClipboardList size={28} />} title={`Nada com "${q.trim()}".`} description="Confira o número ou o nome do cliente." />
  );

  let panel: JSX.Element;
  if (seg === null) {
    panel = <div role="status" aria-label="Carregando" className={styles.loading}><Skeleton height={56} /><Skeleton height={56} /><Skeleton height={56} /></div>;
  } else if (seg === 'novos' || seg === 'andamento') {
    const all = seg === 'novos' ? novos : ongoing;
    const rows = all.filter(match);
    panel = all.length === 0
      ? seg === 'novos'
        ? <EmptyState icon={<ClipboardList size={28} />} title="Nenhum pedido novo" description="Quando chegar um pedido, ele aparece aqui e no Agora." />
        : <EmptyState icon={<ClipboardList size={28} />} title="Nenhum pedido em andamento" description="Os pedidos aceitos aparecem aqui até a entrega." />
      : rows.length === 0 ? noMatch : (
        <OrderList
          label={seg === 'novos' ? 'Pedidos novos' : 'Pedidos em andamento'}
          rows={rows.map((o) => ({
            o,
            meta: isAwaitingAccept(o)
              ? <>{itemsSummary(o)} <AcceptCountdown deadline={o.acceptDeadline} onExpire={refresh} /></>
              : `${itemsSummary(o)} · ${ongoingTime(o)}`,
          }))}
        />
      );
  } else if (seg === 'concluidos') {
    const rows = historySorted.filter(match);
    panel = historyError
      ? <EmptyState variant="error" icon={<ClipboardList size={28} />} title="Não carregamos os concluídos" description="Confira a conexão." onRetry={retryHistory} />
      : history === null
        ? <div role="status" aria-label="Carregando" className={styles.loading}><Skeleton height={56} /><Skeleton height={56} /><Skeleton height={56} /></div>
        : history.length === 0
          ? <EmptyState icon={<PackageCheck size={28} />} title="Nenhum pedido concluído" description="Pedidos entregues e cancelados ficam aqui." />
          : rows.length === 0 ? noMatch : (
            <>
              <OrderList
                label="Pedidos concluídos"
                periodOf={periodOf}
                rows={rows.slice(0, limit).map((o) => ({ o, meta: `${itemsSummary(o)} · ${doneTime(o)}` }))}
              />
              {rows.length > limit && (
                <Button variant="tertiary" onClick={() => setLimit((n) => n + 30)}>{`Ver mais (${rows.length - limit})`}</Button>
              )}
            </>
          );
  } else {
    const rows = returns.filter(match);
    panel = returns.length === 0
      ? <EmptyState icon={<Undo2 size={28} />} title="Nenhuma devolução — ótimo sinal" description="Quando um motoboy precisar devolver um pedido, ele aparece aqui." />
      : rows.length === 0 ? noMatch : (
        <ul className={styles.returns}>
          {rows.map((o) => (
            <li key={o._id} className={styles.returnCard}>
              <div className={styles.returnHead}>
                <Link href={SELLER_ROUTES.pedido(o._id)} className={styles.code}>{`#${shortOrderCode(o._id)}`}</Link>
                <span className={styles.money}>{formatMoney(Number(o.totalValue) || 0)}</span>
              </div>
              <p className={styles.meta}>{`${o.customerName || 'Cliente'} · ${itemsSummary(o)}`}</p>
              <p className={styles.meta}>O motoboy está voltando com o produto. Confira e digite o PIN que ele mostrar.</p>
              <ReturnConfirm deliveryId={String(o.delivery?._id)} onDone={() => { setNotice('Devolução confirmada.'); dismissReturn(String(o.delivery._id)); refresh(); }} />
            </li>
          ))}
        </ul>
      );
  }

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell
        title="Pedidos"
        actions={(
          <IconButton
            icon={<Search size={18} />}
            variant="soft"
            size={40}
            aria-label="Buscar pedidos"
            aria-expanded={searching}
            onClick={() => { if (searching) setQ(''); setSearching((v) => !v); }}
          />
        )}
      >
        <div className={styles.page}>
          <Tabs
            label="Pedidos"
            idPrefix={TABS_ID}
            value={seg ?? ''}
            onChange={go}
            items={[
              { id: 'novos', label: 'Novos', count: novos.length },
              { id: 'andamento', label: 'Em andamento', count: ongoing.length },
              { id: 'concluidos', label: 'Concluídos' },
              { id: 'devolucoes', label: 'Devoluções', count: returns.length },
            ]}
          />
          {searching && (
            <SearchField value={q} onChange={setQ} placeholder="Buscar por número ou cliente" inputProps={{ 'aria-label': 'Buscar pedidos', autoFocus: true }} />
          )}
          {notice && <p role="status" className={styles.notice}>{notice}</p>}
          {seg === null ? panel : (
            <div {...tabPanelProps(seg, TABS_ID)} className={styles.panel}>
              {panel}
            </div>
          )}
        </div>
      </SellerShell>
    </ProtectedRoute>
  );
}
