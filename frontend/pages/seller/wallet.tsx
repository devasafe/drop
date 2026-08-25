import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { ArrowUpRight, KeyRound } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import TransactionDetailsModal, { DetailRow } from '../../components/TransactionDetailsModal';
import { Chip } from '../../components/ui/Chip';
import { Button } from '../../components/ui/Button';
import WithdrawSheet from '../../components/wallet/WithdrawSheet';
import StoreWalletMetrics, { StoreFinancialSummary } from '../../components/wallet/StoreWalletMetrics';
import { List, Row } from '../../components/ui/List';
import { formatBRL } from '../../components/ui/PriceTag';
import styles from './SellerWallet.module.css';

interface StoreWallet {
  _id: string;
  owner: string;
  ownerType: 'store';
  balance: number;
  totalIncome: number;
  totalSpent: number;
  availableBalance: number;
  pendingBalance: number;
  plan?: number;
  feePercent?: number;
}

interface PayoutItem {
  _id: string;
  amount: number;
  status: 'pending' | 'released' | 'requested' | 'paid' | 'cancelled';
  orderId: string;
  createdAt: string;
  releasedAt?: string;
  paidAt?: string;
}

interface HistoryItem {
  date: string;
  type: 'credit' | 'debit';
  amount: number;
  reason: string;
  relatedId?: string;
}

