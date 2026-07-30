import { ImageOff, Plus } from 'lucide-react';
import { PriceTag } from '../ui/PriceTag';
import { IconButton } from '../ui/IconButton';
import { ICON_BUTTON_STROKE_WIDTH, ICON_STROKE_WIDTH } from '../ui/Icon';
import type { ProductCardData } from './ProductCard';
import styles from './RepeatRow.module.css';

export interface RepeatRowProps {
  product: ProductCardData;
  onAdd: () => void;
}

/**
 * Linha compacta "pra você repetir" — replica `.rep` do mock canônico:
 * divisor, sem card com borda (de-cardificação spec §3.1-A), sempre sem
 * promo (mesma lógica operacional da variante `carrinho` de `ProductCard`
 * — reordenar não carrega badge/preço riscado, mesmo que o produto tenha
 * `discountPercent`/`oldPrice`). Foto + nome + loja + preço + IconButton
 * `soft` de adicionar.
 */
export function RepeatRow({ product, onAdd }: RepeatRowProps) {
  return (
    <div className={styles.row}>
      <span
        className={styles.photo}
        style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : undefined}
        aria-hidden="true"
      >
        {!product.imageUrl && (
          <ImageOff size={16} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
        )}
      </span>
      <div className={styles.meta}>
        <div className={styles.name}>{product.name}</div>
        {product.store && <div className={styles.store}>{product.store}</div>}
      </div>
      <PriceTag price={product.price} size="sm" />
      <IconButton
        icon={<Plus size={15} strokeWidth={ICON_BUTTON_STROKE_WIDTH} />}
        variant="soft"
        aria-label="Adicionar"
        onClick={onAdd}
      />
    </div>
  );
}
