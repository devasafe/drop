import { Button } from '../ui/Button';
import { Badge } from '../ui/Badge';
import { PriceTag } from '../ui/PriceTag';
import styles from './PromoHero.module.css';

export interface PromoHeroProps {
  tag?: string;
  title: string;
  subtitle?: string;
  price?: number;
  oldPrice?: number;
  discountPercent?: number;
  imageUrl?: string;
  onCta: () => void;
  ctaLabel: string;
}

/**
 * Hero de promoção — o gradiente roxo (`--brand-grad`) grande de destaque
 * da home, ao lado de `FreteBanner`/`OrderTracker`. Preço em `PriceTag`
 * (sempre branco, nunca roxo — Regra D), desconto em selo circular
 * (`Badge` tone `seal`), CTA via `Button` `onImage`. Sem `imageUrl`, a
 * mídia cai para `--surface-2` em vez de quebrar.
 */
export function PromoHero({
  tag,
  title,
  subtitle,
  price,
  oldPrice,
  discountPercent,
  imageUrl,
  onCta,
  ctaLabel,
}: PromoHeroProps) {
  return (
    <div className={styles.hero}>
      <div className={styles.content}>
        {tag && <span className={styles.tag}>{tag}</span>}
        <h2 className={styles.title}>{title}</h2>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {price !== undefined && (
          <PriceTag price={price} oldPrice={oldPrice} size="sm" />
        )}
        <Button variant="onImage" size="sm" onClick={onCta} className={styles.cta}>
          {ctaLabel}
        </Button>
      </div>

      <div className={styles.media}>
        <span
          className={styles.image}
          style={imageUrl ? { backgroundImage: `url(${imageUrl})` } : undefined}
          aria-hidden="true"
        />
        {discountPercent !== undefined && (
          <span className={styles.seal}>
            <Badge tone="seal">
              <span>{discountPercent}%</span>
              <span>OFF</span>
            </Badge>
          </span>
        )}
      </div>
    </div>
  );
}
