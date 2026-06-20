import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import TransactionDetailsModal, { DetailRow } from '../../components/TransactionDetailsModal';
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
  const [activeTab, setActiveTab] = useState<'saldo' | 'historico' | 'payouts' | 'analises'>('saldo');
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [transferring, setTransferring] = useState(false);
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
  const handleSacar = async () => {
    const storeId = user?.storeId || user?._id;
    if (!storeId) return;
    const available = wallet?.availableBalance ?? 0;
    if (available <= 0) { alert('Nenhum saldo disponível para saque.'); return; }
    if (!confirm(`Sacar R$ ${available.toFixed(2)} para a chave PIX da loja?`)) return;
    setTransferring(true);
    try {
      await api.post('/withdrawals/request', { amount: 'all', storeId });
      alert('Saque solicitado! O valor cai na chave PIX cadastrada da loja.');
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
        const storeId = user?.storeId || user?._id;
        if (!storeId) return;

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

  return (
    <ProtectedRoute required_role="lojista">
      <div className={styles.page}>
        <div className={styles.container}>

          {/* Header */}
          <div className={styles.header}>
            <h1 className={styles.headerTitle}>Carteira da Loja</h1>
            <p className={styles.headerSubtitle}>Acompanhe os ganhos e despesas da sua loja</p>
          </div>

          {/* Dados de recebimento (PIX) */}
          <a href="/dados-recebimento" style={{ display: 'block', background: 'rgba(108,43,217,0.12)', border: '1px solid #6C2BD9', borderRadius: 12, padding: '12px 16px', margin: '0 0 16px', color: '#C4B5FD', textDecoration: 'none', fontWeight: 600 }}>
            💳 Dados de recebimento (chave PIX) — configure para receber e sacar →
          </a>

          {/* Saldo Principal */}
          {wallet && (
            <div className={styles.balanceCard}>
              <div className={styles.balanceGrid}>
                <div>
                  <p className={styles.balanceLabel}>Disponivel para Saque</p>
                  <h2 className={styles.balanceAmount}>
                    R$ {(wallet.availableBalance ?? wallet.balance).toFixed(2)}
                  </h2>
                </div>
                <div>
                  <p className={styles.balanceLabel}>Pendente (aguardando entrega)</p>
                  <h2 className={styles.balanceAmountSm || styles.balanceAmount} style={{ color: '#f59e0b' }}>
                    R$ {(wallet.pendingBalance ?? 0).toFixed(2)}
                  </h2>
                </div>
                <div>
                  <p className={styles.balanceLabel}>Plano</p>
                  <h2 className={styles.balancePlanName}>
                    {planNames[wallet.plan || 1]}
                  </h2>
                  <p className={styles.balancePlanFee}>
                    Taxa: {wallet.feePercent}% de comissao
                  </p>
                </div>
                <div>
                  <p className={styles.balanceLabel}>Total Ganho</p>
                  <h2 className={styles.balanceIncome}>
                    R$ {wallet.totalIncome.toFixed(2)}
                  </h2>
                </div>
              </div>
            </div>
          )}

          {/* Abas */}
          <div className={styles.tabs}>
            {(['saldo', 'historico', 'payouts', 'analises'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`${styles.tab} ${activeTab === tab ? styles.tabActive : ''}`}
              >
                {tab === 'saldo' && 'Saldo'}
                {tab === 'historico' && 'Historico'}
                {tab === 'payouts' && 'Meus Payouts'}
                {tab === 'analises' && 'Analises'}
              </button>
            ))}
          </div>

          {/* Conteúdo — Saldo */}
          {activeTab === 'saldo' && wallet && (
            <div className={styles.saldoGrid}>
              <div className={styles.saldoCard}>
                <h3 className={styles.saldoCardTitle}>Saldo Atual</h3>
                <div className={styles.saldoAmount}>
                  R$ {wallet.balance.toFixed(2)}
                </div>
                <p className={styles.saldoHint}>
                  Valor disponível para saque da sua loja
                </p>
                <button
                  className={styles.btnWithdraw}
                  onClick={handleSacar}
                  disabled={(wallet.availableBalance ?? 0) <= 0 || transferring}
                >
                  {transferring
                    ? 'Sacando...'
                    : (wallet.availableBalance ?? 0) > 0
                      ? `Sacar R$ ${(wallet.availableBalance ?? 0).toFixed(2)} para meu PIX`
                      : 'Nenhum saldo disponível'}
                </button>
                <p style={{ fontSize: 12, color: 'var(--drop-text-dim)', marginTop: 8, textAlign: 'center' }}>
                  Para sacar pro banco, vá em <strong>Minha Carteira</strong>
                </p>
              </div>

              <div className={styles.saldoRight}>
                <div className={styles.saldoStatCard}>
                  <p className={styles.statLabel}>Total Ganho</p>
                  <h3 className={styles.statValueSuccess}>
                    R$ {wallet.totalIncome.toFixed(2)}
                  </h3>
                </div>

                <div className={styles.saldoStatCard}>
                  <h4 className={styles.statLabel}>Plano Atual</h4>
                  <p className={styles.statValueMuted}>
                    <strong>{planNames[wallet.plan || 1]}</strong>
                  </p>
                  <p className={styles.statRetain}>
                    Você retém {100 - (wallet.feePercent || 15)}% das vendas
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Conteudo — Payouts */}
          {activeTab === 'payouts' && (
            <div className={styles.historyCard}>
              {payouts.length === 0 ? (
                <p className={styles.historyEmpty}>Nenhum payout encontrado</p>
              ) : (
                <table className={styles.historyTable}>
                  <thead className={styles.historyThead}>
                    <tr>
                      <th className={styles.historyTh}>Data</th>
                      <th className={styles.historyTh}>Pedido</th>
                      <th className={styles.historyTh}>Valor</th>
                      <th className={styles.historyTh}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payouts.map((p) => (
                      <tr
                        key={p._id}
                        className={styles.txRow}
                        style={{ cursor: 'pointer' }}
                        onClick={() => handlePayoutClick(p)}
                      >
                        <td className={styles.txCell}>
                          {new Date(p.createdAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className={styles.txCell} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                          {p.orderId?.slice(-6)}
                        </td>
                        <td className={styles.txCell}>
                          <span className={styles.txAmountCredit}>
                            R$ {p.amount.toFixed(2)}
                          </span>
                        </td>
                        <td className={styles.txCell}>
                          <span style={{
                            padding: '2px 8px',
                            borderRadius: 999,
                            fontSize: 11,
                            fontWeight: 600,
                            background:
                              p.status === 'paid' ? 'rgba(34,197,94,0.15)' :
                              p.status === 'released' ? 'rgba(59,130,246,0.15)' :
                              p.status === 'pending' ? 'rgba(245,158,11,0.15)' :
                              p.status === 'requested' ? 'rgba(139,92,246,0.15)' :
                              'rgba(239,68,68,0.15)',
                            color:
                              p.status === 'paid' ? '#22C55E' :
                              p.status === 'released' ? '#3B82F6' :
                              p.status === 'pending' ? '#F59E0B' :
                              p.status === 'requested' ? '#8B5CF6' :
                              '#EF4444',
                          }}>
                            {p.status === 'pending' && 'Pendente'}
                            {p.status === 'released' && 'Disponivel'}
                            {p.status === 'requested' && 'Saque solicitado'}
                            {p.status === 'paid' && 'Pago'}
                            {p.status === 'cancelled' && 'Cancelado'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Conteudo — Historico (payouts + saques) */}
          {activeTab === 'historico' && (
            <div className={styles.historyCard}>
              {payouts.length === 0 && history.length === 0 ? (
                <p className={styles.historyEmpty}>Nenhuma transação ainda</p>
              ) : (
                <table className={styles.historyTable}>
                  <thead className={styles.historyThead}>
                    <tr>
                      <th className={styles.historyTh}>Data</th>
                      <th className={styles.historyTh}>Pedido</th>
                      <th className={styles.historyTh}>Valor</th>
                      <th className={styles.historyTh}>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {/* Repasses por pedido */}
                    {payouts.map((p) => (
                      <tr
                        key={p._id}
                        className={styles.txRow}
                        style={{ cursor: 'pointer' }}
                        onClick={() => handlePayoutClick(p)}
                      >
                        <td className={styles.txCell}>{new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
                        <td className={styles.txCell} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                          #{p.orderId?.slice(-6)}
                        </td>
                        <td className={styles.txCell}>
                          <span className={styles.txAmountCredit}>+ R$ {p.amount.toFixed(2)}</span>
                        </td>
                        <td className={styles.txCell}>
                          <span style={{
                            padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700,
                            background:
                              p.status === 'paid' ? 'rgba(34,197,94,0.15)' :
                              p.status === 'released' ? 'rgba(59,130,246,0.15)' :
                              p.status === 'pending' ? 'rgba(245,158,11,0.15)' :
                              p.status === 'requested' ? 'rgba(139,92,246,0.15)' :
                              'rgba(239,68,68,0.15)',
                            color:
                              p.status === 'paid' ? '#22C55E' :
                              p.status === 'released' ? '#3B82F6' :
                              p.status === 'pending' ? '#F59E0B' :
                              p.status === 'requested' ? '#8B5CF6' : '#EF4444',
                          }}>
                            {p.status === 'pending' && '⏳ Pendente'}
                            {p.status === 'released' && '✓ Disponivel'}
                            {p.status === 'requested' && 'Saque solicitado'}
                            {p.status === 'paid' && '✓ Pago'}
                            {p.status === 'cancelled' && 'Cancelado'}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {/* Saques realizados */}
                    {history.filter(h => h.type === 'debit').map((item, idx) => (
                      <tr
                        key={`debit-${idx}`}
                        className={styles.txRow}
                        style={{ cursor: 'pointer' }}
                        onClick={() => setSelectedTx({ kind: 'history', data: item })}
                      >
                        <td className={styles.txCell}>{new Date(item.date).toLocaleDateString('pt-BR')}</td>
                        <td className={styles.txCell} style={{ fontSize: 11, opacity: 0.5 }}>—</td>
                        <td className={styles.txCell}>
                          <span className={styles.txAmountDebit}>− R$ {item.amount.toFixed(2)}</span>
                        </td>
                        <td className={styles.txCell}>
                          <span style={{ padding: '2px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, background: 'rgba(239,68,68,0.12)', color: '#EF4444' }}>
                            Saque
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {/* Conteúdo — Análises */}
          {activeTab === 'analises' && wallet && (
            <div className={styles.analisesGrid}>
              <div className={styles.analisesCard}>
                <h3 className={styles.analisesTitle}>Análises</h3>

                <div className={styles.analisesStat}>
                  <p className={styles.analisesStatLabel}>Média por Dia</p>
                  <p className={styles.analisesStatValueSuccess}>
                    R$ {(wallet.totalIncome / 30).toFixed(2)}
                  </p>
                </div>

                <div className={styles.analisesStat}>
                  <p className={styles.analisesStatLabel}>Taxa Atual</p>
                  <p className={styles.analisesStatValueWarning}>
                    {wallet.feePercent}% de Comissão
                  </p>
                </div>

                <div className={styles.analisesStat}>
                  <p className={styles.analisesStatLabel}>Você Retém</p>
                  <p className={styles.analisesStatValueSuccess}>
                    {100 - (wallet.feePercent || 15)}%
                  </p>
                </div>
              </div>

              <div className={styles.analisesCard}>
                <h3 className={styles.analisesTitle}>Seu Plano</h3>

                <div className={styles.planBadge}>
                  <p className={styles.planBadgeLabel}>Plano Ativo</p>
                  <h3 className={styles.planBadgeName}>
                    {planNames[wallet.plan || 1]}
                  </h3>
                </div>

                <p className={styles.planDescription}>
                  Seu plano determina qual percentual você retém de cada venda. Quanto maior o plano, maiores os recursos e menores as comissões.
                </p>

                <button className={styles.btnPlan}>
                  Ver Detalhes do Plano
                </button>
              </div>
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
          details.push({ label: 'Total do Pedido', value: `R$ ${oi.totalValue.toFixed(2)}` });
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
    </ProtectedRoute>
  );
}
