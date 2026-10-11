import { OrderTracker } from './OrderTracker';
import { activeOrderView } from '../../lib/activeOrder';
import styles from './ActiveOrdersSection.module.css';

export interface ActiveOrdersSectionProps {
  orders: any[];
  onOpen: (orderId: string) => void;
}

export function ActiveOrdersSection({ orders, onOpen }: ActiveOrdersSectionProps) {
  if (!orders || orders.length === 0) return null;
  return (
    <div className={styles.list}>
      {orders.map((o) => {
        const v = activeOrderView(o);
        const n = (o.products || []).reduce((s: number, p: any) => s + (Number(p.quantity) || 1), 0);
        return (
          <OrderTracker
            key={o._id}
            orderId={String(o._id).slice(-6).toUpperCase()}
            storeName={o.storeName || 'Loja'}
            itemsLabel={n ? `${n} ${n === 1 ? 'item' : 'itens'}` : undefined}
            statusLabel={v.statusLabel}
            progress={v.progress}
            steps={v.steps}
            onClick={() => onOpen(o._id)}
          />
        );
      })}
    </div>
  );
}
