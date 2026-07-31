import { Bike, ArrowRight } from 'lucide-react';
import { Button } from '../ui/Button';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import styles from './FreteBanner.module.css';

export interface FreteBannerProps {
  title: string;
  ctaLabel: string;
  onCta: () => void;
}

/**
 * Banner de frete grátis. Replica `.promo` do mock canônico: gradiente
 * roxo (`--brand-grad`), CTA via `Button` (`onImage`, sobre a superfície
 * colorida) e ilustração de moto (`lucide-react` `Bike`).
 */
export function FreteBanner({ title, ctaLabel, onCta }: FreteBannerProps) {
  return (
    <div className={styles.banner}>
      <div className={styles.content}>
        <h4 className={styles.title}>{title}</h4>
        <Button
          variant="onImage"
          size="sm"
          leftIcon={<ArrowRight size={13} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
          onClick={onCta}
        >
          {ctaLabel}
        </Button>
      </div>
      <Bike size={72} strokeWidth={1.3} className={styles.moto} aria-hidden="true" />
    </div>
  );
}
