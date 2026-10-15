// frontend/components/motoboy/ganhos/WithdrawPixSheet.tsx
import { useEffect, useId, useRef, useState } from 'react';
import { Sheet } from '../../ui/Sheet';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../../lib/money';
import { SUGGESTED_DAILY_LIMIT, checkWithdraw, defaultWithdrawInput, toWithdrawInput, withdrawPayload } from '../../wallet/withdrawRule';
import blocks from '../../panel/PanelBlocks.module.css';
import styles from './WithdrawPixSheet.module.css';

export interface WithdrawPixSheetProps {
  open: boolean;
  onClose: () => void;
  available: number;
  /** Mínimo do servidor (PlatformConfig ou o `minimum` do 400). null = o servidor decide. */
  minimum: number | null;
  pixLabel: string | null;
  onChangeKey: () => void;
  /**
   * "Não entra neste saque": a liberar e bloqueado, números do servidor.
   * pending null = não carregamos o a liberar (K29): sem total, nunca R$ 0,00 presumido.
   */
  outside?: { pending: number | null; blocked: number } | null;
  /** Saque em conferência (uncertain): texto do motivo; sem botão de sacar. */
  blocked?: string | null;
  error?: string | null;
  submitting?: boolean;
  /** autoApproveWithdrawals: true = cai em minutos; false = depois da aprovação; null = não sabemos. */
  instant?: boolean | null;
  title?: string;
  onConfirm: (amount: number | 'all') => void;
}

const QUICK = [50, 100, 200];

/** Sheet "Sacar no Pix" (protótipo "Sacar"). A regra do valor é a do WithdrawSheet (withdrawRule). */
export function WithdrawPixSheet({
  open, onClose, available, minimum, pixLabel, onChangeKey, outside, blocked, error, submitting, instant = null, title = 'Sacar no Pix', onConfirm,
}: WithdrawPixSheetProps) {
  const inputId = useId();
  const [raw, setRaw] = useState('');
  // Envio único: a ref trava o duplo toque antes de o pai renderizar `submitting`.
  const sending = useRef(false);

  useEffect(() => { if (open) setRaw(defaultWithdrawInput(available)); }, [open, available]);
  useEffect(() => { sending.current = false; }, [open, submitting, error]);

  const c = checkWithdraw(raw, available, minimum);
  const hasValue = Number.isFinite(c.value) && c.value > 0;
  const balanceBelowMin = minimum !== null && available > 0 && available < minimum - 0.005;
  const chips = QUICK.filter((v) => v < available && (minimum === null || v >= minimum));
  const pendingUnknown = !!outside && outside.pending === null;
  const outsidePending = outside?.pending ?? 0;
  const outsideTotal = outside ? Math.round((outsidePending + outside.blocked) * 100) / 100 : 0;

  const submit = () => {
    if (!c.valid || submitting || sending.current) return;
    sending.current = true;
    onConfirm(withdrawPayload(c));
  };

  return (
    <Sheet open={open} onClose={onClose} presentation="bottom" title={title}>
      <div className={styles.body}>
        {instant === true && <p className={blocks.meta}>Cai em minutos na sua chave Pix</p>}
        {instant === false && <p className={blocks.meta}>Cai na sua chave Pix depois da aprovação da equipe</p>}
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
              {c.isAll && <span className={styles.ok}>Tudo o que está disponível</span>}
              {!c.invalid && raw.trim() !== '' && !hasValue && <span className={styles.err}>Informe um valor maior que zero.</span>}
              {c.invalid && <span className={styles.err}>Valor inválido. Use vírgula para os centavos, como 1000,00.</span>}
              {c.overAvailable && <span className={styles.err}>{`Você tem ${formatMoney(available)} para sacar.`}</span>}
              {c.belowMinimum && minimum !== null && <span className={styles.err}>{`O saque mínimo é ${formatMoney(minimum)}`}</span>}
            </div>
            {balanceBelowMin && minimum !== null && (
              <Alert tone="info" title="Saldo abaixo do mínimo">
                {`O saque mínimo é ${formatMoney(minimum)}. Se esse valor ficou parado, fale com o suporte: a equipe da DROP resolve.`}
              </Alert>
            )}
            <div className={styles.chips}>
              {chips.map((v) => (
                <button key={v} type="button" className={styles.chip} onClick={() => setRaw(toWithdrawInput(v))}>{formatMoney(v)}</button>
              ))}
              {available > SUGGESTED_DAILY_LIMIT && (
                <button type="button" className={styles.chip} onClick={() => setRaw(toWithdrawInput(SUGGESTED_DAILY_LIMIT))}>{formatMoney(SUGGESTED_DAILY_LIMIT)}</button>
              )}
              <button type="button" className={styles.chip} onClick={() => setRaw(toWithdrawInput(available))}>Tudo</button>
            </div>
            <ul className={blocks.list}>
              <li className={blocks.row}>
                <span className={blocks.tx}>
                  <b>{pixLabel ? `Chave ${pixLabel}` : 'Sem chave Pix cadastrada'}</b>
                  <span>O saque cai nesta chave</span>
                </span>
                <button type="button" className={blocks.link} onClick={onChangeKey}>{pixLabel ? 'Trocar' : 'Cadastrar'}</button>
              </li>
            </ul>
            {outside && (pendingUnknown || outsideTotal > 0) && (
              <div className={blocks.sum}>
                {/* Sem o a liberar, o total seria menor do que o real: só o título, sem valor. */}
                <div><span>Não entra neste saque</span>{!pendingUnknown && <span>{formatMoney(outsideTotal)}</span>}</div>
                {pendingUnknown && <div><span className={styles.indent}>· a liberar</span><span>Não carregamos</span></div>}
                {outsidePending > 0 && <div><span className={styles.indent}>· a liberar</span><span>{formatMoney(outsidePending)}</span></div>}
                {outside.blocked > 0 && <div><span className={styles.indent}>· bloqueado</span><span>{formatMoney(outside.blocked)}</span></div>}
              </div>
            )}
            {error && <p role="alert" className={styles.err}>{error}</p>}
            <Button onClick={submit} disabled={!c.valid || !!submitting} loading={submitting}>
              {`Sacar ${formatMoney(hasValue ? c.value : 0)}`}
            </Button>
            {minimum !== null && <small className={styles.foot}>{`Saque mínimo de ${formatMoney(minimum)}`}</small>}
          </>
        )}
      </div>
    </Sheet>
  );
}

export default WithdrawPixSheet;
