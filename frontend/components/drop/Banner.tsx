import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import styles from './Banner.module.css';

export interface BannerItem {
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  href?: string;
  tone?: 'brand' | 'neutral';
  /** Arte que já traz o texto: sem legenda visível; o título vira aria-label do link e alt da imagem. */
  hideCaption?: boolean;
}

/** Tempo de cada banner na tela antes de passar para o próximo. */
export const BANNER_AUTOPLAY_MS = 5000;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Banner único do DS v2 (avisos da DROP e lojas em destaque). Um por tela,
 * em faixa de rolagem horizontal com snap. Com mais de um item passa sozinho
 * a cada BANNER_AUTOPLAY_MS e, no último, volta ao primeiro. Para enquanto a
 * pessoa toca, arrasta, passa o mouse ou foca um banner, e não passa sozinho
 * em prefers-reduced-motion. Fundo sólido ou imagem, sem gradiente. Cada item
 * com `href` é um único link; sem `href` é só aviso.
 */
export function Banner({ items, label = 'Destaques' }: { items: BannerItem[]; label?: string }) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const multi = items.length > 1;

  useEffect(() => {
    const track = trackRef.current;
    if (!multi || paused || !track || prefersReducedMotion()) return;
    const timer = window.setInterval(() => {
      const slides = Array.from(track.children) as HTMLElement[];
      if (slides.length < 2) return;
      // Banner atual = o mais perto da borda esquerda da faixa (a rolagem pode ter vindo do dedo).
      const pos = track.scrollLeft;
      let current = 0;
      slides.forEach((s, i) => {
        if (Math.abs(s.offsetLeft - slides[0].offsetLeft - pos) < Math.abs(slides[current].offsetLeft - slides[0].offsetLeft - pos)) current = i;
      });
      const next = (current + 1) % slides.length;
      const left = slides[next].offsetLeft - slides[0].offsetLeft;
      if (typeof track.scrollTo === 'function') track.scrollTo({ left, behavior: 'smooth' });
      else track.scrollLeft = left;
    }, BANNER_AUTOPLAY_MS);
    return () => window.clearInterval(timer);
  }, [multi, paused, items.length]);

  if (items.length === 0) return null;

  const pause = () => setPaused(true);
  const resume = () => setPaused(false);

  return (
    <div
      ref={trackRef}
      className={`${styles.track} ${multi ? styles.multi : ''}`}
      role="region"
      aria-label={label}
      // Só mouse de verdade: no celular o navegador simula "mouse em cima" depois do toque e travaria a faixa.
      onPointerEnter={(e) => { if (e.pointerType === 'mouse') pause(); }}
      onPointerLeave={(e) => { if (e.pointerType === 'mouse') resume(); }}
      onTouchStart={pause}
      onTouchEnd={resume}
      onTouchCancel={resume}
      onFocus={pause}
      onBlur={resume}
    >
      {items.map((it) => {
        const external = !!it.href && /^https?:\/\//i.test(it.href);
        const tone = it.tone === 'neutral' ? styles.neutral : styles.brand;
        const cls = `${styles.item} ${tone} ${it.imageUrl ? styles.hasImage : ''}`;
        const content = (
          <>
            {it.imageUrl && <img className={styles.image} src={it.imageUrl} alt={it.hideCaption ? it.title : ''} draggable={false} />}
            {!it.hideCaption && (it.title || it.subtitle) && (
              <span className={styles.caption}>
                {it.title && <span className={styles.title}>{it.title}</span>}
                {it.subtitle && <span className={styles.subtitle}>{it.subtitle}</span>}
              </span>
            )}
          </>
        );
        if (!it.href) {
          return (
            <div key={it.id} className={cls}>
              {content}
            </div>
          );
        }
        return external ? (
          <a key={it.id} className={cls} href={it.href} target="_blank" rel="noopener noreferrer" aria-label={it.title || 'Aviso'}>
            {content}
          </a>
        ) : (
          <Link key={it.id} href={it.href} className={cls} aria-label={it.title || 'Aviso'}>
            {content}
          </Link>
        );
      })}
    </div>
  );
}
