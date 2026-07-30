import { ImageOff, Plus } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { PriceTag, PriceTagSize } from '../ui/PriceTag';
import { IconButton } from '../ui/IconButton';
import { ICON_BUTTON_STROKE_WIDTH, ICON_STROKE_WIDTH } from '../ui/Icon';
import styles from './ProductCard.module.css';

export type ProductCardVariant = 'home' | 'busca' | 'loja' | 'carrinho' | 'recomendado';

export interface ProductCardData {
  name: string;
  store?: string;
  imageUrl?: string;
  price: number;
  oldPrice?: number;
  discountPercent?: number;
}

export interface ProductCardProps {
  variant: ProductCardVariant;
  product: ProductCardData;
  onAdd: () => void;
}

type LayoutKind = 'tile' | 'line';

interface VariantConfig {
  /** `tile` = card visual (imagem manda, replica `.of`); `line` = linha densa com divisor. */
  layout: LayoutKind;
  showStore: boolean;
  /** Contexto operacional (carrinho) não carrega promo: sem badge de desconto, sem preço riscado. */
  showPromo: boolean;
  addOnImage: boolean;
  priceSize: PriceTagSize;
}

/**
 * Densidade/layout por contexto (spec §3.2) — proibido reusar o mesmo card
 * cegamente: `home`/`recomendado` são cards visuais/promocionais (imagem
 * manda), `busca`/`loja`/`carrinho` são linhas densas e comparáveis, sem
 * cardificação. `loja` foca preço (PriceTag `md`) e omite o nome da loja
 * (redundante dentro da própria loja). `carrinho` é operacional: sem badge
 * de desconto nem preço antigo riscado.
 */
const VARIANT_CONFIG: Record<ProductCardVariant, VariantConfig> = {
  home: { layout: 'tile', showStore: true, showPromo: true, addOnImage: true, priceSize: 'sm' },
  recomendado: {
    layout: 'tile',
    showStore: true,
    showPromo: true,
    addOnImage: true,
    priceSize: 'sm',
  },
  busca: { layout: 'line', showStore: true, showPromo: true, addOnImage: false, priceSize: 'sm' },
  loja: { layout: 'line', showStore: false, showPromo: true, addOnImage: false, priceSize: 'md' },
  carrinho: {
    layout: 'line',
    showStore: true,
    showPromo: false,
    addOnImage: false,
    priceSize: 'sm',
  },
};

/**
 * Produto no feed/busca/loja/carrinho/recomendados. Imagem manda (spec:
 * replica `.of` do mock canônico) — badge de desconto SOBRE a imagem só nas
 * variantes `tile` (`home`/`recomendado`); nas variantes `line` (densas,
 * comparáveis) o selo fica junto do preço, e a foto encolhe para caber numa
 * linha. Nome/preço nunca ganham caixa extra — texto direto sobre a
 * superfície da tela, como no mock. Sem `imageUrl`, cai para `--surface-2` +
 * ícone `ImageOff` em vez de quebrar; nome longo usa `-webkit-line-clamp: 2`.
 */
export function ProductCard({ variant, product, onAdd }: ProductCardProps) {
  const config = VARIANT_CONFIG[variant];
  const showDiscount = config.showPromo && product.discountPercent !== undefined;
  const oldPrice = config.showPromo ? product.oldPrice : undefined;
  const badgeOverImage = config.layout === 'tile';

  const addButton = (
    <IconButton
      icon={
        <Plus
          size={config.addOnImage ? 17 : 15}
          strokeWidth={ICON_BUTTON_STROKE_WIDTH}
        />
      }
      variant={config.addOnImage ? 'brand' : 'soft'}
      aria-label="Adicionar"
      onClick={onAdd}
    />
  );

  return (
    <div className={[styles.product, styles[config.layout], styles[variant]].join(' ')}>
      <div className={styles.media}>
        <span
          className={styles.image}
          style={product.imageUrl ? { backgroundImage: `url(${product.imageUrl})` } : undefined}
          aria-hidden="true"
        >
          {!product.imageUrl && (
            <ImageOff size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
          )}
        </span>
        {showDiscount && badgeOverImage && (
          <span className={styles.discountBadge}>
            <Badge tone="discount">{product.discountPercent}% OFF</Badge>
          </span>
        )}
        {config.addOnImage && <span className={styles.addOnImage}>{addButton}</span>}
      </div>

      <div className={styles.info}>
        <div className={styles.textBlock}>
          <div className={styles.name}>{product.name}</div>
          {config.showStore && product.store && (
            <div className={styles.store}>{product.store}</div>
          )}
        </div>
        <div className={styles.priceRow}>
          <PriceTag price={product.price} oldPrice={oldPrice} size={config.priceSize} />
          {showDiscount && !badgeOverImage && (
            <Badge tone="discount">{product.discountPercent}% OFF</Badge>
          )}
          {!config.addOnImage && addButton}
        </div>
      </div>
    </div>
  );
}
