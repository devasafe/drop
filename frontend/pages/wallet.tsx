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
import ClientWalletMetrics, { ClientWalletSummary } from '../components/wallet/ClientWalletMetrics';
import WalletTopupSheet from '../components/wallet/WalletTopupSheet';
import { Sparkles } from 'lucide-react';
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
  type: 'credit' | 'debit' | 'refund';
  category?: string;
  amount: number;
  reason: string;
  relatedId?: string;
  paymentMethod?: string;
}


// Classifica a movimentação pela categoria real (deposit/withdrawal/payment/refund/transfer/penalty).
function movementView(tx: { category?: string; type: string }): { typeLabel: string; dotClass: string } {
  switch (tx.category) {
    case 'payment': return { typeLabel: 'Compra', dotClass: 'txDebit' };
    case 'deposit': return { typeLabel: 'Recarga', dotClass: 'txCredit' };
    case 'refund': return { typeLabel: 'Reembolso', dotClass: 'txCredit' };
    case 'withdrawal': return { typeLabel: 'Saque', dotClass: 'txDebit' };
    case 'transfer': return { typeLabel: 'Transferência', dotClass: tx.type === 'debit' ? 'txDebit' : 'txCredit' };
    case 'penalty': return { typeLabel: 'Ajuste', dotClass: 'txDebit' };
    default: return { typeLabel: tx.type === 'debit' ? 'Saída' : 'Entrada', dotClass: tx.type === 'debit' ? 'txDebit' : 'txCredit' };
  }
}

