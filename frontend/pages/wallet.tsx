import { useState, useEffect, useCallback } from 'react';
import { Receipt, ChevronRight, Wallet, Plus, ArrowUpRight, ArrowDownLeft } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAutoRefetch } from '../hooks/useAutoRefetch';
import { useToast } from '../components/ui/Toast';
import { formatBRL } from '../components/ui/PriceTag';
import { Sheet } from '../components/ui/Sheet';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Chip } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/EmptyState';
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
  { id: 'credit_card', label: 'Crédito' },
  { id: 'debit_card', label: 'Débito' },
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

  const [selectedTx, setSelectedTx] = useState<HistoryItem | null>(null);

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
        <header className={styles.header}>
          <h1 className={styles.title}>Carteira</h1>
        </header>

        {/* Card de saldo */}
        <div className={styles.balanceCard}>
          <span className={styles.balanceGlow} aria-hidden="true" />
          <div className={styles.balanceTop}>
            <span className={styles.balanceLabel}>Saldo disponível</span>
            <span className={styles.walletBadge}><Wallet size={18} aria-hidden="true" /></span>
          </div>
          <span className={styles.balanceValue}>{loading ? '—' : formatBRL(wallet?.balance ?? 0)}</span>
          <div className={styles.stats}>
            <div className={styles.stat}>
              <span className={styles.statIcon}><ArrowDownLeft size={14} aria-hidden="true" /></span>
              <div className={styles.statText}>
                <span className={styles.statLabel}>Entradas</span>
                <span className={styles.statValue}>{formatBRL(wallet?.totalIncome ?? 0)}</span>
              </div>
            </div>
            <div className={styles.stat}>
              <span className={styles.statIcon}><ArrowUpRight size={14} aria-hidden="true" /></span>
              <div className={styles.statText}>
                <span className={styles.statLabel}>Saídas</span>
                <span className={styles.statValue}>{formatBRL(wallet?.totalSpent ?? 0)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Ações */}
        <div className={styles.actions}>
          <button type="button" className={`${styles.actionBtn} ${styles.actionPrimary}`} onClick={() => setCreditOpen(true)}>
            <Plus size={17} aria-hidden="true" /> Carregar
          </button>
          <button type="button" className={`${styles.actionBtn} ${styles.actionSecondary}`} onClick={() => setWithdrawOpen(true)}>
            <ArrowUpRight size={17} aria-hidden="true" /> Sacar
          </button>
        </div>

        {/* Extrato */}
        <section className={styles.extrato}>
          <h2 className={styles.extratoTitle}>Extrato</h2>
          {loading ? (
            <p className={styles.muted}>Carregando…</p>
          ) : history.length === 0 ? (
            <EmptyState icon={<Receipt />} title="Sem movimentações ainda" description="Suas entradas e saídas aparecem aqui." />
          ) : (
            <ul className={styles.txList}>
              {history.map((tx, i) => (
                <li key={i}>
                  <button type="button" className={styles.txRow} onClick={() => setSelectedTx(tx)}>
                    <span className={`${styles.txDot} ${tx.type === 'credit' ? styles.txCredit : styles.txDebit}`} />
                    <span className={styles.txInfo}>
                      <span className={styles.txReason}>{tx.reason}</span>
                      <span className={styles.txDate}>{new Date(tx.date).toLocaleDateString('pt-BR')}</span>
                    </span>
                    <span className={`${styles.txAmount} ${tx.type === 'credit' ? styles.txCredit : styles.txDebit}`}>
                      {tx.type === 'credit' ? '+' : '−'} {formatBRL(tx.amount)}
                    </span>
                    <ChevronRight size={16} className={styles.txChevron} aria-hidden="true" />
                  </button>
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
            <Input value={creditAmount} onChange={setCreditAmount} placeholder="0,00" type="number" inputMode="decimal" aria-label="Valor" />
          </label>
          <div className={styles.methodRow}>
            {METHODS.map((m) => (
              <Chip key={m.id} label={m.label} active={creditMethod === m.id} onClick={() => setCreditMethod(m.id)} />
            ))}
          </div>
          <Button variant="primary" loading={loadingAction} onClick={handleCredit}>Confirmar carregamento</Button>
        </div>
      </Sheet>

      {/* Sheet Sacar */}
      <Sheet open={withdrawOpen} onClose={() => setWithdrawOpen(false)} title="Sacar para conta bancária">
        <div className={styles.form}>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Valor</span>
            <Input value={withdrawAmount} onChange={setWithdrawAmount} placeholder="0,00" type="number" inputMode="decimal" aria-label="Valor" />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Banco</span>
            <Input value={bankData.banco} onChange={(v) => setBankData({ ...bankData, banco: v })} aria-label="Banco" />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Agência</span>
            <Input value={bankData.agencia} onChange={(v) => setBankData({ ...bankData, agencia: v })} aria-label="Agência" />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>Conta</span>
            <Input value={bankData.conta} onChange={(v) => setBankData({ ...bankData, conta: v })} aria-label="Conta" />
          </label>
          <label className={styles.field}>
            <span className={styles.fieldLabel}>CPF</span>
            <Input value={bankData.cpf} onChange={(v) => setBankData({ ...bankData, cpf: v })} aria-label="CPF" />
          </label>
          <Button variant="primary" loading={loadingAction} onClick={handleWithdraw}>Solicitar saque</Button>
        </div>
      </Sheet>

      {/* Sheet Detalhes da transação */}
      <Sheet
        open={!!selectedTx}
        onClose={() => setSelectedTx(null)}
        title={selectedTx?.type === 'credit' ? 'Detalhes da entrada' : 'Detalhes da saída'}
      >
        {selectedTx && (
          <div className={styles.txDetails}>
            <div className={`${styles.txDetailAmount} ${selectedTx.type === 'credit' ? styles.txCredit : styles.txDebit}`}>
              {selectedTx.type === 'credit' ? '+' : '−'} {formatBRL(selectedTx.amount)}
            </div>
            <dl className={styles.txDetailList}>
              <div className={styles.txDetailRow}><dt>Motivo</dt><dd>{selectedTx.reason}</dd></div>
              <div className={styles.txDetailRow}><dt>Data</dt><dd>{new Date(selectedTx.date).toLocaleString('pt-BR')}</dd></div>
              <div className={styles.txDetailRow}><dt>Tipo</dt><dd>{selectedTx.type === 'credit' ? 'Entrada' : 'Saída'}</dd></div>
              {selectedTx.relatedId && (
                <div className={styles.txDetailRow}><dt>Referência</dt><dd className={styles.mono}>{selectedTx.relatedId}</dd></div>
              )}
            </dl>
          </div>
        )}
      </Sheet>
    </ProtectedRoute>
  );
}
