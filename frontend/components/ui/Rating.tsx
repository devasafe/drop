import { Star } from 'lucide-react';
import styles from './Rating.module.css';

export interface RatingProps {
  value: number;
  /** Quantidade de avaliações (só exibição). */
  count?: number;
  /** Com `onChange`, vira entrada de 1 a 5 estrelas. */
  onChange?: (value: number) => void;
  /** Nome do grupo no modo entrada ("Avalie a loja"). */
  label?: string;
}

/** 4.83 → "4,8" */
export function formatRating(n: number): string {
  return n.toFixed(1).replace('.', ',');
}

/**
 * Avaliação (DS v2).
 * - Exibição: "★ 4,8 (32)" — compacto, para card e linha de loja. Regra do
 *   ProductCard: só mostrar com 3 avaliações ou mais (quem decide é o card).
 * - Entrada: 5 estrelas como grupo de rádio, 44px de toque cada.
 */
export function Rating({ value, count, onChange, label = 'Avaliação' }: RatingProps) {
  if (onChange) {
    return (
      <div role="radiogroup" aria-label={label} className={styles.input}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={n === 1 ? '1 estrela' : `${n} estrelas`}
            className={[styles.star, n <= value && styles.filled].filter(Boolean).join(' ')}
            onClick={() => onChange(n)}
          >
            <Star size={28} strokeWidth={1.75} aria-hidden="true" />
          </button>
        ))}
      </div>
    );
  }

  const text = formatRating(value);
  const a11y = count !== undefined
    ? `Nota ${text} de 5, ${count} ${count === 1 ? 'avaliação' : 'avaliações'}`
    : `Nota ${text} de 5`;

  return (
    <span className={styles.display} aria-label={a11y} role="img">
      <Star className={styles.icon} size={14} strokeWidth={0} aria-hidden="true" />
      <span aria-hidden="true" className={styles.value}>{text}</span>
      {count !== undefined && <span aria-hidden="true" className={styles.count}>({count})</span>}
    </span>
  );
}
