// frontend/components/seller/dinheiro/SellerWithdrawSheet.tsx
import { useEffect, useId, useRef, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../../lib/money';
import { checkWithdraw, toWithdrawInput, withdrawPayload } from '../../wallet/withdrawRule';
import styles from './SellerWithdrawSheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  available: number;
  /** Mínimo vindo do servidor (PlatformConfig). null = não sabemos: o servidor decide. */
  minimum: number | null;
  pixLabel?: string | null;
  /** Linha de rodapé ("Fica em Dinheiro: R$ 612,30 a receber"). */
  note?: string | null;
  /** Saque em conferência: texto do motivo; sem botão de sacar. */
  blocked?: string | null;
  error?: string | null;
  submitting?: boolean;
  title?: string;
  /** Pede a senha da conta DROP antes de sacar (saque da conta de recebimento). */
  askPassword?: boolean;
  onConfirm: (amount: number | 'all', password?: string) => void;
}

const toInput = (n: number) => n.toFixed(2).replace('.', ',');

export function SellerWithdrawSheet({ open, onClose, available, minimum, pixLabel, note, blocked, error, submitting, title = 'Sacar', askPassword = false, onConfirm }: Props) {
  const inputId = useId();
  const passwordId = useId();
  const [raw, setRaw] = useState('');
  const [password, setPassword] = useState('');
  // Envio único: a ref trava o duplo clique antes de o pai renderizar `submitting`.
  const sending = useRef(false);

  useEffect(() => { if (open) setRaw(available > 0 ? toWithdrawInput(available) : ''); }, [open, available]);
  useEffect(() => { if (!open) setPassword(''); }, [open]);
  useEffect(() => { sending.current = false; }, [open, submitting, error]);

  const c = checkWithdraw(raw, available, minimum);
  const { value, invalid, overAvailable, belowMinimum: belowMin } = c;
  // checkWithdraw falha fechado (NaN em '1.000'): valor ambíguo é erro na tela, nunca é enviado.
  const has = Number.isFinite(value) && value > 0;
  const valid = c.valid && !submitting && (!askPassword || password.length > 0);
  const isAll = c.isAll && !submitting;

  const chips = [500, 1000].filter((v) => v < available);

  return (
    <Sheet open={open} onClose={onClose} presentation="bottom" title={title}>
      <div className={styles.body}>
        {blocked ? (
          <Alert tone="warning" title="Saque em conferência">{blocked}</Alert>
        ) : (
          <>
            <div className={styles.amount}>
              <label htmlFor={inputId} className={styles.label}>Valor do saque</label>
              <div className={styles.field}>
                <span aria-hidden="true">R$</span>
                <input id={inputId} className={styles.input} inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value.replace(/[^\d.,]/g, ''))} />
              </div>
              {isAll && <span className={styles.ok}>Tudo o que está disponível</span>}
              {invalid && <span className={styles.err}>Valor inválido. Use vírgula para os centavos, como 1000,00.</span>}
              {overAvailable && <span className={styles.err}>{`Você tem ${formatMoney(available)} para sacar.`}</span>}
              {belowMin && <span className={styles.err}>{`O saque mínimo é ${formatMoney(minimum as number)}`}</span>}
            </div>
            <div className={styles.chips}>
              {chips.map((v) => (
                <button key={v} type="button" className={styles.chip} onClick={() => setRaw(toWithdrawInput(v))}>{formatMoney(v)}</button>
              ))}
              <button type="button" className={styles.chip} onClick={() => setRaw(toWithdrawInput(available))}>Tudo</button>
            </div>
            {pixLabel && <p className={styles.dest}>{`Para a chave ${pixLabel}`}</p>}
            {note && <p className={styles.note}>{note}</p>}
            {askPassword && (
              <div className={styles.password}>
                <label htmlFor={passwordId} className={styles.label}>Sua senha da DROP</label>
                <input
                  id={passwordId}
                  type="password"
                  autoComplete="current-password"
                  className={styles.passwordInput}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </div>
            )}
            {error && <p role="alert" className={styles.err}>{error}</p>}
            <Button onClick={() => {
              if (!valid || sending.current) return;
              sending.current = true;
              if (askPassword) onConfirm(withdrawPayload(c), password);
              else onConfirm(withdrawPayload(c));
            }} disabled={!valid} loading={submitting}>
              {`Sacar ${formatMoney(has ? value : 0)}`}
            </Button>
            {minimum !== null && <small className={styles.note}>{`Mínimo de ${formatMoney(minimum)} por saque`}</small>}
          </>
        )}
      </div>
    </Sheet>
  );
}
