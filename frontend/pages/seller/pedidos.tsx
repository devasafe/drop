import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ClipboardList, PackageCheck, Undo2 } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { useSellerPanel } from '../../components/seller/panel/SellerPanelProvider';
import { Tabs, tabPanelProps } from '../../components/ui/Tabs';
import { SearchField } from '../../components/ui/SearchField';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import { ReturnConfirm } from '../../components/seller/order/ReturnConfirm';
import { StageTag } from '../../components/seller/StageTag';
import api from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { shortOrderCode } from '../../lib/customerOrder';
import { SELLER_ROUTES } from '../../lib/sellerRoutes';
import { hasPendingReturn, itemsSummary, orderStage, parseSeg, sortOngoing, type PedidosSeg } from '../../lib/sellerOrders';
import { formatDateTime, formatHour } from '../../lib/sellerApi';
import styles from './PedidosLoja.module.css';

const TABS_ID = 'pedidos';

function OrderTable({ rows, timeOf, caption }: { rows: any[]; timeOf: (o: any) => string; caption: string }) {
  return (
    <table className={styles.table}>
      <caption className={styles.srOnly}>{caption}</caption>
      <thead>
        <tr>
          <th scope="col">Pedido</th>
          <th scope="col">Cliente</th>
          <th scope="col">Itens</th>
          <th scope="col">Valor</th>
          <th scope="col">Situação</th>
          <th scope="col">Hora</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((o) => {
          const st = orderStage(o);
          return (
            <tr key={o._id}>
              <td className={styles.cCode}><Link href={SELLER_ROUTES.pedido(o._id)} className={styles.code}>{`#${shortOrderCode(o._id)}`}</Link></td>
              <td className={styles.cCustomer}>{o.customerName || 'Cliente'}</td>
              <td className={styles.cItems}>{itemsSummary(o)}</td>
              <td className={styles.cMoney}>{formatMoney(Number(o.totalValue) || 0)}</td>
              <td className={styles.cStage}><StageTag label={st.label} tone={st.tone} /></td>
              <td className={styles.cTime}>{timeOf(o)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const ongoingTime = (o: any) => (o.acceptedAt ? `aceito às ${formatHour(o.acceptedAt)}` : `recebido às ${formatHour(o.createdAt) ?? '—'}`);
const historyTime = (o: any) => formatDateTime(o.delivery?.deliveredAt || o.cancelledAt || o.createdAt) ?? '—';

export default function SellerPedidosPage() {
  const router = useRouter();
  const seg = parseSeg(router.query.seg);
  const { orders, returnRequests, refresh } = useSellerPanel();
  const [history, setHistory] = useState<any[] | null>(null);
  const [historyError, setHistoryError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [limit, setLimit] = useState(30);
  const [q, setQ] = useState('');
  const [notice, setNotice] = useState<string | null>(null);

  useEffect(() => {
    if (seg !== 'historico') return;
    let off = false;
    setHistoryError(false);
    api.get('/stores/dashboard')
      .then((r) => { if (!off) setHistory(Array.isArray(r?.data?.history) ? r.data.history : []); })
      .catch(() => { if (!off) setHistoryError(true); });
    return () => { off = true; };
  }, [seg, attempt]);

  const list = Array.isArray(orders) ? orders : [];
  const ongoing = sortOngoing(list);
  // Devolução pendente vem do pedido e também do aviso em tempo real (panel.returnRequests).
  const requested = new Set((Array.isArray(returnRequests) ? returnRequests : []).map((r) => String(r.orderId)));
  const returns = list.filter((o) => hasPendingReturn(o) || (requested.has(String(o._id)) && o.delivery?._id));
  const term = q.trim().toLowerCase();
  const match = (o: any) => !term
    || shortOrderCode(o._id).toLowerCase().includes(term)
    || String(o.customerName || '').toLowerCase().includes(term);
  const historySorted = useMemo(
    () => [...(history || [])].sort((a, b) => (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0)),
    [history],
  );

  const go = (id: string) => router.replace(SELLER_ROUTES.pedidos(id as PedidosSeg), undefined, { shallow: true });

  const noMatch = (
    <EmptyState icon={<ClipboardList size={28} />} title={`Nada com "${q.trim()}".`} description="Confira o número ou o nome do cliente." />
  );

  let panel: JSX.Element;
  if (seg === 'andamento') {
    const rows = ongoing.filter(match);
    panel = ongoing.length === 0
      ? <EmptyState icon={<ClipboardList size={28} />} title="Nenhum pedido em andamento" description="Os pedidos novos aparecem aqui e no Agora." />
      : rows.length === 0 ? noMatch : <OrderTable rows={rows} timeOf={ongoingTime} caption="Pedidos em andamento" />;
  } else if (seg === 'historico') {
    const rows = historySorted.filter(match);
    panel = historyError
      ? <EmptyState variant="error" icon={<ClipboardList size={28} />} title="Não carregamos o histórico" description="Confira a conexão." onRetry={() => setAttempt((n) => n + 1)} />
      : history === null
        ? <div role="status" aria-label="Carregando" className={styles.loading}><Skeleton height={56} /><Skeleton height={56} /><Skeleton height={56} /></div>
        : history.length === 0
          ? <EmptyState icon={<PackageCheck size={28} />} title="Nenhum pedido no histórico" description="Pedidos entregues e cancelados ficam aqui." />
          : rows.length === 0 ? noMatch : (
            <>
              <OrderTable rows={rows.slice(0, limit)} timeOf={historyTime} caption="Histórico de pedidos" />
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
              <ReturnConfirm deliveryId={String(o.delivery?._id)} onDone={() => { setNotice('Devolução confirmada.'); refresh(); }} />
            </li>
          ))}
        </ul>
      );
  }

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title="Pedidos">
        <div className={styles.page}>
          <Tabs
            label="Pedidos"
            idPrefix={TABS_ID}
            value={seg}
            onChange={go}
            items={[
              { id: 'andamento', label: 'Em andamento', count: ongoing.length },
              { id: 'historico', label: 'Histórico' },
              { id: 'devolucoes', label: 'Devoluções', count: returns.length },
            ]}
          />
          <SearchField value={q} onChange={setQ} placeholder="Buscar por número ou cliente" inputProps={{ 'aria-label': 'Buscar pedidos' }} />
          {notice && <p role="status" className={styles.notice}>{notice}</p>}
          <div {...tabPanelProps(seg, TABS_ID)} className={styles.panel}>
            {panel}
          </div>
        </div>
      </SellerShell>
    </ProtectedRoute>
  );
}
