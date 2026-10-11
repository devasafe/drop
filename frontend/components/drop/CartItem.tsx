import { ImageOff } from 'lucide-react';
import { formatMoney } from '../../lib/money';
import { QuantitySelector } from '../ui/QuantitySelector';
import styles from './CartItem.module.css';

export interface CartItemData {
  name: string;
  /** Preço unitário. */
  price: number;
  quantity: number;
  imageUrl?: string | null;
  /** Variação escolhida ("Preto · M"). */
  variant?: string;
  /** Estoque disponível. */
  maxQuantity?: number;
  unavailable?: boolean;
}

export interface CartItemProps {
  item: CartItemData;
  /** 0 = remover. Quem chama mostra o toast com "Desfazer". */
  onQuantityChange: (quantity: number) => void;
}

/**
 * Linha da sacola (DS v2, spec §7.1): foto 56, nome, preço e
 * QuantitySelector. Remover é levar a quantidade a zero — sai a lixeira
 * solta de 30px. Item indisponível fica apagado e travado, com aviso.
 */
export function CartItem({ item, onQuantityChange }: CartItemProps) {
  const lineTotal = item.price * item.quantity;
  return (
    <div className={[styles.item, item.unavailable && styles.unavailable].filter(Boolean).join(' ')}>
      <div className={styles.photo}>
        {item.imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.imageUrl} alt="" />
        ) : (
          <ImageOff size={20} strokeWidth={1.75} aria-hidden="true" />
        )}
      </div>
      <div className={styles.info}>
        <span className={styles.name}>{item.name}</span>
        {item.variant && <span className={styles.meta}>{item.variant}</span>}
        {item.unavailable ? (
          <span className={styles.warn}>Indisponível</span>
        ) : (
          item.quantity > 1 && <span className={styles.meta}>{formatMoney(item.price)} cada</span>
        )}
      </div>
      <div className={styles.side}>
        <span className={styles.total}>{formatMoney(lineTotal)}</span>
        <QuantitySelector
          size="sm"
          itemName={item.name}
          value={item.quantity}
          min={0}
          max={item.unavailable ? item.quantity : item.maxQuantity}
          onChange={onQuantityChange}
        />
      </div>
    </div>
  );
}
