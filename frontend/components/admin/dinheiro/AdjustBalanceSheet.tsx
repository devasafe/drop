/**
 * Ajustar saldo (D3b-3, spec 5): crédito ou débito auditado numa carteira, só do CEO (wallet:credit).
 * POST /admin/wallets/:id/adjust { direction, amount, reason, idempotencyKey }.
 * - valor exatamente o digitado (parseAmount), > 0 e até R$ 50.000,00; motivo de 10 a 500 caracteres;
 * - prévia "saldo antes → depois"; débito maior que o saldo conhecido não sai;
 * - chave de idempotência (E9): a mesma em toda tentativa COM OS MESMOS valores (direção, valor em centavos,
 *   motivo): repetir depois de erro de rede ou resposta estranha nunca ajusta duas vezes (o servidor devolve o
 *   ajuste já gravado, replayed: true). Mudou qualquer valor → chave nova (a intenção nova nunca some como
 *   "já registrado"). Fechar e abrir a folha zera tudo;
 * - 409 INSUFFICIENT_BALANCE: a mensagem traz o saldo disponível e a tela passa esse saldo para a prévia;
 * - 409 IDEMPOTENCY_KEY_REUSED (a chave já foi usada com outros valores ou noutra carteira): mensagem e chave nova;
 * - sucesso só quando o ajuste da resposta é desta carteira (replayed ou não).
 */
import { useEffect, useRef, useState } from 'react';
import { AdminSheet } from '../AdminSheet';
import blocks from '../AdminBlocks.module.css';
import ui from './Dinheiro.module.css';
import { TextAreaField } from './TextAreaField';
import { flattenMoneyError } from './moneyErrors';
import { Alert } from '../../ui/Alert';
import { Input } from '../../ui/Input';
import { RadioRow } from '../../ui/RadioRow';
import api from '../../../lib/api';
import { amountFieldError, parseAmount } from '../../../lib/adminAmount';
import { isConflictWithCode } from '../../../lib/adminErrors';
import { newIdempotencyKey, type WalletAdjustResponse } from '../../../lib/adminMoney';
import { formatMoney } from '../../../lib/money';

export const ADJUST_MAX = 50000;
export const ADJUST_REASON_MIN = 10;
export const ADJUST_REASON_MAX = 500;

export interface AdjustTarget { walletId: string; name: string; balance: number }

export interface AdjustBalanceSheetProps {
  /** null = folha fechada. */
  target: AdjustTarget | null;
  onClose: () => void;
  onAdjusted: (r: WalletAdjustResponse) => void | Promise<void>;
  /** 409 INSUFFICIENT_BALANCE trouxe o saldo disponível de agora. */
  onBalanceKnown?: (available: number) => void;
}

const cents = (v: number) => Math.round(v * 100);
const NOT_CONFIRMED = 'O servidor não confirmou o ajuste. Tente de novo: o mesmo ajuste nunca é aplicado duas vezes.';
const OTHER_WALLET = 'O servidor respondeu com o ajuste de outra carteira. Confira o extrato antes de tentar de novo.';

