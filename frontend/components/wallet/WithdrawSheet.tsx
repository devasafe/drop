import { useEffect, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { formatBRL } from '../ui/PriceTag';
import styles from './WithdrawSheet.module.css';

/** Limite diário sugerido do PIX (Asaas). Serve de default/atalho — o usuário pode ajustar. */
export const SUGGESTED_DAILY_LIMIT = 8000;

interface Props {
  open: boolean;
  onClose: () => void;
  available: number;
  submitting?: boolean;
  /** Recebe 'all' quando o valor == disponível, senão o número escolhido. */
  onConfirm: (amount: number | 'all') => void;
}

const parse = (s: string) => {
  const n = Number(String(s).replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(n) ? n : NaN;
};

export default function WithdrawSheet({ open, onClose, available, submitting, onConfirm }: Props) {
  const [raw, setRaw] = useState('');

  // Ao abrir, pré-preenche com o menor entre disponível e o limite diário.
  useEffect(() => {
    if (open) {
      const def = Math.min(available, SUGGESTED_DAILY_LIMIT);
      setRaw(def > 0 ? def.toFixed(2).replace('.', ',') : '');
    }
  }, [open, available]);

  const value = parse(raw);
  const valid = Number.isFinite(value) && value > 0 && value <= available + 0.01;
  const isAll = valid && value >= available - 0.01;

  const submit = () => {
    if (!valid) return;
    onConfirm(isAll ? 'all' : Math.round(value * 100) / 100);
  };

  return (
    <Sheet open={open} onClose={onClose} title="Sacar para meu PIX">
      <div className={styles.body}>
        <div className={styles.availRow}>
          <span>Disponível</span>
          <strong>{formatBRL(available)}</strong>
        </div>

        <label className={styles.label}>Valor do saque</label>
        <div className={styles.inputWrap}>
          <span className={styles.currency}>R$</span>
          <input
            className={styles.input}
            inputMode="decimal"
            value={raw}
            onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, ''))}
            placeholder="0,00"
            autoFocus
          />
        </div>
        {!valid && raw !== '' && (
          <span className={styles.err}>Informe um valor entre R$ 0,01 e {formatBRL(available)}.</span>
        )}

        <div className={styles.chips}>
          {available > SUGGESTED_DAILY_LIMIT && (
            <button type="button" className={styles.chip} onClick={() => setRaw(SUGGESTED_DAILY_LIMIT.toFixed(2).replace('.', ','))}>
              {formatBRL(SUGGESTED_DAILY_LIMIT)}
            </button>
          )}
          <button type="button" className={styles.chip} onClick={() => setRaw(available.toFixed(2).replace('.', ','))}>
            Tudo ({formatBRL(available)})
          </button>
        </div>

        <p className={styles.hint}>
          O limite diário do PIX costuma ser {formatBRL(SUGGESTED_DAILY_LIMIT)}. Para valores maiores, saque em partes —
          você pode sacar qualquer valor até o disponível.
        </p>

        <Button onClick={submit} disabled={!valid || submitting}>
          {submitting ? 'Solicitando…' : `Sacar ${valid ? formatBRL(value) : ''}`.trim()}
        </Button>
      </div>
    </Sheet>
  );
}
