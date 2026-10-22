import Link from 'next/link';
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

/**
 * Banner único do DS v2 (avisos da DROP e lojas em destaque). Um por tela,
 * em faixa de rolagem horizontal com snap; sem autoplay (respeita
 * prefers-reduced-motion por construção). Fundo sólido ou imagem, sem
 * gradiente. Cada item com `href` é um único link; sem `href` é só aviso.
 */
export function Banner({ items, label = 'Destaques' }: { items: BannerItem[]; label?: string }) {
  if (items.length === 0) return null;
  const multi = items.length > 1;

  return (
    <div className={`${styles.track} ${multi ? styles.multi : ''}`} role="region" aria-label={label}>
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
