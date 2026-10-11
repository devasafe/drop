import { useCallback, useMemo, useState } from 'react';
import { useRouter } from 'next/router';
import { Package } from 'lucide-react';
import ProtectedRoute from '../components/ProtectedRoute';
import { useOrders } from '../hooks/useSync';
import { useAutoRefetch } from '../hooks/useAutoRefetch';
import { useReorderFlow } from '../hooks/useReorderFlow';
import { Tabs, tabPanelProps } from '../components/ui/Tabs';
import { List } from '../components/ui/List';
import { Button } from '../components/ui/Button';
import { EmptyState } from '../components/ui/EmptyState';
import { Skeleton } from '../components/ui/Skeleton';
import { OrderRow, type OrderRowData } from '../components/drop/OrderRow';
import { ReorderConfirmSheet } from '../components/drop/ReorderConfirmSheet';
import { isActiveOrder } from '../lib/activeOrder';
import { groupOrdersByMonth } from '../lib/orderGroups';
import { ROUTES, pedidoHref } from '../lib/routes';
import styles from './Pedidos.module.css';

function itemsSummary(products: any[]): string {
  if (!Array.isArray(products) || products.length === 0) return '';
  const qty = products.reduce((s, p) => s + (Number(p.quantity) || 1), 0);
  const names = products.slice(0, 2).map((p: any) => p.productName || p.name || 'Produto');
  return `${qty} ${qty === 1 ? 'item' : 'itens'} · ${names.join(', ')}${products.length > 2 ? '…' : ''}`;
}
const toRow = (o: any): OrderRowData => ({
  _id: String(o._id), code: String(o._id).slice(-6).toUpperCase(), storeName: o.storeName || o.storeObj?.name || 'Loja',
  status: o.status, paymentStatus: o.paymentStatus, total: Number(o.totalValue) || 0, itemsLabel: itemsSummary(o.products),
  createdAt: o.createdAt, paymentMethod: o.paymentMethod, installmentCount: o.installmentCount,
});
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
  const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

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
                  <List>{active.map((o: any) => (
                    <OrderRow key={o._id} order={toRow(o)} onClick={() => open(o._id)}
                      action={<Button size="sm" variant="secondary" onClick={stop(() => open(o._id))}>Acompanhar</Button>} />
                  ))}</List>
                )
              ) : (
                groupOrdersByMonth(history).map((g) => (
                  <section key={g.key} className={styles.month} aria-label={g.label}>
                    <h2 className={styles.monthTitle}>{g.label}</h2>
                    <List>{g.orders.map((o: any) => (
                      <OrderRow key={o._id} order={toRow(o)} showDate onClick={() => open(o._id)}
                        action={o.status === 'entregue' && o.storeId ? (
                          <Button size="sm" variant="secondary" loading={reorderFlow.busy}
                            onClick={stop(() => reorderFlow.start({ _id: o._id, storeId: o.storeId, storeName: o.storeName }))}>De novo</Button>
                        ) : undefined} />
                    ))}</List>
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