export default function WalletPage() {
  const { user } = useAuth();
  const uid = user?._id || (user as any)?.id || ''; // AuthUser tem `id`; `_id` é opcional
  const { showToast } = useToast();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [summary, setSummary] = useState<ClientWalletSummary | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [extractFilter, setExtractFilter] = useState<'todos' | 'compras' | 'recargas' | 'reembolsos'>('todos');
  const [loading, setLoading] = useState(true);
  const [loadingAction, setLoadingAction] = useState(false);

  const [creditOpen, setCreditOpen] = useState(false);

  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [bankData, setBankData] = useState({ banco: '', agencia: '', conta: '', cpf: '' });

  const [selectedTx, setSelectedTx] = useState<HistoryItem | null>(null);

  const fetchWallet = useCallback(async () => {
    try {
      if (!uid) return;
      const walletRes = await api.get(`/wallets/${uid}`);
      setWallet(walletRes.data);
      const historyRes = await api.get(`/wallets/${uid}/history?limit=30`);
      setHistory(historyRes.data.history || []);
      try {
        const sumRes = await api.get(`/wallets/${uid}/client-summary`);
        setSummary(sumRes.data);
      } catch { /* resumo opcional */ }
    } catch (err) {
      console.error('Erro ao buscar carteira:', err);
    } finally {
      setLoading(false);
    }
  }, [uid]);

  useAutoRefetch(
    ['wallet:updated', 'wallet:refund', 'wallet:transfer_completed', 'wallet:transfer_received'],
    fetchWallet,
  );

  useEffect(() => { fetchWallet(); }, [uid, fetchWallet]);

  const refetchHistory = async () => {
    const res = await api.get(`/wallets/${uid}/history?limit=20`);
    setHistory(res.data.history || []);
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
      const res = await api.post(`/wallets/${uid}/transfer`, {
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
          <p className={styles.subtitle}>Gerencie seu saldo, créditos e acompanhe suas movimentações.</p>
        </header>

        {/* Card de saldo */}
        <div className={styles.balanceCard}>
          <span className={styles.balanceGlow} aria-hidden="true" />
          <div className={styles.balanceTop}>
            <span className={styles.balanceLabel}>Saldo disponível</span>
            <span className={styles.walletBadge}><Wallet size={18} aria-hidden="true" /></span>
          </div>
          <span className={styles.balanceValue}>{loading ? '—' : formatBRL(wallet?.balance ?? 0)}</span>
          <span className={styles.balanceHint}>Use seu saldo para pagamentos na Drop.</span>
          <div className={styles.actionsInline}>
            <button type="button" className={`${styles.actionBtn} ${styles.actionPrimary}`} onClick={() => setCreditOpen(true)}>
              <Plus size={17} aria-hidden="true" /> Carregar saldo
            </button>
            <button type="button" className={`${styles.actionBtn} ${styles.actionSecondary}`} onClick={() => setWithdrawOpen(true)}>
              <ArrowUpRight size={17} aria-hidden="true" /> Sacar saldo
            </button>
          </div>
        </div>

        {/* Resumo (benefício/economia — nunca "quanto gastou") */}
        {summary && (
          <section className={styles.resumo}>
            <h2 className={styles.resumoTitle}>Resumo da sua carteira</h2>
            <ClientWalletMetrics summary={summary} />
            <div className={styles.benefit}>
              <span className={styles.benefitIcon}><Sparkles size={18} aria-hidden="true" /></span>
              <div className={styles.benefitText}>
                {summary.totalSaved > 0 ? (
                  <>
                    <strong>Você já economizou {formatBRL(summary.totalSaved)} usando a Drop.</strong>
                    <span>Continue usando cupons para economizar ainda mais.</span>
                  </>
                ) : (
                  <>
                    <strong>Seus benefícios aparecerão aqui.</strong>
                    <span>Use cupons e promoções nos seus pedidos para começar a economizar.</span>
                  </>
                )}
              </div>
            </div>
          </section>
        )}

        {/* Extrato */}
        <section className={styles.extrato}>
          <div className={styles.extratoHead}>
            <h2 className={styles.extratoTitle}>Extrato</h2>
            <div className={styles.filters}>
              {(['todos', 'compras', 'recargas', 'reembolsos'] as const).map((f) => (
                <button key={f} className={`${styles.filterChip} ${extractFilter === f ? styles.filterChipActive : ''}`} onClick={() => setExtractFilter(f)}>
                  {f === 'todos' ? 'Todos' : f === 'compras' ? 'Compras' : f === 'recargas' ? 'Recargas' : 'Reembolsos'}
                </button>
              ))}
            </div>
          </div>
          {loading ? (
            <p className={styles.muted}>Carregando…</p>
          ) : (() => {
            const filtered = history.filter((tx) =>
              extractFilter === 'todos' ? true
              : extractFilter === 'compras' ? tx.category === 'payment'
              : extractFilter === 'recargas' ? tx.category === 'deposit'
              : tx.category === 'refund',
            );
            return filtered.length === 0 ? (
            <EmptyState icon={<Receipt />} title="Sem movimentações" description="Suas movimentações aparecem aqui." />
          ) : (
            <ul className={styles.txList}>
              {filtered.map((tx, i) => {
                const mv = movementView(tx);
                return (
                <li key={i}>
                  <button type="button" className={styles.txRow} onClick={() => setSelectedTx(tx)}>
                    <span className={`${styles.txDot} ${styles[mv.dotClass]}`} />
                    <span className={styles.txInfo}>
                      <span className={styles.txReason}>{tx.reason}</span>
                      <span className={styles.txDate}>{new Date(tx.date).toLocaleDateString('pt-BR')} · {mv.typeLabel}</span>
                    </span>
                    <span className={`${styles.txAmount} ${tx.type === 'debit' ? styles.txDebit : styles.txCredit}`}>
                      {tx.type === 'debit' ? '−' : '+'} {formatBRL(tx.amount)}
                    </span>
                    <ChevronRight size={16} className={styles.txChevron} aria-hidden="true" />
                  </button>
                </li>
                );
              })}
            </ul>
          );
          })()}
        </section>
      </div>

      {/* Carregar saldo — pagamento REAL via Asaas (PIX/cartão) */}
      <WalletTopupSheet
        open={creditOpen}
        onClose={() => setCreditOpen(false)}
        userId={uid}
        onPaid={fetchWallet}
        holderDefaults={{ name: (user as any)?.name, cpfCnpj: (user as any)?.cpf, email: (user as any)?.email, phone: (user as any)?.telefone }}
      />

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
