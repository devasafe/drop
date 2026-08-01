import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAutoRefetch } from '../hooks/useAutoRefetch';
import { useToast } from '../components/ui/Toast';
import { formatBRL } from '../components/ui/PriceTag';
import { Sheet } from '../components/ui/Sheet';
import styles from './Wallet.module.css';

interface WalletData {
  _id: string;
  owner: string;
  ownerType: 'user' | 'store' | 'platform';
  balance: number;
  totalIncome: number;
  totalSpent: number;
}

interface HistoryItem {
  date: string;
  type: 'credit' | 'debit';
  amount: number;
  reason: string;
  relatedId?: string;
}

type CreditMethod = 'pix' | 'credit_card' | 'debit_card';
const METHODS: { id: CreditMethod; label: string }[] = [
  { id: 'pix', label: 'PIX' },
  { id: 'credit_card', label: 'Cartão de crédito' },
  { id: 'debit_card', label: 'Cartão de débito' },
];

export default function WalletPage() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);

  const [creditOpen, setCreditOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditMethod, setCreditMethod] = useState<CreditMethod>('pix');

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [bankData, setBankData] = useState({ banco: '', agencia: '', conta: '', cpf: '' });

  const fetchWallet = useCallback(async () => {
    try {
      if (!user?._id) return;
      const walletRes = await api.get(`/wallets/${user._id}`);
      setWallet(walletRes.data);
      const historyRes = await api.get(`/wallets/${user._id}/history?limit=20`);
      setHistory(historyRes.data.history || []);
    } catch (err) {
      console.error('Erro ao buscar carteira:', err);
    } finally {
      setLoading(false);
    }
  }, [user?._id]);

  useAutoRefetch(
    ['wallet:updated', 'wallet:refund', 'wallet:transfer_completed', 'wallet:transfer_received'],
    fetchWallet,
  );

  useEffect(() => { fetchWallet(); }, [user?._id, fetchWallet]);

  const refetchHistory = async () => {
    const res = await api.get(`/wallets/${user?._id}/history?limit=20`);
    setHistory(res.data.history || []);
  };

  const handleCredit = async () => {
    if (!creditAmount || isNaN(Number(creditAmount))) {
      showToast('Insira um valor válido', 'error');
      return;
    }
    setLoadingAction(true);
    try {
      const res = await api.post(`/wallets/${user?._id}/credit`, {
        amount: Number(creditAmount),
        paymentMethod: creditMethod,
        reference: `Carregamento ${new Date().toLocaleDateString('pt-BR')}`,
      });
      setWallet(res.data.wallet);
      setCreditAmount('');
      setCreditOpen(false);
      showToast('Saldo carregado com sucesso!', 'success');
      await refetchHistory();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Erro ao carregar saldo', 'error');
    } finally {
      setLoadingAction(false);
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawAmount || isNaN(Number(withdrawAmount))) {
      showToast('Insira um valor válido', 'error');
      return;
    }
    if (!bankData.banco || !bankData.agencia || !bankData.conta || !bankData.cpf) {
      showToast('Preencha todos os dados bancários', 'error');
      return;
    }
    setLoadingAction(true);
    try {
      const res = await api.post(`/wallets/${user?._id}/transfer`, {
        amount: Number(withdrawAmount),
        bankAccount: bankData,
        reason: `Saque solicitado em ${new Date().toLocaleDateString('pt-BR')}`,
      });
      setWallet(res.data.wallet);
      setWithdrawAmount('');
      setBankData({ banco: '', agencia: '', conta: '', cpf: '' });
      setWithdrawOpen(false);
      showToast('Saque solicitado! Você receberá em até 2 dias úteis.', 'success');
      await refetchHistory();
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Erro ao sacar', 'error');
    } finally {
      setLoadingAction(false);
    }
  };

  return (
    <ProtectedRoute required_role="cliente">
      <div className={styles.page}>
        {/* Card de saldo */}
        <div className={styles.balanceCard}>
          <span className={styles.balanceLabel}>Saldo · Carteira Drop</span>
          <span className={styles.balanceValue}>{loading ? '—' : formatBRL(wallet?.balance ?? 0)}</span>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Entradas</span>
              <span className={styles.statValue}>{formatBRL(wallet?.totalIncome ?? 0)}</span>
            </div>
            <div className={styles.stat}>
              <span className={styles.statLabel}>Saídas</span>
              <span className={styles.statValue}>{formatBRL(wallet?.totalSpent ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className={styles.actions}>
          <button type="button" className={styles.actionBtn} onClick={() => setCreditOpen(true)}>Carregar</button>
          <button type="button" className={styles.actionBtnGhost} onClick={() => setWithdrawOpen(true)}>Sacar</button>
        </div>

        {/* Extrato */}
        <section className={styles.extrato}>
          <h2 className={styles.extratoTitle}>Extrato</h2>
          {loading ? (
            <p className={styles.muted}>Carregando…</p>
          ) : history.length === 0 ? (
            <p className={styles.empty}>Sem movimentações ainda.</p>
          ) : (
            <ul className={styles.txList}>
              {history.map((tx, i) => (
                <li key={i} className={styles.txRow}>
                  <span className={`${styles.txDot} ${tx.type === 'credit' ? styles.txCredit : styles.txDebit}`} />
                  <span className={styles.txInfo}>
                    <span className={styles.txReason}>{tx.reason}</span>
                    <span className={styles.txDate}>{new Date(tx.date).toLocaleDateString('pt-BR')}</span>
                  </span>
                  <span className={`${styles.txAmount} ${tx.type === 'credit' ? styles.txCredit : styles.txDebit}`}>
                    {tx.type === 'credit' ? '+' : '−'} {formatBRL(tx.amount)}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Sheet Carregar */}
      <Sheet open={creditOpen} onClose={() => setCreditOpen(false)} title="Carregar saldo">
        <div className={styles.form}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Valor</span>
            <input
              className={styles.input}
              type="number"
              inputMode="decimal"
              aria-label="Valor"
              placeholder="0,00"
              value={creditAmount}
              onChange={(e) => setCreditAmount(e.target.value)}
            />
          </label>
          <div className={styles.methodRow}>
            {METHODS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`${styles.methodBtn} ${creditMethod === m.id ? styles.methodOn : ''}`}
                onClick={() => setCreditMethod(m.id)}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button type="button" className={styles.submitBtn} disabled={loadingAction} onClick={handleCredit}>
            {loadingAction ? 'Processando…' : 'Confirmar carregamento'}
          </button>
        </div>
      </Sheet>

      {/* Sheet Sacar */}
      <Sheet open={withdrawOpen} onClose={() => setWithdrawOpen(false)} title="Sacar para conta bancária">
        <div className={styles.form}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Valor</span>
            <input className={styles.input} type="number" inputMode="decimal" aria-label="Valor" placeholder="0,00"
              value={withdrawAmount} onChange={(e) => setWithdrawAmount(e.target.value)} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Banco</span>
            <input className={styles.input} aria-label="Banco" value={bankData.banco}
              onChange={(e) => setBankData({ ...bankData, banco: e.target.value })} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Agência</span>
            <input className={styles.input} aria-label="Agência" value={bankData.agencia}
              onChange={(e) => setBankData({ ...bankData, agencia: e.target.value })} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Conta</span>
            <input className={styles.input} aria-label="Conta" value={bankData.conta}
              onChange={(e) => setBankData({ ...bankData, conta: e.target.value })} />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>CPF</span>
            <input className={styles.input} aria-label="CPF" value={bankData.cpf}
              onChange={(e) => setBankData({ ...bankData, cpf: e.target.value })} />
          </label>
          <button type="button" className={styles.submitBtn} disabled={loadingAction} onClick={handleWithdraw}>
            {loadingAction ? 'Processando…' : 'Solicitar saque'}
          </button>
        </div>
      </Sheet>
    </ProtectedRoute>
  );
}
