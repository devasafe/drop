import { KeyboardEvent } from 'react';
import { Store as StoreIcon } from 'lucide-react';
import { StatusPill, StoreStatus } from '../ui/StatusPill';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import { formatMoney } from '../../lib/money';
import { formatEtaRange } from '../../lib/deliveryView';
import styles from './StoreCard.module.css';

export interface StoreCardData {
  name: string;
  imageUrl?: string;
  status: StoreStatus;
  category: string;
  /** Prazo, frete e área são opcionais: sem dado, o pedaço não é renderizado
   * (nunca um valor inventado). Vêm da cotação de entrega. */
  etaMin?: [number, number];
  fee?: number;
  freeDelivery?: boolean;
  outOfArea?: boolean;
  opensAt?: string;
  distanceKm?: number;
}

export interface StoreCardProps {
  variant: 'destaque' | 'resultado';
  store: StoreCardData;
  onClick: () => void;
}

type LineTone = 'fast' | 'off' | 'muted' | 'normal';

function deliveryLineOf(store: StoreCardData): { text: string; tone: LineTone } | null {
  if (store.outOfArea) return { text: 'Não entrega aqui', tone: 'off' };
  if (store.status === 'fechada') {
    return { text: store.opensAt ? `Loja fechada · abre às ${store.opensAt}` : 'Loja fechada', tone: 'muted' };
  }
  const eta = formatEtaRange(store.etaMin);
  if (!eta) return null;
  const tail = store.freeDelivery ? 'Frete grátis' : store.fee !== undefined ? formatMoney(store.fee) : '';
  return { text: tail ? `${eta} · ${tail}` : eta, tone: store.freeDelivery ? 'fast' : 'normal' };
}

/**
 * Loja no feed/busca. `destaque` = imagem em cima e texto embaixo (sem
 * gradiente nem overlay). `resultado` = LINHA com divisor, sem caixa: nome,
 * categoria, linha de entrega e StatusPill à direita.
 */
export function StoreCard({ variant, store, onClick }: StoreCardProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  const line = deliveryLineOf(store);
  const lineEl = line && (
    <div className={[styles.delivery, line.tone !== 'normal' ? styles[line.tone] : ''].join(' ').trim()}>{line.text}</div>
  );
  const interactiveProps = {
    role: 'button' as const,
    tabIndex: 0,
    onClick,
    onKeyDown: handleKeyDown,
  };

  if (variant === 'destaque') {
    return (
      <div className={styles.card} {...interactiveProps}>
        <span
          className={styles.image}
          style={store.imageUrl ? { backgroundImage: `url(${store.imageUrl})` } : undefined}
          aria-hidden="true"
        >
          {!store.imageUrl && <StoreIcon size={28} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
        </span>
        <div className={styles.info}>
          <div>
            <div className={styles.name}>{store.name}</div>
            {lineEl}
          </div>
          <StatusPill status={store.status} />
        </div>
      </div>
    );
  }

  return (
    <div className={styles.row} {...interactiveProps}>
      <span
        className={styles.photo}
        style={store.imageUrl ? { backgroundImage: `url(${store.imageUrl})` } : undefined}
        aria-hidden="true"
      >
        {!store.imageUrl && <StoreIcon size={22} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
      </span>
      <div className={styles.meta}>
        <div className={styles.rowName}>{store.name}</div>
        <div className={styles.category}>{store.category}</div>
        {lineEl}
      </div>
      <div className={styles.right}>
        <StatusPill status={store.status} />
      </div>
    </div>
  );
}
