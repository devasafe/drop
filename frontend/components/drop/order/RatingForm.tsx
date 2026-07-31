import { useId, useState } from 'react';
import { CheckCircle2, Star } from 'lucide-react';
import { ICON_STROKE_WIDTH } from '../../ui/Icon';
import { Button } from '../../ui/Button';
import styles from './RatingForm.module.css';

const STAR_VALUES = [1, 2, 3, 4, 5] as const;

export interface RatingFormProps {
  title: string;
  onSubmit: (rating: number, comment: string) => void;
  submitting?: boolean;
  submitted?: boolean;
}

/**
 * Formulário de avaliação (1–5 estrelas + comentário opcional) usado tanto
 * para avaliar o motoboy quanto a loja na tela de acompanhamento — genérico
 * via `title`/`onSubmit`. Estrelas são botões reais com `aria-label`
 * ("N estrelas") e `aria-pressed`, mesmo padrão de `PaymentSelector`/
 * `AddressSelector`. Quando `submitted`, mostra confirmação no lugar do
 * formulário (evita reenvio da mesma avaliação).
 */
export function RatingForm({ title, onSubmit, submitting = false, submitted = false }: RatingFormProps) {
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState('');
  const commentId = useId();

  if (submitted) {
    return (
      <div className={styles.confirmation} role="status">
        <CheckCircle2 size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
        <span>Avaliação enviada. Obrigado!</span>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <h3 className={styles.title}>{title}</h3>
      <div className={styles.stars} role="group" aria-label="Avaliação em estrelas">
        {STAR_VALUES.map((value) => {
          const active = rating >= value;
          return (
            <button
              key={value}
              type="button"
              className={styles.star}
              aria-label={`${value} estrelas`}
              aria-pressed={active}
              onClick={() => setRating(value)}
            >
              <Star size={24} strokeWidth={ICON_STROKE_WIDTH} fill={active ? 'currentColor' : 'none'} />
            </button>
          );
        })}
      </div>
      <label htmlFor={commentId} className={styles.label}>
        Comentário (opcional)
      </label>
      <textarea
        id={commentId}
        className={styles.textarea}
        value={comment}
        onChange={(event) => setComment(event.target.value)}
        placeholder="Conte como foi sua experiência"
        rows={3}
      />
      <Button
        variant="primary"
        loading={submitting}
        disabled={rating === 0}
        onClick={() => onSubmit(rating, comment)}
      >
        Enviar avaliação
      </Button>
    </div>
  );
}
