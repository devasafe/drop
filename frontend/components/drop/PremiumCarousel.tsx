import { useEffect, useState } from 'react';
import { StoreCard } from './StoreCard';
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
 * `StoreCard destaque`. Auto-avança em loop, mas pausa no toque/hover e
 * respeita `prefers-reduced-motion` (não auto-rola). Com 1 item vira card
 * estático; com 0 não renderiza nada.
 */
export function PremiumCarousel({ items, onSelect, intervalMs = 4000 }: PremiumCarouselProps) {
  const count = items.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    if (mq) setReduced(mq.matches);
  }, []);

  // Se a lista encolher, não deixa o índice apontar pra fora.
  useEffect(() => {
    if (index >= count && count > 0) setIndex(0);
  }, [count, index]);

  const auto = count > 1 && !paused && !reduced;
  useEffect(() => {
    if (!auto) return;
    const t = setInterval(() => setIndex((i) => (i + 1) % count), intervalMs);
    return () => clearInterval(t);
  }, [auto, count, intervalMs]);

  if (count === 0) return null;
  const safeIndex = index % count;

  return (
    <div
      className={styles.carousel}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div className={styles.viewport}>
        <div className={styles.track} style={{ transform: `translateX(-${safeIndex * 100}%)` }}>
          {items.map((it) => (
            <div key={it.id} className={styles.slide}>
              <StoreCard variant="destaque" store={it.store} onClick={() => onSelect(it.id)} />
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
              aria-selected={i === safeIndex}
              aria-label={`Ir para destaque ${i + 1}`}
              className={i === safeIndex ? styles.dotActive : styles.dot}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
