import { ChevronRight, Package } from 'lucide-react';
import { StatusPill } from '../ui/StatusPill';
import { PriceTag } from '../ui/PriceTag';
import { orderStatusPill } from '../../lib/orderStatus';
import { paymentMethodLabel } from '../../lib/paymentLabel';
import styles from './OrderCard.module.css';

export interface OrderCardData {
  id: string;
  /** Código curto do pedido (ex.: "A1B2C3D4"). */
  code?: string;
  storeName: string;
  /** Status cru do pedido (mapeado p/ StatusPill internamente). */
  status: string;
  total: number;
  /** Resumo dos itens, ex.: "2 itens · Pizza, Refri". */
  itemsLabel?: string;
  imageUrl?: string;
  /** Data legível (usada no histórico). */
  date?: string;
  /** Forma de pagamento + parcelas — pra distinguir na lista um pedido no
   *  cartão 3x de um à vista/PIX. */
  paymentMethod?: string | null;
  installmentCount?: number | null;
}

interface OrderCardProps {
  order: OrderCardData;
  onClick?: () => void;
}

/**
 * Card de pedido nas listas do cliente (Em andamento / Histórico). Miniatura
 * do 1º item, nome da loja + StatusPill, resumo dos itens, total e data.
 * Clicável leva ao detalhe do pedido.
 */
export function OrderCard({ order, onClick }: OrderCardProps) {
  const sub = [order.code ? `#${order.code}` : null, order.itemsLabel].filter(Boolean).join(' · ');
  const installments = order.installmentCount && order.installmentCount > 1 ? order.installmentCount : null;
  const payLabel = order.paymentMethod
    ? paymentMethodLabel(order.paymentMethod) + (installments ? ` · ${installments}x` : '')
    : null;
  const Wrapper: any = onClick ? 'button' : 'div';

  return (
    <Wrapper {...(onClick ? { type: 'button', onClick } : {})} className={styles.row}>
      <div className={styles.body}>
        <span
          className={styles.media}
          style={order.imageUrl ? { backgroundImage: `url(${order.imageUrl})` } : undefined}
          aria-hidden="true"
        >
          {!order.imageUrl && <Package size={20} aria-hidden="true" />}
        </span>

        <div className={styles.info}>
          <div className={styles.top}>
            <span className={styles.store}>{order.storeName}</span>
            <StatusPill status={orderStatusPill(order.status)} />
          </div>
          {sub && <div className={styles.sub}>{sub}</div>}
          {payLabel && <div className={styles.sub}>{payLabel}</div>}
          <div className={styles.foot}>
            <PriceTag price={order.total} size="sm" />
            {order.date && <span className={styles.date}>{order.date}</span>}
          </div>
        </div>

        {onClick && <ChevronRight size={18} className={styles.chevron} aria-hidden="true" />}
      </div>
    </Wrapper>
  );
}