export default function SellerWalletPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [wallet, setWallet] = useState<StoreWallet | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'historico' | 'payouts' | 'analises'>('historico');
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [transferring, setTransferring] = useState(false);
  const [sacarOpen, setSacarOpen] = useState(false);
  const [resolvedStoreId, setResolvedStoreId] = useState<string>('');
  const [summary, setSummary] = useState<StoreFinancialSummary | null>(null);
  const [withdrawals, setWithdrawals] = useState<any[]>([]);
  const [extractFilter, setExtractFilter] = useState<'todos' | 'vendas' | 'saques'>('todos');
  const [selectedTx, setSelectedTx] = useState<
    | { kind: 'payout'; data: PayoutItem; orderInfo?: any; invoice?: any }
    | { kind: 'history'; data: HistoryItem }
    | null
  >(null);

  const handlePayoutClick = async (p: PayoutItem) => {
    setSelectedTx({ kind: 'payout', data: p });
    if (!p.orderId) return;

    // Busca em paralelo: pedido + nota de servico da entrega
    const updates: Partial<{ orderInfo: any; invoice: any }> = {};
    await Promise.all([
      api.get(`/orders/${p.orderId}`).then(r => { updates.orderInfo = r.data; }).catch(() => {}),
      api.get(`/invoices/by-order/${p.orderId}`).then(r => { updates.invoice = r.data; }).catch(() => {}),
    ]);

    setSelectedTx(prev =>
      prev?.kind === 'payout' && prev.data._id === p._id
        ? { ...prev, ...updates }
        : prev
    );
  };

  const payoutStatusLabel = (s: PayoutItem['status']) => ({
    pending: 'Pendente',
    released: 'Disponivel',
    requested: 'Saque solicitado',
    paid: 'Pago',
    cancelled: 'Cancelado',
  }[s] || s);

  const reload = async () => {
    const storeId = user?.storeId || user?._id;
    if (!storeId) return;
    const walletRes = await api.get(`/wallets/store/${storeId}`);
    setWallet(walletRes.data);
    const payoutsRes = await api.get(`/payouts/my?storeId=${storeId}`);
    setPayouts(payoutsRes.data.payouts || []);
  };

  // Saque direto: cai na chave PIX da loja (subconta Asaas). Sem dança de carteira.
  const handleSacar = () => {
    const available = wallet?.availableBalance ?? 0;
    if (available <= 0) { alert('Nenhum saldo disponível para saque.'); return; }
    setSacarOpen(true);
  };

  const confirmSacar = async (amount: number | 'all') => {
    const storeId = resolvedStoreId || user?.storeId || user?._id;
    if (!storeId) return;
    setTransferring(true);
    try {
      const res = await api.post('/withdrawals/request', { amount, storeId });
      const done = res.data?.withdrawal?.amount;
      alert(done ? `Saque de R$ ${Number(done).toFixed(2)} solicitado! Cai na chave PIX da loja.` : 'Saque solicitado! O valor cai na chave PIX cadastrada da loja.');
      setSacarOpen(false);
      await reload();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao solicitar saque. Confira se você cadastrou sua chave PIX em Dados de Recebimento.');
    } finally {
      setTransferring(false);
    }
  };

  useEffect(() => {
    const fetchWallet = async () => {
      try {
        // Resolve o storeId de forma robusta (o user do front pode não ter storeId).
        const dash = await api.get('/stores/dashboard').then((r) => r.data).catch(() => null);
        const storeId = dash?.store?._id || dash?._id || user?.storeId || user?._id;
        if (!storeId) return;
        setResolvedStoreId(String(storeId));

        // Buscar carteira da loja
        const walletRes = await api.get(`/wallets/store/${storeId}`);
        setWallet(walletRes.data);

        // Buscar histórico
        const historyRes = await api.get(`/wallets/${storeId}/history?limit=30`);
        setHistory(historyRes.data.history || []);

        // Buscar payouts
        try {
          const payoutsRes = await api.get(`/payouts/my?storeId=${storeId}`);
          setPayouts(payoutsRes.data.payouts || []);
        } catch { /* ignore */ }
        // Resumo financeiro (buckets agregados no backend)
        try {
          const sumRes = await api.get(`/wallets/store/${storeId}/summary`);
          setSummary(sumRes.data);
        } catch { /* resumo opcional */ }
        // Saques da loja (status real)
        try {
          const wdRes = await api.get(`/withdrawals/my-withdrawals?storeId=${storeId}`);
          setWithdrawals(Array.isArray(wdRes.data) ? wdRes.data : (wdRes.data?.withdrawals || []));
        } catch { /* saques opcional */ }
      } catch (err: any) {
        console.error('Erro ao buscar carteira da loja:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchWallet();
  }, [user?._id, user?.storeId]);

  if (loading) {
    return (
      <ProtectedRoute required_role="lojista">
        <div className={styles.loadingScreen}>
          <LoadingSkeleton variant="dashboard" />
        </div>
      </ProtectedRoute>
    );
  }

  const planNames: { [key: number]: string } = {
    1: 'Marketplace Only (85%)',
    2: 'Marketplace + Motoboys (80%)',
    3: 'Premium (70%)'
  };

  const available = wallet?.availableBalance ?? wallet?.balance ?? 0;

  const wdStatus = (s: string) => (
    s === 'processed' ? { label: 'Pago', cls: 'paid' } :
    s === 'rejected' ? { label: 'Rejeitado', cls: 'cancelled' } :
    s === 'approved' ? { label: 'Aprovado', cls: 'available' } :
    { label: 'Solicitado', cls: 'pending' }
  );

  // Extrato unificado: vendas (crédito líquido) + saques (débito), mais recente primeiro.
  const historyEntries = [
    ...payouts.map((p) => {
      const cancelled = p.status === 'cancelled';
      return {
        key: `p-${p._id}`, date: p.createdAt, sign: cancelled ? '' : ('+' as const), neutral: cancelled, amount: p.amount,
        title: `Venda · Pedido #${p.orderId?.slice(-6) || '—'}`,
        statusLabel: payoutStatusLabel(p.status), statusClass: p.status as string,
        note: undefined as string | undefined,
        onClick: () => handlePayoutClick(p),
      };
    }),
    ...withdrawals.map((w: any, i: number) => {
      const wv = wdStatus(w.status);
      return {
        key: `w-${w._id || w.id || i}`, date: w.requestedAt || w.createdAt, sign: '-' as const, neutral: false, amount: Number(w.amount),
        title: 'Saque via PIX', statusLabel: wv.label, statusClass: wv.cls,
        note: w.status === 'rejected' && w.rejectionReason ? `Motivo: ${w.rejectionReason}` : undefined,
        onClick: () => setSelectedTx({ kind: 'history', data: { amount: Number(w.amount), date: w.requestedAt, type: 'debit', reason: w.rejectionReason || 'Saque via PIX' } }),
      };
    }),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  return (
    <ProtectedRoute required_role="lojista">
      <div className={styles.page}>
        <div className={styles.container}>

          {/* Header */}
          <div className={styles.header}>
            <h1 className={styles.headerTitle}>Carteira da Loja</h1>
            <p className={styles.headerSubtitle}>Acompanhe os ganhos e despesas da sua loja</p>
          </div>

          {/* Hero de saldo */}
          <div className={styles.balanceCard}>
            <span className={styles.balanceGlow} aria-hidden="true" />
            <div className={styles.balanceTop}>
              <span className={styles.balanceLabel}>Disponível para saque</span>
              <span className={styles.balanceBadge}><ArrowUpRight size={17} aria-hidden="true" /></span>
            </div>
            <span className={styles.balanceValue}>{formatBRL(available)}</span>
            <Button variant="accent" className={styles.sacarBtn} onClick={handleSacar} disabled={available <= 0 || transferring}>
              <ArrowUpRight size={17} aria-hidden="true" /> {transferring ? 'Sacando…' : 'Sacar para meu PIX'}
            </Button>
          </div>

          {/* Resumo financeiro (líquido + bruto + taxas, agregado no backend) */}
          {summary && <StoreWalletMetrics summary={summary} />}
          {summary && (
            <div className={styles.retainLine}>
              <span><strong>{summary.retainPercent}%</strong> você retém por venda</span>
              <span className={styles.retainPlan}>Plano {summary.plan} · Drop retém {summary.commissionPercent}%</span>
            </div>
          )}

          {/* Banner PIX */}
          <a href="/dados-recebimento" className={styles.pixBanner}>
            <KeyRound size={16} aria-hidden="true" />
            <span>Dados de recebimento (chave PIX) — configure para receber e sacar</span>
            <ArrowUpRight size={16} aria-hidden="true" />
          </a>

          {!wallet && (
            <p className={styles.emptyMsg}>Não foi possível carregar a carteira da loja. Verifique se sua loja está cadastrada e recarregue a página.</p>
          )}

          {/* Abas */}
          <div className={styles.tabs}>
            <Chip label="Histórico" active={activeTab === 'historico'} onClick={() => setActiveTab('historico')} />
            <Chip label="Payouts" active={activeTab === 'payouts'} onClick={() => setActiveTab('payouts')} />
            <Chip label="Análises" active={activeTab === 'analises'} onClick={() => setActiveTab('analises')} />
          </div>

          {/* Histórico (vendas + saques) */}
          {activeTab === 'historico' && (
            <section className={styles.section}>
              <div className={styles.extractFilters}>
                {(['todos', 'vendas', 'saques'] as const).map((f) => (
                  <button key={f} className={`${styles.filterChip} ${extractFilter === f ? styles.filterChipActive : ''}`} onClick={() => setExtractFilter(f)}>
                    {f === 'todos' ? 'Todos' : f === 'vendas' ? 'Vendas' : 'Saques'}
                  </button>
                ))}
              </div>
              {(() => {
                const filtered = historyEntries.filter((e) =>
                  extractFilter === 'todos' ? true : extractFilter === 'vendas' ? e.key.startsWith('p-') : e.key.startsWith('w-'),
                );
                return filtered.length === 0 ? (
                <p className={styles.emptyMsg}>Nenhuma transação ainda</p>
              ) : (
                <List>
                  {filtered.map((e) => (
                    <Row key={e.key} interactive onClick={e.onClick} className={styles.txRow}>
                      <div className={styles.rowInfo}>
                        <span className={styles.rowTitle}>{e.title}</span>
                        <span className={styles.rowDate}>{new Date(e.date).toLocaleDateString('pt-BR')}</span>
                        {(e as any).note && <span className={styles.rowNote}>{(e as any).note}</span>}
                      </div>
                      <div className={styles.rowRight}>
                        <span className={`${styles.rowAmount} ${(e as any).neutral ? styles.neutral : e.sign === '+' ? styles.credit : styles.debit}`}>
                          {e.sign} {formatBRL(e.amount)}
                        </span>
                        <span className={`${styles.pill} ${styles[e.statusClass] || ''}`}>{e.statusLabel}</span>
                      </div>
                    </Row>
                  ))}
                </List>
              );
              })()}
            </section>
          )}

          {/* Payouts */}
          {activeTab === 'payouts' && (
            <section className={styles.section}>
              {payouts.length === 0 ? (
                <p className={styles.emptyMsg}>Nenhum payout encontrado</p>
              ) : (
                <List>
                  {payouts.map((p) => (
                    <Row key={p._id} interactive onClick={() => handlePayoutClick(p)} className={styles.txRow}>
                      <div className={styles.rowInfo}>
                        <span className={styles.rowTitle}>Pedido #{p.orderId?.slice(-6) || '—'}</span>
                        <span className={styles.rowDate}>{new Date(p.createdAt).toLocaleDateString('pt-BR')}</span>
                      </div>
                      <div className={styles.rowRight}>
                        <span className={`${styles.rowAmount} ${styles.credit}`}>+ {formatBRL(p.amount)}</span>
                        <span className={`${styles.pill} ${styles[p.status] || ''}`}>{payoutStatusLabel(p.status)}</span>
                      </div>
                    </Row>
                  ))}
                </List>
              )}
            </section>
          )}

          {/* Análises */}
          {activeTab === 'analises' && summary && (
            <div className={styles.analises}>
              <div className={styles.analiticsGrid}>
                {[
                  { label: 'Vendas hoje', value: formatBRL(summary.grossToday), tone: 'brand' },
                  { label: 'Vendas no mês', value: formatBRL(summary.grossThisMonth), tone: 'brand' },
                  { label: 'Líquido no mês', value: formatBRL(summary.netThisMonth), tone: 'success' },
                  { label: 'Ticket médio', value: formatBRL(summary.ticketMedio), tone: 'brand' },
                  { label: 'Taxas pagas', value: formatBRL(summary.commission), tone: 'warn' },
                  { label: 'Cancelado', value: formatBRL(summary.cancelledValue), tone: 'warn' },
                  { label: 'Pedidos concluídos', value: String(summary.billableCount), tone: 'success' },
                  { label: 'Pedidos cancelados', value: String(summary.cancelledCount), tone: 'warn' },
                ].map((m) => (
                  <div key={m.label} className={`${styles.analiticCard} ${styles[`tone_${m.tone}`]}`}>
                    <span className={styles.analiticLabel}>{m.label}</span>
                    <span className={styles.analiticValue}>{m.value}</span>
                  </div>
                ))}
              </div>
              {wallet && (
                <div className={styles.planBlock}>
                  <p className={styles.planLabel}>Plano ativo</p>
                  <h3 className={styles.planName}>{planNames[wallet.plan || 1]}</h3>
                  <p className={styles.planDescription}>
                    Você retém <strong>{summary.retainPercent}%</strong> de cada venda; a Drop retém {summary.commissionPercent}% de comissão.
                  </p>
                </div>
              )}
            </div>
          )}

        </div>

      </div>

      {selectedTx?.kind === 'payout' && (() => {
        const p = selectedTx.data;
        const oi = selectedTx.orderInfo;
        const invoice = selectedTx.invoice;
        const link = (text: string, href: string) => (
          <a
            href={href}
            onClick={(e) => { e.preventDefault(); router.push(href); }}
            style={{ color: '#3b82f6', textDecoration: 'underline', cursor: 'pointer' }}
          >
            {text}
          </a>
        );
        const details: DetailRow[] = [];
        // Cliente
        if (oi?.customerName || oi?.customerObj?.name) {
          const name = oi.customerObj?.name || oi.customerName;
          const custId = oi.customerId;
          details.push({
            label: 'Cliente',
            value: custId ? link(name, `/user/${custId}`) : name,
          });
          if (oi.customerObj?.email) {
            details.push({ label: 'Email', value: oi.customerObj.email });
          }
        }
        // Pedido
        details.push({
          label: 'Pedido',
          value: link(`#${p.orderId?.slice(-6)}`, `/order/${p.orderId}`),
        });
        // Nota de Servico da entrega (se existir)
        if (invoice?._id) {
          details.push({
            label: 'Nota de Servico (Frete)',
            value: link(invoice.invoiceNumber || 'Ver nota', `/invoice/${invoice._id}`),
          });
        }
        // Produtos
        if (oi?.products?.length) {
          const prodList = oi.products.map((pr: any) => `${pr.productName || pr.name || 'Produto'} x${pr.quantity}`).join(', ');
          details.push({ label: 'Produtos', value: prodList });
        }
        if (oi?.totalValue != null) {
          details.push({ label: 'Total do pedido (cliente)', value: `R$ ${Number(oi.totalValue).toFixed(2)}` });
          // Detalhamento financeiro da loja: bruto (produtos) → comissão → líquido.
          const deliveryFee = Number(oi.deliveryFee || 0);
          const gross = Math.max(0, Number(oi.totalValue) - deliveryFee); // venda de produtos (bruto da loja)
          const net = Number(p.amount); // payout já é o líquido da loja
          const commission = Math.max(0, Math.round((gross - net) * 100) / 100);
          details.push({ label: 'Venda (produtos)', value: `R$ ${gross.toFixed(2)}` });
          if (commission > 0) details.push({ label: 'Comissão Drop', value: `- R$ ${commission.toFixed(2)}`, highlight: 'warning' as const });
          details.push({ label: 'Líquido da loja', value: `R$ ${net.toFixed(2)}`, highlight: 'success' as const });
        }
        // Payout info
        details.push({ label: 'ID Payout', value: p._id, mono: true });
        details.push({ label: 'Criado em', value: new Date(p.createdAt).toLocaleString('pt-BR') });
        if (p.releasedAt) details.push({ label: 'Liberado em', value: new Date(p.releasedAt).toLocaleString('pt-BR'), highlight: 'info' as const });
        if (p.paidAt) details.push({ label: 'Pago em', value: new Date(p.paidAt).toLocaleString('pt-BR'), highlight: 'success' as const });

        return (
          <TransactionDetailsModal
            isOpen={true}
            onClose={() => setSelectedTx(null)}
            title="Detalhes do Repasse"
            subtitle={oi?.customerName ? `Compra de ${oi.customerName}` : `Pedido #${p.orderId?.slice(-6) || '—'}`}
            statusLabel={payoutStatusLabel(p.status)}
            statusTone={p.status}
            amount={p.amount}
            amountSign="+"
            details={details}
          />
        );
      })()}

      {selectedTx?.kind === 'history' && (
        <TransactionDetailsModal
          isOpen={true}
          onClose={() => setSelectedTx(null)}
          title={selectedTx.data.type === 'credit' ? 'Detalhes do Crédito' : 'Detalhes do Débito'}
          subtitle={selectedTx.data.reason}
          statusLabel={selectedTx.data.type === 'credit' ? 'Entrada' : 'Saida'}
          statusTone={selectedTx.data.type}
          amount={selectedTx.data.amount}
          amountSign={selectedTx.data.type === 'credit' ? '+' : '-'}
          details={[
            { label: 'Data', value: new Date(selectedTx.data.date).toLocaleString('pt-BR') },
            { label: 'Tipo', value: selectedTx.data.type === 'credit' ? 'Credito' : 'Debito' },
            { label: 'Motivo', value: selectedTx.data.reason },
            ...(selectedTx.data.relatedId ? [{ label: 'Referencia', value: selectedTx.data.relatedId, mono: true }] : []),
          ]}
        />
      )}

      <WithdrawSheet
        open={sacarOpen}
        onClose={() => setSacarOpen(false)}
        available={available}
        submitting={transferring}
        onConfirm={confirmSacar}
      />
    </ProtectedRoute>
  );
}
