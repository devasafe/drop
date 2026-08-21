import { imageUrl } from '../../lib/config';
import { useCarousel } from './useCarousel';
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
 * imagem de um banner; tocar num banner com link chama `onSelect`. Auto-avança,
 * **arrasta pro lado** (swipe), pausa no toque/hover e respeita
 * `prefers-reduced-motion`. Com 1 banner vira card estático; com 0 não renderiza
 * nada (a seção some).
 */
export function BannerCarousel({ banners, onSelect, intervalMs = 5000 }: BannerCarouselProps) {
  const count = banners.length;
  const { index, setIndex, viewportRef, trackStyle, pointerHandlers, movedRef } = useCarousel(count, intervalMs);

  if (count === 0) return null;

  const click = (b: PromoBanner) => {
    if (movedRef.current) return; // foi arrasto, não clique
    if (b.linkUrl) onSelect?.(b.linkUrl);
  };

  return (
    <div className={styles.carousel}>
      <div className={styles.viewport} ref={viewportRef} {...pointerHandlers}>
        <div className={styles.track} style={trackStyle}>
          {banners.map((b) => (
            <button
              key={b._id}
              type="button"
              className={`${styles.slide} ${b.linkUrl ? styles.clickable : ''}`}
              onClick={() => click(b)}
              aria-label={b.title || 'Aviso'}
              tabIndex={b.linkUrl ? 0 : -1}
            >
              <img className={styles.image} src={imageUrl(b.imageUrl, { w: 1600 })} alt={b.title || ''} draggable={false} />
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
              aria-selected={i === index}
              aria-label={`Ir para aviso ${i + 1}`}
              className={i === index ? styles.dotActive : styles.dot}
              onClick={() => setIndex(i)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
