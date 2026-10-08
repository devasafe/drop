import { useState } from 'react';
import api from '../../lib/api';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { formatBRL } from '../ui/PriceTag';
import styles from './TransferToOwnerCard.module.css';

interface Props {
  /** Rota de origem: `/wallets/store/:storeId/transfer-to-owner` ou `/wallets/motoboy/:id/transfer-to-owner`. */
  endpoint: string;
  /** Saldo liberado (repasses `released`) da origem. Sem saldo, o cartão some. */
  amount: number;
  /** Recarrega os saldos da tela depois da transferência. */
  onTransferred: () => Promise<void> | void;
}

const errText = (e: any, fallback: string) => {
  const d = e?.response?.data;
  return (typeof d?.error === 'string' && d.error) || d?.error?.message || fallback;
};

/**
 * Saldo do modo anterior (R23): move o saldo liberado da carteira da loja/motoboy para a
 * carteira pessoal do usuário. Depois, o saque sai pela carteira pessoal
 * (POST /withdrawals/request-user, para conta bancária).
 */
export default function TransferToOwnerCard({ endpoint, amount, onTransferred }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [transferred, setTransferred] = useState<number | null>(null);

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [wdAmount, setWdAmount] = useState('');
  const [bank, setBank] = useState({ bankName: '', accountNumber: '', ownerName: '' });
  const [wdBusy, setWdBusy] = useState(false);
  const [wdError, setWdError] = useState('');
  const [wdDone, setWdDone] = useState(false);

  if (amount <= 0 && transferred === null) return null;

  const transfer = async () => {
    setBusy(true);
    setError('');
    try {
      const r = await api.post(endpoint);
      const value = Number(r.data?.transferred ?? amount);
      setTransferred(value);
      setWdAmount(String(value));
      setConfirmOpen(false);
      await onTransferred();
    } catch (e: any) {
      setError(errText(e, 'Não foi possível transferir agora. Tente novamente.'));
    } finally {
      setBusy(false);
    }
  };

  const withdraw = async () => {
    const value = Number(String(wdAmount).replace(',', '.'));
    if (!Number.isFinite(value) || value <= 0) { setWdError('Informe um valor válido.'); return; }
    if (!bank.bankName.trim() || !bank.accountNumber.trim() || !bank.ownerName.trim()) {
      setWdError('Preencha banco, conta e titular.');
      return;
    }
    setWdBusy(true);
    setWdError('');
    try {
      await api.post('/withdrawals/request-user', { amount: value, bankAccount: { ...bank } });
      setWdDone(true);
      setWithdrawOpen(false);
      await onTransferred();
    } catch (e: any) {
      setWdError(errText(e, 'Não foi possível solicitar o saque.'));
    } finally {
      setWdBusy(false);
    }
  };

  return (
    <section className={styles.card} aria-label="Saldo do modo anterior">
      <h2 className={styles.title}>Saldo do modo anterior</h2>
      {transferred === null ? (
        <>
          <p className={styles.text}>
            Você tem <strong>{formatBRL(amount)}</strong> liberados do modo anterior. Transfira para a sua carteira para poder sacar.
          </p>
          <div className={styles.actions}>
            <Button variant="primary" size="sm" onClick={() => { setError(''); setConfirmOpen(true); }}>
              Transferir para minha carteira
            </Button>
          </div>
        </>
      ) : (
        <>
          <p className={styles.ok} role="status">{formatBRL(transferred)} transferidos para a sua carteira.</p>
          {wdDone ? (
            <p className={styles.text}>Saque solicitado. O valor cai na conta informada depois da aprovação.</p>
          ) : (
            <>
              <p className={styles.text}>Para sacar, peça o saque da sua carteira para uma conta bancária.</p>
              <div className={styles.actions}>
                <Button variant="ghost" size="sm" onClick={() => { setWdError(''); setWithdrawOpen(true); }}>
                  Sacar da minha carteira
                </Button>
              </div>
            </>
          )}
        </>
      )}

      <Sheet open={confirmOpen} onClose={() => !busy && setConfirmOpen(false)} title="Transferir para minha carteira">
        <div className={styles.body}>
          <p className={styles.text}>
            <strong>{formatBRL(amount)}</strong> saem do saldo do modo anterior e entram na sua carteira DROP.
          </p>
          {error && <p className={styles.err} role="alert">{error}</p>}
          <div className={styles.actions}>
            <Button variant="primary" loading={busy} onClick={transfer}>Confirmar transferência</Button>
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmOpen(false)}>Cancelar</Button>
          </div>
        </div>
      </Sheet>

      <Sheet open={withdrawOpen} onClose={() => !wdBusy && setWithdrawOpen(false)} title="Sacar da minha carteira">
        <div className={styles.body}>
          <Input value={wdAmount} onChange={setWdAmount} type="number" inputMode="decimal" aria-label="Valor do saque" placeholder="0,00" />
          <Input value={bank.bankName} onChange={(v) => setBank((b) => ({ ...b, bankName: v }))} aria-label="Banco" placeholder="Banco" />
          <Input value={bank.accountNumber} onChange={(v) => setBank((b) => ({ ...b, accountNumber: v }))} aria-label="Agência e conta" placeholder="Agência e conta" />
          <Input value={bank.ownerName} onChange={(v) => setBank((b) => ({ ...b, ownerName: v }))} aria-label="Titular" placeholder="Nome do titular" />
          {wdError && <p className={styles.err} role="alert">{wdError}</p>}
          <div className={styles.actions}>
            <Button variant="primary" loading={wdBusy} onClick={withdraw}>Solicitar saque</Button>
          </div>
        </div>
      </Sheet>
    </section>
  );
}
