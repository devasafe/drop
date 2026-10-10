import { MouseEvent } from 'react';
import { ImageOff, Plus, Zap } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { PriceTag, PriceTagSize } from '../ui/PriceTag';
import { IconButton } from '../ui/IconButton';
import { ICON_BUTTON_STROKE_WIDTH, ICON_STROKE_WIDTH } from '../ui/Icon';
import styles from './ProductCard.module.css';

export type ProductCardVariant = 'home' | 'grade' | 'busca' | 'loja' | 'carrinho' | 'recomendado';

export interface ProductCardData {
  name: string;
  store?: string;
  imageUrl?: string;
  price: number;
  oldPrice?: number;
  discountPercent?: number;
  /** ≤ 0 → Esgotado; 1–3 → "Últimas unidades". */
  stock?: number;
  /** Prazo máximo da cotação ("~35 min"). */
  etaMinutes?: number;
  freeDelivery?: boolean;
  /** Fora da área: "Não entrega aqui" no lugar do prazo. */
  outOfArea?: boolean;
}

/** No máximo 2 badges, na ordem desconto > frete grátis > últimas unidades. */
export function productBadges(p: ProductCardData, opts: { stockLabel?: string } = {}): string[] {
  const out: string[] = [];
  const pct = p.discountPercent ?? (p.oldPrice && p.oldPrice > p.price ? Math.round((1 - p.price / p.oldPrice) * 100) : 0);
  if (pct > 0) out.push(`-${pct}%`);
  if (p.freeDelivery) out.push('Frete grátis');
  if ((p.stock !== undefined && p.stock > 0 && p.stock <= 3) || opts.stockLabel) out.push('Últimas unidades');
  return out.slice(0, 2);
}

export interface ProductCardProps {
  variant: ProductCardVariant;
  product: ProductCardData;
  onAdd: () => void;
  /** Sem estoque: cobre a imagem com "Esgotado" e desabilita o botão de adicionar. */
  soldOut?: boolean;
  /** Rótulo de estoque baixo (ex.: "Restam 2") — só quando fizer sentido mostrar;
   * omitido = nada renderizado (nunca um valor inventado). Ignorado se `soldOut`. */
  stockLabel?: string;
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
  // Igual ao home, mas ocupa 100% da célula (grade responsiva) — usado em /produtos.
  grade: { layout: 'tile', showStore: true, showPromo: true, addOnImage: true, priceSize: 'sm' },
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
 *
 * Estoque (opcional, aditivo — usado pela página da loja): `soldOut` cobre a
 * imagem com um selo "Esgotado" (scrim sobre `.media`) e desabilita o botão
 * de adicionar; `stockLabel` mostra uma linha discreta ponto+texto em
 * `--rating` (mesma linguagem de `StatusPill`) abaixo do nome — só chega
 * preenchido quando o estoque é baixo, nunca para estoque farto.
 */
export function ProductCard({ variant, product, onAdd, soldOut: soldOutProp = false, stockLabel }: ProductCardProps) {
  const config = VARIANT_CONFIG[variant];
  const soldOut = soldOutProp || (product.stock !== undefined && product.stock <= 0);
  const badges = config.showPromo && !soldOut ? productBadges(product, { stockLabel }) : [];
  const oldPrice = config.showPromo ? product.oldPrice : undefined;
  const isTile = config.layout === 'tile';
  const overImage = isTile ? badges.slice(0, 1) : [];
  const below = isTile ? badges.slice(1) : badges;
  const renderBadge = (b: string) => (
    <Badge key={b} tone={b.startsWith('-') ? 'discount' : 'status'}>
      {b}
    </Badge>
  );

  // Adicionar nunca abre o produto: o card pode ser link ou estar dentro de um.
  const handleAdd = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    (onAdd as (ev?: MouseEvent<HTMLButtonElement>) => void)(e);
  };

  const addButton = (
    <IconButton
      icon={<Plus size={config.addOnImage ? 17 : 15} strokeWidth={ICON_BUTTON_STROKE_WIDTH} />}
      variant={config.addOnImage ? 'brand' : 'soft'}
      aria-label={`Adicionar ${product.name}`}
      disabled={soldOut}
      onClick={soldOut ? undefined : handleAdd}
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
          {!product.imageUrl && <ImageOff size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
        </span>
        {overImage.length > 0 && <span className={styles.discountBadge}>{overImage.map(renderBadge)}</span>}
        {soldOut && (
          <span className={styles.soldOutOverlay}>
            <span className={styles.soldOutLabel}>Esgotado</span>
          </span>
        )}
        {config.addOnImage && <span className={styles.addOnImage}>{addButton}</span>}
      </div>

      <div className={styles.info}>
        <div className={styles.textBlock}>
          <div className={styles.name}>{product.name}</div>
          {config.showStore && product.store && <div className={styles.store}>{product.store}</div>}
          {product.outOfArea ? (
            <div className={styles.deliveryOff}>Não entrega aqui</div>
          ) : product.etaMinutes ? (
            <div className={styles.delivery}>
              <Zap size={14} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
              <span>~{product.etaMinutes} min</span>
            </div>
          ) : null}
        </div>
        <div className={styles.priceRow}>
          <PriceTag price={product.price} oldPrice={oldPrice} size={config.priceSize} />
          {!isTile && below.length > 0 && below.map(renderBadge)}
          {!config.addOnImage && addButton}
        </div>
        {isTile && below.length > 0 && <div className={styles.badgeRow}>{below.map(renderBadge)}</div>}
      </div>
    </div>
  );
}
