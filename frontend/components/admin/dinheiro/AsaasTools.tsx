/**
 * Saldo da conta-mãe Asaas e "Abastecer subconta" (Saques, D3a). Mesmas rotas da página antiga:
 * GET /admin/asaas/balance (cashbox:view; lido só no clique em "Ver saldo", como hoje) ·
 * POST /admin/asaas/fund-subaccount { recipientType, recipientId, amount } (wallet:credit, só do CEO).
 * O valor é exatamente o digitado (parseAmount), com prévia antes de enviar; um ref impede dois POSTs.
 */
import { useCallback, useRef, useState } from 'react';
import blocks from '../AdminBlocks.module.css';
import ui from './Dinheiro.module.css';
import { serverErrorMessage } from './serverError';
import { Button } from '../../ui/Button';
import { Input } from '../../ui/Input';
import { Select } from '../../ui/Select';
import { useToast } from '../../ui/Toast';
import api from '../../../lib/api';
import { amountFieldError, parseAmount } from '../../../lib/adminAmount';
import { formatMoney } from '../../../lib/money';

export interface AsaasBalanceState {
  balance: number | null;
  apiUrl: string;
  error: string | null;
  loading: boolean;
  load: () => Promise<void>;
}

export function useAsaasBalance(): AsaasBalanceState {
  const [balance, setBalance] = useState<number | null>(null);
  const [apiUrl, setApiUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api.get('/admin/asaas/balance');
      const value = Number(r.data?.balance);
      if (r.data?.balance == null || !Number.isFinite(value)) throw new Error('saldo ausente');
      setBalance(value);
      setApiUrl(r.data?.apiUrl || '');
    } catch (err) {
      setBalance(null);
      setError(serverErrorMessage(err, 'Falha ao consultar o saldo no Asaas'));
    } finally {
      setLoading(false);
    }
  }, []);

  return { balance, apiUrl, error, loading, load };
}

const TYPES = [
  { value: 'motoboy', label: 'Motoboy' },
  { value: 'store', label: 'Loja' },
];

export interface AsaasToolsProps {
  state: AsaasBalanceState;
  canSeeBalance: boolean;
  canFund: boolean;
  onFunded: () => void;
}

export function AsaasTools({ state, canSeeBalance, canFund, onFunded }: AsaasToolsProps) {
  const { showToast } = useToast();
  const [type, setType] = useState('motoboy');
  const [recipientId, setRecipientId] = useState('');
  const [amount, setAmount] = useState('');
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  // Trava síncrona contra clique duplo: vale antes de qualquer setState.
  const inFlight = useRef(false);

  if (!canSeeBalance && !canFund) return null;

  const value = parseAmount(amount);

  const fund = async () => {
    if (inFlight.current) return;
    if (!recipientId.trim() || value === null || value <= 0) {
      setFormError('Informe o ID do recebedor e um valor válido.');
      return;
    }
    inFlight.current = true;
    setBusy(true);
    setFormError(null);
    try {
      const r = await api.post('/admin/asaas/fund-subaccount', { recipientType: type, recipientId: recipientId.trim(), amount: value });
      showToast(r.data?.message || 'Subconta abastecida.', 'success');
      setAmount('');
      onFunded();
    } catch (err) {
      showToast(serverErrorMessage(err, 'Falha ao abastecer a subconta'), 'error');
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  return (
    <section className={blocks.block} aria-label="Asaas">
      <div className={blocks.blockHead}>
        <h2 className={blocks.blockTitle}>Saldo no Asaas</h2>
        {canSeeBalance && (
          <Button size="sm" variant="secondary" className={ui.touch} loading={state.loading} onClick={state.load}>
            Ver saldo
          </Button>
        )}
      </div>
      {canSeeBalance && (state.error
        ? <p role="alert" className={blocks.errText}>{state.error}</p>
        : (
          <p className={blocks.muted}>
            Conta-mãe: {state.balance == null ? 'toque em "Ver saldo"' : <strong>{formatMoney(state.balance)}</strong>}
            {state.apiUrl.includes('sandbox') ? ' · sandbox' : ''}
          </p>
        ))}
      {canFund && (
        <div className={ui.form}>
          <div className={ui.toolbar}>
            <Select label="Recebedor" value={type} onChange={setType} options={TYPES} />
            <Input label="ID do recebedor" value={recipientId} onChange={setRecipientId} placeholder="ID do recebedor" />
            <Input
              label="Valor (R$)"
              value={amount}
              onChange={setAmount}
              placeholder="Valor"
              inputMode="decimal"
              error={amountFieldError(amount)}
            />
          </div>
          {value !== null && value > 0 && (
            <p className={blocks.muted}>{`Vai transferir: ${formatMoney(value)}`}</p>
          )}
          {formError && <p role="alert" className={ui.formError}>{formError}</p>}
          <div>
            <Button className={ui.touch} loading={busy} onClick={fund}>Abastecer subconta</Button>
          </div>
          <p className={ui.hint}>Transfere da conta-mãe para a subconta do recebedor. Precisa de saldo na conta-mãe.</p>
        </div>
      )}
    </section>
  );
}

export default AsaasTools;
