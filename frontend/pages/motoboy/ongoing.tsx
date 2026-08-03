import { useState } from 'react';
import { useRouter } from 'next/router';
import { Package, Clock } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Button } from '../../components/ui/Button';
import { formatBRL } from '../../components/ui/PriceTag';
import { ICON_STROKE_WIDTH } from '../../components/ui/Icon';
import useRequireAuth from '../../hooks/useRequireAuth';
import { useOngoingDeliveries, useDeliveryHistory } from '../../hooks/useSync';
import { useAutoRefetch } from '../../hooks/useAutoRefetch';
import { OngoingDeliveryCard } from '../../components/motoboy/OngoingDeliveryCard';
import { HistoryDeliveryCard } from '../../components/motoboy/HistoryDeliveryCard';
import { historyStats, filterHistory } from '../../lib/deliveryStatus';
import styles from './MotoboyDeliveries.module.css';

type Tab = 'ongoing' | 'history';
type HistFilter = 'all' | 'delivered' | 'cancelled';

/**
 * Entregas do motoboy — duas abas (Em andamento / Histórico), deep-linkáveis
 * por `?tab=`. Migração da antiga /motoboy/ongoing + /motoboy/history para o DS.
 */
export default function MotoboyDeliveries() {
  useRequireAuth(['motoboy']);
  const router = useRouter();
  const tab: Tab = router.query.tab === 'history' ? 'history' : 'ongoing';
  const setTab = (t: Tab) =>
    router.replace(
      { pathname: '/motoboy/ongoing', query: t === 'history' ? { tab: 'history' } : {} },
      undefined,
      { shallow: true }
    );

  const { deliveries: ongoing, loading: ongoingLoading, refetch } = useOngoingDeliveries();
  const { deliveries: history, loading: historyLoading } = useDeliveryHistory();
  const [filter, setFilter] = useState<HistFilter>('all');

  useAutoRefetch(
    ['delivery:assigned_to_you', 'delivery:updated', 'delivery:picked', 'delivery:completed', 'delivery:cancelled', 'delivery:return_confirmed'],
    refetch
  );

  const stats = historyStats(history);
  const filtered = filterHistory(history, filter);
  const openDetail = (id: string) => router.push(`/motoboy/delivery/${id}`);

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>Entregas</h1>

          <div className={styles.tabs} role="tablist" aria-label="Entregas">
            <Chip label="Em andamento" active={tab === 'ongoing'} onClick={() => setTab('ongoing')} />
            <Chip label="Histórico" active={tab === 'history'} onClick={() => setTab('history')} />
          </div>

          {tab === 'ongoing' ? (
            ongoingLoading ? (
              <div className={styles.list}><Skeleton height={140} /><Skeleton height={140} /></div>
            ) : ongoing.length === 0 ? (
              <EmptyState
                icon={<Package size={22} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
                title="Nenhuma entrega em andamento"
                description="Você não tem entregas ativas agora. Vá ao painel para aceitar novas corridas."
                action={<Button onClick={() => router.push('/motoboy')}>Voltar ao painel</Button>}
              />
            ) : (
              <div className={styles.list}>
                {ongoing.map((d: any) => (
                  <OngoingDeliveryCard key={d._id} delivery={d} onDetails={() => openDetail(d._id)} />
                ))}
              </div>
            )
          ) : (
            <>
              <div className={styles.kpis}>
                <div className={styles.kpi}>
                  <div className={styles.kpiValue}>{stats.total}</div>
                  <div className={styles.kpiLabel}>Entregas</div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.kpiValue}>{formatBRL(stats.earnings)}</div>
                  <div className={styles.kpiLabel}>Ganhos</div>
                </div>
                <div className={styles.kpi}>
                  <div className={styles.kpiValue}>{stats.avgRating != null ? `${stats.avgRating.toFixed(1)} ★` : '—'}</div>
                  <div className={styles.kpiLabel}>Avaliação</div>
                </div>
              </div>

              <div className={styles.filters}>
                <Chip label="Todas" active={filter === 'all'} onClick={() => setFilter('all')} />
                <Chip label="Entregues" active={filter === 'delivered'} onClick={() => setFilter('delivered')} />
                <Chip label="Canceladas" active={filter === 'cancelled'} onClick={() => setFilter('cancelled')} />
              </div>

              {historyLoading ? (
                <div className={styles.list}><Skeleton height={110} /><Skeleton height={110} /></div>
              ) : filtered.length === 0 ? (
                <EmptyState
                  icon={<Clock size={22} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
                  title="Nada por aqui"
                  description="Nenhuma entrega no histórico com esse filtro."
                />
              ) : (
                <div className={styles.list}>
                  {filtered.map((d: any) => (
                    <HistoryDeliveryCard key={d._id} delivery={d} onDetails={() => openDetail(d._id)} />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
