import { OrderTracker, type OrderTrackerStep } from '../OrderTracker';
import styles from './OrderTimeline.module.css';

export interface OrderTimelineProps {
  orderId: string;
  storeName: string;
  statusLabel?: string;
  progress: number;
  steps: OrderTrackerStep[];
}

/**
 * Wrapper fino do `OrderTracker` do DS pra tela de acompanhamento de pedido —
 * só repassa as props, sem lógica própria. `OrderTracker` já traz o visual
 * completo (painel roxo, barra de progresso, steps).
 */
export function OrderTimeline({ orderId, storeName, statusLabel, progress, steps }: OrderTimelineProps) {
  return (
    <div className={styles.wrap}>
      <OrderTracker
        orderId={orderId}
        storeName={storeName}
        statusLabel={statusLabel}
        progress={progress}
        steps={steps}
      />
    </div>
  );
}
