import Icon from '../Icon';
import {
  countByBucket, pickActiveOrder, todayStats, isStoreOpen,
} from '../../lib/sellerOverview';
import styles from './OverviewTab.module.css';

interface OverviewTabProps {
  store: any;
  orders: any[];
  history: any[];
  metrics: { totalSales: number; delivered: number; ongoing: number; revenue: number } | null;
  returnRequests: any[];
  onGoToTab: (tab: string) => void;
  onToggleOpen: (nextIsOpen: boolean) => void;
  onQuickAction: (href: string) => void;
}

const BRL = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const shortId = (id: string) => (id || '').toString().slice(0, 8).toUpperCase();

export default function OverviewTab({
  store, orders, history, metrics, returnRequests, onGoToTab, onToggleOpen, onQuickAction,
}: OverviewTabProps) {
  const open = isStoreOpen(store);
  const counts = countByBucket(orders);
  const active = pickActiveOrder(orders);
  const { pedidosHoje, faturamentoHoje } = todayStats(orders, history);
  const returns = (returnRequests || []).length;

  const counter = (label: string, num: number, tab: string) => (
    <button type="button" className={styles.counter} onClick={() => onGoToTab(tab)}>
      <span className={styles.counterNum}>{num}</span>
      <span className={styles.counterLabel}>{label}</span>
    </button>
  );

  return (
    <div className={styles.wrap}>
      {/* 1. Status */}
      <div className={styles.statusRow}>
        <span className={styles.storeName}>{store?.name || 'Minha loja'}</span>
        <span data-testid="status-pill" className={`${styles.pill} ${open ? styles.pillOpen : styles.pillClosed}`}>
          <Icon name={open ? 'check-circle' : 'x-circle'} size={12} /> {open ? 'Aberta' : 'Fechada'}
        </span>
        {store?.plan ? <span className={styles.planBadge}>Plano {store.plan}</span> : null}
        <button data-testid="toggle-open" type="button" className={styles.toggle} onClick={() => onToggleOpen(!open)}>
          {open ? 'Fechar loja' : 'Abrir loja'}
        </button>
      </div>

      {/* 2. Contadores */}
      <div className={styles.counters}>
        {counter('Novos', counts.novos, 'orders')}
        {counter('Em preparo', counts.emPreparo, 'orders')}
        {counter('A caminho', counts.aCaminho, 'orders')}
        {returns > 0 && counter('Devoluções', returns, 'returns')}
      </div>

      {/* 3. Pedido ativo */}
      {active ? (
        <div data-testid="active-order" className={styles.card}>
          <div className={styles.cardHead}>
            <span className={styles.cardTitle}>Pedido ativo · #{shortId(active._id)}</span>
            <button data-testid="active-order-action" type="button" className={styles.cardAction} onClick={() => onGoToTab('orders')}>
              Ver pedido
            </button>
          </div>
          <div className={styles.cardCustomer}>{active.customerName || 'Cliente'}</div>
          <div className={styles.cardMeta}>
            {(active.products?.length || 0)} {(active.products?.length === 1) ? 'item' : 'itens'} · {BRL(active.totalValue || 0)} · {active.status}
          </div>
        </div>
      ) : (
        <div className={styles.empty}>Nenhum pedido ativo agora.</div>
      )}

      {/* 4. KPIs */}
      <div className={styles.kpis}>
        <div className={styles.kpi}><div className={styles.kpiNum}>{pedidosHoje}</div><div className={styles.kpiLabel}>Pedidos hoje</div></div>
        <div className={styles.kpi}><div className={styles.kpiNum}>{BRL(faturamentoHoje)}</div><div className={styles.kpiLabel}>Faturamento hoje</div></div>
        <div className={styles.kpi}><div className={styles.kpiNum}>{metrics?.ongoing ?? 0}</div><div className={styles.kpiLabel}>Em andamento</div></div>
        <div className={styles.kpi}><div className={styles.kpiNum}>{metrics?.delivered ?? 0}</div><div className={styles.kpiLabel}>Entregues</div></div>
        {typeof store?.rating === 'number' && (
          <div className={styles.kpi}><div className={styles.kpiNum}>{store.rating}★</div><div className={styles.kpiLabel}>Avaliação</div></div>
        )}
      </div>

      {/* 5. Atalhos */}
      <div className={styles.actions}>
        <button type="button" className={styles.actionBtn} onClick={() => onQuickAction('/seller/create-product')}><Icon name="plus" size={14} /> Adicionar produto</button>
        <button type="button" className={styles.actionBtn} onClick={() => onGoToTab('orders')}><Icon name="clipboard" size={14} /> Ver pedidos</button>
        <button type="button" className={styles.actionBtn} onClick={() => onQuickAction('/seller/coupons')}><Icon name="tag" size={14} /> Marketing</button>
        <button type="button" className={styles.actionBtn} onClick={() => onQuickAction('/seller/wallet')}><Icon name="wallet" size={14} /> Financeiro</button>
      </div>
    </div>
  );
}
