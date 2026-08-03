import { OrderTracker } from './OrderTracker';
import { activeOrderView } from '../../lib/activeOrder';
import { imageUrl } from '../../lib/config';
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
        return (
          <OrderTracker
            key={o._id}
            orderId={String(o._id).slice(-6).toUpperCase()}
            storeName={o.storeName || 'Loja'}
            imageUrl={imageUrl(o.products?.[0]?.image) || undefined}
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