export function AdjustBalanceSheet({ target, onClose, onAdjusted, onBalanceKnown }: AdjustBalanceSheetProps) {
  const open = !!target;
  const [direction, setDirection] = useState<'credit' | 'debit'>('credit');
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  // Uma chave por conjunto de valores (direção|centavos|motivo) tentado nesta abertura da folha (E9).
  const keys = useRef(new Map<string, string>());
  // Trava síncrona contra clique duplo (vale antes de qualquer setState).
  const inFlight = useRef(false);

  // Só ao abrir: a tela atualizar o saldo (409 INSUFFICIENT_BALANCE) não zera a folha.
  useEffect(() => {
    if (!open) return;
    setDirection('credit');
    setAmount('');
    setReason('');
    keys.current = new Map();
  }, [open]);

  const value = parseAmount(amount);
  const before = target ? target.balance : 0;
  const afterCents = value === null ? null : cents(before) + (direction === 'credit' ? 1 : -1) * cents(value);
  const reasonLen = reason.trim().length;
  const amountError = amountFieldError(amount)
    ?? (value !== null && value > ADJUST_MAX ? `O valor máximo é ${formatMoney(ADJUST_MAX)}.` : undefined)
    ?? (afterCents !== null && afterCents < 0 ? `Maior que o saldo da carteira (${formatMoney(before)}).` : undefined);
  const valid = value !== null && value > 0 && !amountError
    && reasonLen >= ADJUST_REASON_MIN && reasonLen <= ADJUST_REASON_MAX;

  const submit = async () => {
    if (!target || !valid || value === null || inFlight.current) return;
    inFlight.current = true;
    const body = { direction, amount: value, reason: reason.trim() };
    const sig = `${body.direction}|${cents(body.amount)}|${body.reason}`;
    let key = keys.current.get(sig);
    if (!key) {
      key = newIdempotencyKey();
      keys.current.set(sig, key);
    }
    let data: Partial<WalletAdjustResponse> | undefined;
    try {
      const res = await api.post(`/admin/wallets/${target.walletId}/adjust`, { ...body, idempotencyKey: key });
      data = res.data;
    } catch (err) {
      if (isConflictWithCode(err, 'INSUFFICIENT_BALANCE')) {
        const available = (err as { response?: { data?: { available?: unknown } } }).response?.data?.available;
        if (typeof available === 'number' && Number.isFinite(available)) onBalanceKnown?.(available);
      }
      // A chave já pertence a outro ajuste: a próxima tentativa com estes valores vai com chave nova.
      if (isConflictWithCode(err, 'IDEMPOTENCY_KEY_REUSED')) keys.current.delete(sig);
      throw flattenMoneyError(err, 'Não deu para ajustar o saldo.');
    } finally {
      inFlight.current = false;
    }
    const adjustment = data?.adjustment;
    if (!adjustment || typeof adjustment.balanceAfter !== 'number') {
      throw { response: { data: { error: NOT_CONFIRMED } } };
    }
    if (adjustment.walletId !== target.walletId) {
      // Esta chave não ajustou esta carteira: não reusar.
      keys.current.delete(sig);
      throw { response: { data: { error: OTHER_WALLET } } };
    }
    await onAdjusted({ message: data?.message ?? '', replayed: data?.replayed === true, adjustment });
  };

  return (
    <AdminSheet
      open={open}
      title="Ajustar saldo"
      onClose={onClose}
      primary={{ label: 'Confirmar ajuste', tone: 'danger', disabled: !valid, onClick: submit }}
    >
      {target && (
        <>
          <p className={blocks.muted}>{`Carteira de ${target.name} · saldo ${formatMoney(target.balance)}`}</p>
          <fieldset className={ui.fieldset}>
            <legend className={ui.fieldLabel}>Tipo de ajuste</legend>
            <RadioRow
              name="adjust-direction"
              value="credit"
              checked={direction === 'credit'}
              onChange={() => setDirection('credit')}
              label="Crédito"
              description="Soma ao saldo"
            />
            <RadioRow
              name="adjust-direction"
              value="debit"
              checked={direction === 'debit'}
              onChange={() => setDirection('debit')}
              label="Débito"
              description="Tira do saldo"
              tone="danger"
            />
          </fieldset>
          <Alert tone="warning" title={direction === 'credit' ? 'Isto cria saldo sem pagamento' : 'Isto tira saldo da carteira'}>
            {direction === 'credit'
              ? 'O valor entra na carteira sem nenhum dinheiro entrar no DROP.'
              : 'O valor sai da carteira sem nenhum Pix para a pessoa.'}
            {' Use só para corrigir um erro. Fica no Histórico do Dinheiro com o seu nome e o motivo.'}
          </Alert>
          <Input
            label="Valor (R$)"
            value={amount}
            onChange={setAmount}
            placeholder="0,00"
            inputMode="decimal"
            error={amountError}
          />
          {value !== null && value > 0 && !amountError && afterCents !== null && (
            <p className={blocks.muted}>{`Saldo: ${formatMoney(before)} → ${formatMoney(afterCents / 100)}`}</p>
          )}
          <TextAreaField
            label="Motivo (de 10 a 500 caracteres)"
            value={reason}
            onChange={setReason}
            placeholder="Ex.: compensação pelo pedido #4790 extraviado"
            hint={`${reasonLen}/${ADJUST_REASON_MAX}. No extrato aparece como "Ajuste da plataforma: <motivo>".`}
          />
        </>
      )}
    </AdminSheet>
  );
}

export default AdjustBalanceSheet;
