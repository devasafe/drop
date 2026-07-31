import { KeyboardEvent } from 'react';
import { Star, Clock, Store as StoreIcon } from 'lucide-react';
import { StatusPill, StoreStatus } from '../ui/StatusPill';
import { PriceTag, formatBRL } from '../ui/PriceTag';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import styles from './StoreCard.module.css';

export interface StoreCardData {
  name: string;
  imageUrl?: string;
  status: StoreStatus;
  category: string;
  /** Nota, tempo estimado e taxa de entrega são opcionais — o backend hoje
   * não calcula nenhum dos três por loja. Quando ausentes, o pedaço
   * correspondente simplesmente não é renderizado (nunca um valor inventado). */
  rating?: number;
  etaMin?: [number, number];
  fee?: number;
}

export interface StoreCardProps {
  variant: 'destaque' | 'resultado';
  store: StoreCardData;
  onClick: () => void;
}

function formatRating(rating: number): string {
  return rating.toFixed(1).replace('.', ',');
}

/**
 * Loja no feed/busca. `destaque` = imagem grande com overlay gradiente
 * (replica `.feat` do mock canônico) — a ÚNICA variante que é card de
 * imagem real. `resultado` = LINHA com divisor (`.lrow`), de-cardificação
 * (spec §3.1-A): lista de lojas é lista de linhas, não grade de cards com
 * borda — daí `styles.row`, nunca `styles.card`, nesse caminho.
 */
export function StoreCard({ variant, store, onClick }: StoreCardProps) {
  const handleKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick();
    }
  };

  const eta = store.etaMin ? `${store.etaMin[0]}-${store.etaMin[1]} min` : undefined;
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
          {!store.imageUrl && (
            <StoreIcon size={28} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
          )}
        </span>
        <span className={styles.gradient} aria-hidden="true" />
        <span className={styles.statusWrap}>
          <StatusPill status={store.status} />
        </span>
        <div className={styles.info}>
          <div className={styles.name}>{store.name}</div>
          {(store.rating !== undefined || eta || store.fee !== undefined) && (
            <div className={styles.stats}>
              {store.rating !== undefined && (
                <span className={styles.stat}>
                  <Star
                    size={13}
                    strokeWidth={ICON_STROKE_WIDTH}
                    className={styles.starIcon}
                    fill="currentColor"
                    aria-hidden="true"
                  />
                  {formatRating(store.rating)}
                </span>
              )}
              {eta && (
                <span className={styles.stat}>
                  <Clock size={13} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
                  {eta}
                </span>
              )}
              {store.fee !== undefined && (
                <span className={styles.stat}>Frete {formatBRL(store.fee)}</span>
              )}
            </div>
          )}
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
        {!store.imageUrl && (
          <StoreIcon size={22} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
        )}
      </span>
      <div className={styles.meta}>
        <div className={styles.rowName}>{store.name}</div>
        <div className={styles.category}>{store.category}</div>
        {(store.rating !== undefined || eta) && (
          <div className={styles.rowStats}>
            {store.rating !== undefined && (
              <span className={styles.stat}>
                <Star
                  size={13}
                  strokeWidth={ICON_STROKE_WIDTH}
                  className={styles.starIcon}
                  fill="currentColor"
                  aria-hidden="true"
                />
                {formatRating(store.rating)}
              </span>
            )}
            {eta && (
              <span className={styles.stat}>
                <Clock size={13} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
                {eta}
              </span>
            )}
          </div>
        )}
      </div>
      <div className={styles.right}>
        <StatusPill status={store.status} />
        {store.fee !== undefined && <PriceTag price={store.fee} size="sm" />}
      </div>
    </div>
  );
}
