import { ImageOff, Repeat } from 'lucide-react';
import { Button } from '../ui/Button';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import type { ProductCardData } from './ProductCard';
import styles from './RepeatRow.module.css';

export interface RepeatRowProps {
  product: ProductCardData;
  /** Linha de apoio ("Comprado 3 vezes · Loja"). Sem ela, mostra a loja. */
  meta?: string;
  onAdd: () => void;
}

/** "Pra você repetir" (protótipo Início): miniatura, nome, linha de apoio e "De novo". */
export function RepeatRow({ product, meta, onAdd }: RepeatRowProps) {
  const support = meta || product.store;
  return (
    <div className={styles.row}>
      <span
        className={styles.photo}
        style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : undefined}
        aria-hidden="true"
      >
        {!product.imageUrl && <ImageOff size={16} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
      </span>
      <div className={styles.meta}>
        <div className={styles.name}>{product.name}</div>
        {support && <div className={styles.store}>{support}</div>}
      </div>
      <Button
        size="sm"
        variant="secondary"
        leftIcon={<Repeat size={16} aria-hidden="true" />}
        aria-label={`De novo: ${product.name}`}
        onClick={onAdd}
      >
        De novo
      </Button>
    </div>
  );
}
