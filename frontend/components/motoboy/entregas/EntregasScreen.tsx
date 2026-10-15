import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Bike, Clock, Package } from 'lucide-react';
import api from '../../../lib/api';
import { Tabs, tabPanelProps } from '../../ui/Tabs';
import { Chip } from '../../ui/Chip';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { NavRow } from '../../panel/NavRow';
import { EntregaRow } from './EntregaRow';
import { useAutoRefetch } from '../../../hooks/useAutoRefetch';
import { useMotoboyMoney } from '../../../hooks/useMotoboyMoney';
import { useSocket } from '../../../contexts/SocketContext';
import { filterHistory, historyStats, ongoingStatusView } from '../../../lib/deliveryStatus';
import { MOTOBOY_ROUTES, type EntregasSeg } from '../../../lib/motoboyRoutes';
import { deliveryDate, groupByDay, inMonth, monthName, sumAll } from '../../../lib/motoboyMoney';
import { formatMoney } from '../../../lib/money';
import { shortOrderCode } from '../../../lib/customerOrder';
import blocks from '../../panel/PanelBlocks.module.css';
import styles from './Entregas.module.css';

type Filter = 'all' | 'delivered' | 'cancelled';
const asSeg = (v: unknown): EntregasSeg | null => (v === 'andamento' || v === 'concluidas' ? v : null);
const EVENTS = ['delivery:assigned_to_you', 'delivery:updated', 'delivery:picked', 'delivery:completed', 'delivery:cancelled', 'delivery:return_confirmed'];
const pctText = (n: number) => `${String(n).replace('.', ',')}%`;

/**
 * Janela do dinheiro: o MENOR createdAt das corridas exibidas (o dinheiro de uma corrida nunca
 * nasce antes da linha da entrega). Sem nenhuma data válida → null (lista inteira, até o teto).
 */
function oldestCreatedAt(list: any[]): string | null {
  let min = NaN;
  let iso: string | null = null;
  for (const d of list) {
    const t = d?.createdAt ? new Date(String(d.createdAt)).getTime() : NaN;
    if (!Number.isNaN(t) && (Number.isNaN(min) || t < min)) { min = t; iso = String(d.createdAt); }
  }
  return iso;
}

/** Entregas do motoboy (protótipo "Entregas"): em andamento e concluídas, com o dinheiro de cada uma. */
export function EntregasScreen({ now = new Date() }: { now?: Date }) {
  const router = useRouter();
  const querySeg = asSeg(router.query?.seg);
  const { onReconnect } = useSocket();
  const [ongoing, setOngoing] = useState<any[] | null>(null);
  const [history, setHistory] = useState<any[] | null>(null);
  const [errOngoing, setErrOngoing] = useState(false);
  const [errHistory, setErrHistory] = useState(false);

  const load = useCallback(async () => {
    const [o, h] = await Promise.allSettled([
      Promise.resolve().then(() => api.get('/deliveries/ongoing')),
      Promise.resolve().then(() => api.get('/deliveries/history')),
    ]);
    if (o.status === 'fulfilled') {
      const d = o.value?.data;
      const list = d?.deliveries ?? d;
      setOngoing(Array.isArray(list) ? list : []);
      setErrOngoing(false);
    } else setErrOngoing(true);
    if (h.status === 'fulfilled') {
      const d = h.value?.data;
      setHistory(Array.isArray(d) ? d : []);
      setErrHistory(false);
    } else setErrHistory(true);
  }, []);

  useEffect(() => { load(); }, [load]);
  useAutoRefetch(EVENTS, load);
  // Socket voltou de uma queda (V16): relê uma vez, pelo sinal compartilhado.
  useEffect(() => onReconnect(load), [onReconnect, load]);

  if (errOngoing && errHistory && ongoing === null && history === null) {
    return (
      <EmptyState variant="error" icon={<Clock size={28} aria-hidden="true" />} title="Não carregamos suas entregas" description="Confira a conexão." onRetry={load} />
    );
  }

  const seg: EntregasSeg | null = querySeg
    ?? (ongoing !== null ? (ongoing.length > 0 ? 'andamento' : 'concluidas') : errOngoing ? 'concluidas' : null);
  if (seg === null) {
    return (
      <div role="status" aria-label="Carregando" className={blocks.stack}>
        <Skeleton height={44} />
        <Skeleton height={120} />
      </div>
    );
  }
  const setSeg = (s: string) => router.replace(MOTOBOY_ROUTES.entregas(s as EntregasSeg), undefined, { shallow: true });

  return (
    <div className={styles.stack}>
      <Tabs
        label="Entregas"
        idPrefix="entregas"
        value={seg}
        onChange={setSeg}
        items={[
          { id: 'andamento', label: 'Em andamento', count: ongoing?.length },
          { id: 'concluidas', label: 'Concluídas' },
        ]}
      />
      <div {...tabPanelProps(seg, 'entregas')} className={styles.stack}>
        {seg === 'andamento' ? renderOngoing() : renderHistory()}
      </div>
    </div>
  );

  function renderOngoing() {
    if (ongoing === null) {
      return errOngoing ? (
        <Alert tone="error" title="Não carregamos a corrida em andamento" action={{ label: 'Tentar de novo', onClick: load }}>Confira a conexão.</Alert>
      ) : <Skeleton height={72} />;
    }
    if (ongoing.length === 0) {
      return (
        <EmptyState
          icon={<Package size={28} aria-hidden="true" />}
          title="Nenhuma corrida em andamento"
          description="Fique online na aba Corridas para receber ofertas."
          action={<Button onClick={() => router.push(MOTOBOY_ROUTES.corridas)}>Ir para Corridas</Button>}
        />
      );
    }
    return (
      <ul className={blocks.list}>
        {ongoing.map((d) => {
          const n = Number(d?.distance);
          const kmText = Number.isFinite(n) && n > 0 ? ` · ${n.toFixed(1).replace('.', ',')} km` : '';
          return (
            <NavRow
              key={String(d._id)}
              icon={<Bike size={18} />}
              iconClassName={blocks.icoBrand}
              label={`#${shortOrderCode(d.orderId || d._id)}`}
              sub={`${ongoingStatusView(d.status).label}${kmText}`}
              onClick={() => router.push(MOTOBOY_ROUTES.corrida(String(d._id)))}
            />
          );
        })}
      </ul>
    );
  }

  function renderHistory() {
    if (history === null) {
      return errHistory ? (
        <EmptyState variant="error" icon={<Clock size={28} aria-hidden="true" />} title="Não carregamos o histórico" description="Confira a conexão." onRetry={load} />
      ) : <Skeleton height={160} />;
    }
    if (history.length === 0) {
      return (
        <EmptyState
          icon={<Package size={28} aria-hidden="true" />}
          title="Sua primeira corrida aparece aqui"
          description="Fique online na aba Corridas para receber ofertas."
          action={<Button onClick={() => router.push(MOTOBOY_ROUTES.corridas)}>Ficar online</Button>}
        />
      );
    }
    // O dinheiro só é montado aqui, com a lista já carregada: a janela sai dela (nada de leitura inteira à toa).
    return <ConcluidasList history={history} now={now} onOpen={(id) => router.push(MOTOBOY_ROUTES.entrega(id))} />;
  }
}

