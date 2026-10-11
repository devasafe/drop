import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Package, Repeat } from 'lucide-react';
import ProtectedRoute from '../components/ProtectedRoute';
import { useOrders } from '../hooks/useSync';
import { useAutoRefetch } from '../hooks/useAutoRefetch';
import { useReorderFlow } from '../hooks/useReorderFlow';
import { Tabs, tabPanelProps } from '../components/ui/Tabs';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { OrderHistoryRow } from '../components/drop/OrderHistoryRow';
import { OrderTracker } from '../components/drop/OrderTracker';
import { OrderStatusBadge } from '../components/drop/OrderStatusBadge';
import { ReorderConfirmSheet } from '../components/drop/ReorderConfirmSheet';
import { isActiveOrder, activeOrderView } from '../lib/activeOrder';
import { imageUrl } from '../lib/config';
import { groupOrdersByMonth } from '../lib/orderGroups';
import { ROUTES, pedidoHref } from '../lib/routes';
import styles from './Pedidos.module.css';

const EVENTS = ['order:created', 'order:updated', 'order:status_changed', 'order:cancelled', 'order:accepted_by_store', 'order:rejected_by_store',
  'delivery:assigned', 'delivery:picked', 'delivery:completed', 'delivery:cancelled'];

export default function PedidosPage() {
  const router = useRouter();
  const { orders, loading, refetch } = useOrders();
  useAutoRefetch(EVENTS, useCallback(() => refetch(), [refetch]));
  const reorderFlow = useReorderFlow();
  const [tab, setTab] = useState(router.query.tab === 'historico' ? 'historico' : 'andamento');
  const active = useMemo(() => orders.filter((o: any) => isActiveOrder(o.status)), [orders]);
  const history = useMemo(() => orders.filter((o: any) => !isActiveOrder(o.status)), [orders]);
  const open = (id: string) => router.push(pedidoHref(id));

  return (
    <ProtectedRoute required_role="cliente">
      <main className={styles.page}>
        <h1 className={styles.title}>Pedidos</h1>
        {loading ? (
          <div className={styles.list}><Skeleton height={88} /><Skeleton height={88} /></div>
        ) : orders.length === 0 ? (
          <EmptyState icon={<Package />} title="Seus pedidos aparecem aqui" description="Quando você comprar, acompanha tudo por aqui."
            action={<Button onClick={() => router.push(ROUTES.inicio)}>Explorar lojas</Button>} />
        ) : (
          <>
            <Tabs label="Pedidos" idPrefix="pedidos" value={tab} onChange={setTab}
              items={[{ id: 'andamento', label: 'Em andamento', count: active.length }, { id: 'historico', label: 'Histórico', count: history.length }]} />
            <div {...tabPanelProps(tab, 'pedidos')} className={styles.panel}>
              {tab === 'andamento' ? (
                active.length === 0 ? (
                  <EmptyState icon={<Package />} title="Nenhum pedido em andamento" description="Seus pedidos ativos aparecem aqui."
                    action={<Button variant="secondary" onClick={() => router.push(ROUTES.inicio)}>Explorar lojas</Button>} />
                ) : (
                  <div className={styles.list}>{active.map((o: any) => {
                    const v = activeOrderView(o);
                    return (
                      <div className={styles.activeCard} key={o._id}>
                        <OrderTracker orderId={String(o._id).slice(-6).toUpperCase()} storeName={o.storeName || 'Loja'}
                          statusLabel={v.statusLabel} progress={v.progress} steps={v.steps} />
                        <Button size="sm" variant="tertiary" onClick={() => open(o._id)}>Acompanhar</Button>
                      </div>
                    );
                  })}</div>
                )
              ) : (
                groupOrdersByMonth(history).map((g) => (
                  <section key={g.key} className={styles.month} aria-label={g.label}>
                    <h2 className={styles.monthTitle}>{g.label}</h2>
                    <div>{g.orders.map((o: any) => (
                      <OrderHistoryRow key={o._id} order={o} imageUrl={imageUrl(o.products?.[0]?.image) || undefined} onOpen={() => open(o._id)}
                        action={o.status === 'entregue' && o.storeId ? (
                          <Button size="sm" variant="secondary" leftIcon={<Repeat size={16} aria-hidden="true" />} loading={reorderFlow.busy}
                            onClick={() => reorderFlow.start({ _id: o._id, storeId: o.storeId, storeName: o.storeName })}>De novo</Button>
                        ) : ['cancelado', 'rejeitado'].includes(o.status) ? <OrderStatusBadge status="cancelled" /> : undefined} />
                    ))}</div>
                  </section>
                ))
              )}
            </div>
          </>
        )}
        <ReorderConfirmSheet {...reorderFlow.confirm} />
      </main>
    </ProtectedRoute>
  );
}
