import styles from './PriceTag.module.css';

export type PriceTagSize = 'sm' | 'md';

export interface PriceTagProps {
  price: number;
  oldPrice?: number;
  size?: PriceTagSize;
}

/** `R$ 89,90` — vírgula decimal, sempre duas casas. */
export function formatBRL(n: number): string {
  return `R$ ${n.toFixed(2).replace('.', ',')}`;
}

/**
 * Preço de produto, `de/por` opcional. Preço atual é sempre `--text-strong`
 * (branco) em `--font-display` 700 — **nunca roxo** (spec Regra D: roxo só
 * em CTA/ativo/progresso/promo/desconto, preço não é nenhum desses).
 * Preço antigo é riscado em `--text-subtle`, como `.of .pr b`/`.of .pr s`
 * do mock canônico.
 */
export function PriceTag({ price, oldPrice, size = 'md' }: PriceTagProps) {
  return (
    <span className={[styles.priceTag, styles[size]].join(' ')}>
      <b className={styles.current}>{formatBRL(price)}</b>
      {oldPrice !== undefined && (
        <s className={styles.old}>{formatBRL(oldPrice)}</s>
      )}
    </span>
  );
}
