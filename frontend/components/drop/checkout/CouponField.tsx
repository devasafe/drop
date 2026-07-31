import { useId } from 'react';
import { Input } from '../../ui/Input';
import { Button } from '../../ui/Button';
import styles from './CouponField.module.css';

export interface CouponMessage {
  type: 'ok' | 'error';
  text: string;
}

export interface CouponFieldProps {
  code: string;
  onCodeChange: (value: string) => void;
  onApply: () => void;
  onRemove: () => void;
  message: CouponMessage | null;
  validating: boolean;
  applied: boolean;
}

/**
 * Campo de cupom do checkout: `Input` + `Button` que alterna entre "Aplicar"
 * (chama `onApply`, ex.: `useCoupon`) e "Remover" (`applied` true — desconto
 * já aplicado, discount > 0). Mensagem de retorno fica em --success (ok) ou
 * --danger (error), mesmo padrão semântico de `Input.errorText`, anunciada
 * via aria-live para leitores de tela.
 */
export function CouponField({
  code,
  onCodeChange,
  onApply,
  onRemove,
  message,
  validating,
  applied,
}: CouponFieldProps) {
  const inputId = useId();

  return (
    <div className={styles.wrapper}>
      <label htmlFor={inputId} className={styles.label}>
        Cupom de desconto
      </label>
      <div className={styles.row}>
        <Input
          id={inputId}
          className={styles.input}
          value={code}
          onChange={onCodeChange}
          placeholder="Digite o cupom"
          disabled={applied}
        />
        <Button
          size="sm"
          variant={applied ? 'ghost' : 'primary'}
          loading={validating}
          disabled={!applied && !code.trim()}
          onClick={applied ? onRemove : onApply}
        >
          {applied ? 'Remover' : 'Aplicar'}
        </Button>
      </div>
      {message && (
        <p
          className={[styles.message, message.type === 'ok' ? styles.ok : styles.error].join(' ')}
          role="status"
          aria-live="polite"
        >
          {message.text}
        </p>
      )}
    </div>
  );
}
