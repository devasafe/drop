import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { ArrowUpRight, KeyRound, Receipt } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { formatBRL } from '../../components/ui/PriceTag';
import { useToast } from '../../components/ui/Toast';
import TransactionDetailsModal, { DetailRow } from '../../components/TransactionDetailsModal';
import { payoutStatusView } from '../../lib/deliveryStatus';
import styles from './MotoboyWallet.module.css';

interface MototboyWallet {
  _id: string; owner: string; ownerType: 'user';
  balance: number; totalIncome: number; totalSpent: number;
  availableBalance: number; pendingBalance: number;
  freeDeliveriesAvailable?: number; discountPercentage?: number;
}
interface PayoutItem {
  _id: string; amount: number;
  status: 'pending' | 'released' | 'requested' | 'paid' | 'cancelled';
  orderId: string; deliveryId?: string; createdAt: string;
}
interface HistoryItem {
  date: string; type: 'credit' | 'debit'; amount: number; reason: string; relatedId?: string;
}

export default function MototboyWalletPage() {
  const { user } = useAuth();
  const router = useRouter();
  const { showToast } = useToast();
  const [transferring, setTransferring] = useState(false);
  const [sacarOpen, setSacarOpen] = useState(false);
  const [wallet, setWallet] = useState<MototboyWallet | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<
    | { kind: 'payout'; data: PayoutItem; orderInfo?: any; invoice?: any }
    | { kind: 'history'; data: HistoryItem }
    | null
  >(null);

  const payoutStatusLabel = (s: PayoutItem['status']) => payoutStatusView(s).label;

  const refetchWallet = async (motoboyId: string) => {
    const walletRes = await api.get(`/wallets/motoboy/${motoboyId}`);
    setWallet(walletRes.data);
    try {
      const payoutsRes = await api.get('/payouts/my');
      setPayouts(payoutsRes.data.payouts || []);
    } catch { /* ignore */ }
  };

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const motoboyId = user?._id || user?.id;
        if (!motoboyId) return;
        setFetchError(null);
        const walletRes = await api.get(`/wallets/motoboy/${motoboyId}`);
        setWallet(walletRes.data);
        try {
          const historyRes = await api.get(`/wallets/${motoboyId}/history?limit=30`);
          setHistory(historyRes.data.history || []);
        } catch { /* history opcional */ }
        try {
          const payoutsRes = await api.get('/payouts/my');
          setPayouts(payoutsRes.data.payouts || []);
        } catch { /* ignore */ }
      } catch (err: any) {
        const status = err?.response?.status;
        const msg = err?.response?.data?.error || err?.message || 'Erro desconhecido';
        setFetchError(`[${status ?? 'NET'}] ${msg}`);
      } finally {
        setLoading(false);
      }
    };
    fetchWallet();
  }, [(user?._id || user?.id)]);

  const handlePayoutClick = async (p: PayoutItem) => {
    setSelectedTx({ kind: 'payout', data: p });
    if (!p.orderId) return;
    const updates: Partial<{ orderInfo: any; invoice: any }> = {};
    await Promise.all([
      api.get(`/orders/${p.orderId}`).then(r => { updates.orderInfo = r.data; }).catch(() => {}),
      api.get(`/invoices/by-order/${p.orderId}`).then(r => { updates.invoice = r.data; }).catch(() => {}),
    ]);
    setSelectedTx(prev => (prev?.kind === 'payout' && prev.data._id === p._id ? { ...prev, ...updates } : prev));
  };

  const available = wallet?.availableBalance ?? wallet?.balance ?? 0;

  const confirmarSaque = async () => {
    const motoboyId = user?._id || user?.id;
    if (!motoboyId || available <= 0) return;
    setTransferring(true);
    try {
      await api.post('/withdrawals/request', { amount: 'all' });
      showToast('Saque solicitado! O valor cai na sua chave PIX cadastrada.', 'success');
      setSacarOpen(false);
      await refetchWallet(motoboyId);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Erro ao solicitar saque. Confira sua chave PIX em Dados de recebimento.', 'error');
    } finally {
      setTransferring(false);
    }
  };

  // Extrato unificado: repasses (crédito) + saques (débito), mais recente primeiro.
  const entries = [
    ...payouts.map((p) => ({
      key: `p-${p._id}`, date: p.createdAt, sign: '+' as const, amount: p.amount,
      title: `Entrega #${p.orderId?.slice(-6) || '—'}`, statusView: payoutStatusView(p.status),
      // Repasse leva ao detalhe da entrega (com tudo). Sem deliveryId, cai no modal.
      onClick: () => p.deliveryId ? router.push(`/motoboy/delivery/${p.deliveryId}`) : handlePayoutClick(p),
    })),
    ...history.filter((h) => h.type === 'debit').map((h, i) => ({
      key: `h-${i}`, date: h.date, sign: '-' as const, amount: h.amount,
      title: 'Saque', statusView: { label: 'Saque', tone: 'requested' as const },
      onClick: () => setSelectedTx({ kind: 'history', data: h }),
    })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  if (loading) {
    return (
      <ProtectedRoute required_role="motoboy">
        <div className={styles.page}><div className={styles.container}>
          <Skeleton height={140} radius="var(--r-xl)" />
          <Skeleton height={80} radius="var(--r-lg)" />
          <Skeleton height={200} radius="var(--r-lg)" />
        </div></div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.title}>Ganhos e saques</h1>

          {fetchError && <div className={styles.error}>Erro ao carregar carteira: {fetchError}</div>}

          {/* Card de saldo */}
          <div className={styles.balanceCard}>
            <span className={styles.balanceGlow} aria-hidden="true" />
            <div className={styles.balanceTop}>
              <span className={styles.balanceLabel}>Disponível para saque</span>
              <span className={styles.balanceBadge}><ArrowUpRight size={17} aria-hidden="true" /></span>
            </div>
            <span className={styles.balanceValue}>{formatBRL(available)}</span>
            <Button variant="accent" className={styles.sacarBtn} onClick={() => setSacarOpen(true)} disabled={available <= 0}>
              <ArrowUpRight size={17} aria-hidden="true" /> Sacar para meu PIX
            </Button>
          </div>

          {/* Stats */}
          <div className={styles.stats}>
            <div className={styles.stat}>
              <div className={styles.statValue}>{formatBRL(wallet?.pendingBalance ?? 0)}</div>
              <div className={styles.statLabel}>Pendente</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{formatBRL(wallet?.totalIncome ?? 0)}</div>
              <div className={styles.statLabel}>Total ganho</div>
            </div>
            <div className={styles.stat}>
              <div className={styles.statValue}>{wallet?.freeDeliveriesAvailable || 0}x</div>
              <div className={styles.statLabel}>Entregas grátis</div>
            </div>
          </div>

          {/* Banner PIX */}
          <button className={styles.pixBanner} onClick={() => router.push('/dados-recebimento')}>
            <KeyRound size={16} aria-hidden="true" />
            <span>Dados de recebimento (chave PIX) — configure para receber e sacar</span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </button>

          {/* Extrato */}
          <section className={styles.section}>
            <h2 className={styles.sectionTitle}>Extrato</h2>
            {entries.length === 0 ? (
              <EmptyState icon={<Receipt size={22} aria-hidden="true" />} title="Nenhuma movimentação" description="Seus repasses e saques aparecem aqui." />
            ) : (
              <div className={styles.extractList}>
                {entries.map((e) => (
                  <button key={e.key} onClick={e.onClick} className={styles.row}>
                    <div className={styles.rowInfo}>
                      <span className={styles.rowTitle}>{e.title}</span>
                      <span className={styles.rowDate}>{new Date(e.date).toLocaleDateString('pt-BR')}</span>
                    </div>
                    <div className={styles.rowRight}>
                      <span className={`${styles.rowAmount} ${e.sign === '+' ? styles.credit : styles.debit}`}>
                        {e.sign} {formatBRL(e.amount)}
                      </span>
                      <span className={`${styles.pill} ${styles[e.statusView.tone]}`}>{e.statusView.label}</span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>

      {/* Sheet de confirmação de saque */}
      <Sheet open={sacarOpen} onClose={() => setSacarOpen(false)} title="Sacar para meu PIX">
        <div className={styles.sheetBody}>
          <p className={styles.sheetText}>
            Vamos transferir <strong>{formatBRL(available)}</strong> para a sua chave PIX cadastrada em Dados de recebimento.
          </p>
          <Button onClick={confirmarSaque} disabled={transferring || available <= 0}>
            {transferring ? 'Solicitando…' : `Sacar ${formatBRL(available)}`}
          </Button>
        </div>
      </Sheet>

      {selectedTx?.kind === 'payout' && (() => {
        const p = selectedTx.data;
        const oi = selectedTx.orderInfo;
        const invoice = selectedTx.invoice;
        const link = (text: string, href: string) => (
          <a href={href} onClick={(e) => { e.preventDefault(); router.push(href); }} className={styles.txLink}>{text}</a>
        );
        const details: DetailRow[] = [];
        if (invoice?._id) details.push({ label: 'Nota de Serviço', value: link(invoice.invoiceNumber || 'Ver nota', `/invoice/${invoice._id}`) });
        details.push({ label: 'Pedido', value: link(`#${p.orderId?.slice(-6)}`, `/order/${p.orderId}`) });
        if (oi?.storeName || oi?.storeObj?.name) {
          details.push({ label: 'Loja', value: oi.storeObj?.name || oi.storeName });
          if (oi.storeObj?.address) details.push({ label: 'Endereço Loja', value: oi.storeObj.address });
        }
        if (oi?.customerName || oi?.customerObj?.name) details.push({ label: 'Cliente', value: oi.customerObj?.name || oi.customerName });
        const addr = oi?.customerAddress || oi?.customerObj?.mainAddress || oi?.customerObj?.addresses?.[0];
        if (addr) details.push({ label: 'Entrega em', value: `${addr.street || ''}, ${addr.number || ''}, ${addr.neighborhood || ''}, ${addr.city || ''}` });
        if (oi?.deliveryDistance) details.push({ label: 'Distância', value: `${oi.deliveryDistance.toFixed(1)} km` });
        if (oi?.delivery) {
          if (oi.delivery.pickedAt) details.push({ label: 'Retirado', value: new Date(oi.delivery.pickedAt).toLocaleString('pt-BR') });
          if (oi.delivery.deliveredAt) details.push({ label: 'Entregue', value: new Date(oi.delivery.deliveredAt).toLocaleString('pt-BR'), highlight: 'success' as const });
        }
        details.push({ label: 'ID Payout', value: p._id, mono: true });
        details.push({ label: 'Criado em', value: new Date(p.createdAt).toLocaleString('pt-BR') });
        const subtitle = oi?.storeName || oi?.storeObj?.name ? `Entrega para ${oi.storeObj?.name || oi.storeName}` : `Pedido #${p.orderId?.slice(-6) || '—'}`;
        return (
          <TransactionDetailsModal
            isOpen onClose={() => setSelectedTx(null)}
            title="Detalhes do Repasse" subtitle={subtitle}
            statusLabel={payoutStatusLabel(p.status)} statusTone={p.status}
            amount={p.amount} amountSign="+" details={details}
          />
        );
      })()}

      {selectedTx?.kind === 'history' && (
        <TransactionDetailsModal
          isOpen onClose={() => setSelectedTx(null)}
          title={selectedTx.data.type === 'credit' ? 'Detalhes do Crédito' : 'Detalhes do Débito'}
          subtitle={selectedTx.data.reason}
          statusLabel={selectedTx.data.type === 'credit' ? 'Entrada' : 'Saída'}
          statusTone={selectedTx.data.type}
          amount={selectedTx.data.amount} amountSign={selectedTx.data.type === 'credit' ? '+' : '-'}
          details={[
            { label: 'Data', value: new Date(selectedTx.data.date).toLocaleString('pt-BR') },
            { label: 'Tipo', value: selectedTx.data.type === 'credit' ? 'Crédito' : 'Débito' },
            { label: 'Motivo', value: selectedTx.data.reason },
            ...(selectedTx.data.relatedId ? [{ label: 'Referência', value: selectedTx.data.relatedId, mono: true }] : []),
          ]}
        />
      )}
    </ProtectedRoute>
  );
}
