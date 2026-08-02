import { StoreCard } from './StoreCard';
import { useCarousel } from './useCarousel';
import styles from './PremiumCarousel.module.css';

export interface CarouselItem {
  id: string;
  store: any; // já mapeado por mapStore
}

interface PremiumCarouselProps {
  items: CarouselItem[];
  onSelect: (id: string) => void;
  /** Intervalo do auto-avanço (ms). */
  intervalMs?: number;
}

/**
 * Carrossel dos banners das lojas premium (Plano 3). Cada slide é um
 * `StoreCard destaque`. Auto-avança em loop, **arrasta pro lado** (swipe),
 * pausa no toque/hover e respeita `prefers-reduced-motion`. Com 1 item vira
 * card estático; com 0 não renderiza nada.
 */
export function PremiumCarousel({ items, onSelect, intervalMs = 4000 }: PremiumCarouselProps) {
  const count = items.length;
  const { index, setIndex, viewportRef, trackStyle, pointerHandlers, movedRef } = useCarousel(count, intervalMs);

  if (count === 0) return null;

  return (
    <div className={styles.carousel}>
      <div className={styles.viewport} ref={viewportRef} {...pointerHandlers}>
        <div className={styles.track} style={trackStyle}>
          {items.map((it) => (
            <div key={it.id} className={styles.slide}>
              <StoreCard
                variant="destaque"
                store={it.store}
                onClick={() => { if (!movedRef.current) onSelect(it.id); }}
              />
            </div>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className={styles.dots} role="tablist" aria-label="Lojas em destaque">
          {items.map((it, i) => (
            <button
              key={it.id}
              type="button"
              role="tab"
              aria-selected={i === index}
              aria-label={`Ir para destaque ${i + 1}`}
              className={i === index ? styles.dotActive : styles.dot}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