/** Concluídas: KPIs do mês, filtros e a lista por dia, com o dinheiro de cada corrida vindo do servidor. */
function ConcluidasList({ history, now, onOpen }: { history: any[]; now: Date; onOpen: (id: string) => void }) {
  const [filter, setFilter] = useState<Filter>('all');
  const since = useMemo(() => oldestCreatedAt(history), [history]);
  const money = useMotoboyMoney({ since });
  useAutoRefetch(EVENTS, money.reload);

  const month = history.filter((d) => inMonth(deliveryDate(d), now));
  const stats = historyStats(month);
  const delivered = filterHistory(month, 'delivered').length;
  const cancelled = filterHistory(month, 'cancelled').length;
  const rated = month.filter((d) => typeof d?.rating === 'number' && d.rating > 0).length;
  const pct = stats.total > 0 ? Math.round((cancelled / stats.total) * 1000) / 10 : 0;
  const groups = groupByDay(filterHistory(history, filter), deliveryDate, now);

  return (
    <>
      {money.status === 'error' && (
        <Alert tone="warning" title="Não carregamos os valores das corridas" action={{ label: 'Tentar de novo', onClick: money.reload }}>
          As corridas aparecem sem valor até carregar.
        </Alert>
      )}
      <section className={styles.kpis3} aria-label="Resumo do mês">
        <div className={blocks.kpi}><small>{monthName(now)}</small><b>{delivered}</b><em>entregas</em></div>
        <div className={blocks.kpi}>
          <small>Nota</small>
          <b>{stats.avgRating != null ? stats.avgRating.toFixed(1).replace('.', ',') : '—'}</b>
          <em>{`${rated} ${rated === 1 ? 'nota' : 'notas'}`}</em>
        </div>
        <div className={blocks.kpi}><small>Cancel.</small><b>{cancelled}</b><em>{pctText(pct)}</em></div>
      </section>
      <div className={blocks.chips}>
        <Chip label="Todas" active={filter === 'all'} onClick={() => setFilter('all')} />
        <Chip label="Entregues" active={filter === 'delivered'} onClick={() => setFilter('delivered')} />
        <Chip label="Canceladas" active={filter === 'cancelled'} onClick={() => setFilter('cancelled')} />
      </div>
      {groups.length === 0 ? (
        <p className={blocks.meta}>Nenhuma corrida com esse filtro.</p>
      ) : groups.map((g) => {
        // moneyOf: null fora da cobertura ou sem modo → sem total (nunca soma parcial)
        const total = sumAll(g.items.map((d) => money.moneyOf(d)?.amount ?? null));
        return (
          <section key={g.key} className={styles.group} aria-label={g.label}>
            <h3 className={blocks.cap}>{total !== null ? `${g.label} · ${formatMoney(total)}` : g.label}</h3>
            <ul className={blocks.list}>
              {g.items.map((d) => (
                <EntregaRow key={String(d._id)} delivery={d} money={money.moneyOf(d)} onOpen={() => onOpen(String(d._id))} />
              ))}
            </ul>
          </section>
        );
      })}
    </>
  );
}

export default EntregasScreen;
