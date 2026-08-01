import { useEffect, useState } from 'react';
import { imageUrl } from '../../lib/config';
import styles from './BannerCarousel.module.css';

export interface PromoBanner {
  _id: string;
  imageUrl: string;
  linkUrl?: string | null;
  title?: string | null;
}

interface BannerCarouselProps {
  banners: PromoBanner[];
  /** Chamado ao tocar num banner que tem link. */
  onSelect?: (linkUrl: string) => void;
  intervalMs?: number;
}

/**
 * Carrossel de avisos da DROP (cupons, promoções, novidades). Cada slide é a
 * imagem de um banner; tocar num banner com link chama `onSelect`. Auto-avança
 * em loop, pausa no toque/hover e respeita `prefers-reduced-motion`. Com 1
 * banner vira card estático; com 0 não renderiza nada (a seção some).
 */
export function BannerCarousel({ banners, onSelect, intervalMs = 5000 }: BannerCarouselProps) {
  const count = banners.length;
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    const mq = typeof window !== 'undefined' && window.matchMedia
      ? window.matchMedia('(prefers-reduced-motion: reduce)')
      : null;
    if (mq) setReduced(mq.matches);
  }, []);

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

  const click = (b: PromoBanner) => {
    if (b.linkUrl) onSelect?.(b.linkUrl);
  };

  return (
    <div
      className={styles.carousel}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div className={styles.viewport}>
        <div className={styles.track} style={{ transform: `translateX(-${safeIndex * 100}%)` }}>
          {banners.map((b) => (
            <button
              key={b._id}
              type="button"
              className={`${styles.slide} ${b.linkUrl ? styles.clickable : ''}`}
              onClick={() => click(b)}
              aria-label={b.title || 'Aviso'}
              tabIndex={b.linkUrl ? 0 : -1}
            >
              <img className={styles.image} src={imageUrl(b.imageUrl)} alt={b.title || ''} />
            </button>
          ))}
        </div>
      </div>

      {count > 1 && (
        <div className={styles.dots} role="tablist" aria-label="Avisos">
          {banners.map((b, i) => (
            <button
              key={b._id}
              type="button"
              role="tab"
              aria-selected={i === safeIndex}
              aria-label={`Ir para aviso ${i + 1}`}
              className={i === safeIndex ? styles.dotActive : styles.dot}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
