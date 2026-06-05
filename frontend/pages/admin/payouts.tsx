import { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import { useRouter } from 'next/router';
import ProtectedRoute from '../../components/ProtectedRoute';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import TransactionDetailsModal, { DetailRow } from '../../components/TransactionDetailsModal';
import styles from './AdminPayouts.module.css';

interface PayoutRecipient {
  id: string;
  name: string;
  type: 'store' | 'motoboy';
  email?: string;
  ownerId?: string;
  ownerName?: string;
  ownerEmail?: string;
}

interface PayoutOrder {
  id: string;
  total?: number;
  buyerId?: string;
  buyerName?: string;
  buyerEmail?: string;
}

interface Payout {
  _id: string;
  recipientType: 'store' | 'motoboy';
  recipientId: string;
  orderId: string;
  amount: number;
  status: 'pending' | 'released' | 'requested' | 'paid' | 'cancelled';
  createdAt: string;
  releasedAt?: string;
  paidAt?: string;
  gatewayProvider?: string;
  gatewayTransferId?: string;
  blocked?: boolean;
  blockReason?: string;
  recipient?: PayoutRecipient | null;
  order?: PayoutOrder | null;
}

export default function AdminPayoutsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [stats, setStats] = useState({ pending: 0, released: 0, requested: 0 });
  const [autoApprove, setAutoApprove] = useState(false);
  const [selectedPayout, setSelectedPayout] = useState<Payout | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<any | null>(null);

  // Busca nota de servico da entrega quando um payout e selecionado
  useEffect(() => {
    setSelectedInvoice(null);
    if (!selectedPayout?.orderId) return;
    const payoutId = selectedPayout._id;
    api.get(`/invoices/by-order/${selectedPayout.orderId}`)
      .then(r => {
        // Evita race condition se o usuario trocou de payout
        setSelectedPayout(cur => {
          if (cur?._id === payoutId) setSelectedInvoice(r.data);
          return cur;
        });
      })
      .catch(() => { /* nota pode nao existir (payouts antigos) */ });
  }, [selectedPayout?._id]);

  const fetchConfig = async () => {
    try {
      const res = await api.get('/payouts/admin/config');
      setAutoApprove(!!res.data.autoApprovePayouts);
    } catch { /* ignore */ }
  };

  const handleToggleAutoApprove = async () => {
    const next = !autoApprove;
    const msg = next
      ? 'Ativar aprovacao automatica? Novos payouts serao liberados imediatamente (exceto os bloqueados).'
      : 'Desativar aprovacao automatica? Novos payouts ficarao pendentes ate aprovacao manual.';
    if (!confirm(msg)) return;
    try {
      await api.put('/payouts/admin/config', { enabled: next });
      setAutoApprove(next);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao alterar configuracao');
    }
  };

  const fetchPayouts = async () => {
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      if (typeFilter) params.set('recipientType', typeFilter);
      params.set('limit', '100');

      const res = await api.get(`/payouts/admin?${params}`);
      setPayouts(res.data.payouts || []);
      setTotal(res.data.total || 0);
    } catch (err) {
      console.error('Erro ao buscar payouts:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchStats = async () => {
    try {
      const res = await api.get('/payouts/admin/obligations');
      setStats(prev => ({ ...prev, pending: res.data.pendingObligations || 0 }));
    } catch { /* ignore */ }
  };

  useEffect(() => {
    fetchPayouts();
    fetchStats();
  }, [statusFilter, typeFilter]);

  useEffect(() => {
    fetchConfig();
  }, []);

  const handleRelease = async (payoutId: string) => {
    if (!confirm('Liberar este payout manualmente?')) return;
    try {
      await api.post(`/payouts/admin/${payoutId}/release`);
      fetchPayouts();
      fetchStats();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao liberar payout');
    }
  };

  const handleBlock = async (payoutId: string) => {
    const reason = prompt('Motivo do bloqueio (fraude, inconsistencia, etc):');
    if (!reason || !reason.trim()) return;
    try {
      await api.post(`/payouts/admin/${payoutId}/block`, { reason: reason.trim() });
      fetchPayouts();
      fetchStats();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao bloquear payout');
    }
  };

  const handleUnblock = async (payoutId: string) => {
    if (!confirm('Desbloquear este payout?')) return;
    try {
      await api.post(`/payouts/admin/${payoutId}/unblock`);
      fetchPayouts();
      fetchStats();
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao desbloquear payout');
    }
  };

  const badgeClass = (status: string) => {
    switch (status) {
      case 'pending': return styles.badgePending;
      case 'released': return styles.badgeReleased;
      case 'requested': return styles.badgeRequested;
      case 'paid': return styles.badgePaid;
      case 'cancelled': return styles.badgeCancelled;
      default: return styles.badge;
    }
  };

  const statusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Pendente';
      case 'released': return 'Disponivel';
      case 'requested': return 'Saque solicitado';
      case 'paid': return 'Pago';
      case 'cancelled': return 'Cancelado';
      default: return status;
    }
  };

  if (loading) {
    return (
      <ProtectedRoute required_role="ceo">
        <div className={styles.loadingScreen}>
          <LoadingSkeleton variant="dashboard" />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute required_role="ceo">
      <div className={styles.page}>
        <div className={styles.container}>
          <div className={styles.pageHeader}>
            <h1 className={styles.pageTitle}>Payouts</h1>
            <p className={styles.pageSubtitle}>Obrigacoes financeiras da plataforma com lojistas e motoboys</p>
          </div>

          {/* Auto-approve Toggle */}
          <div className={styles.configPanel}>
            <div className={styles.configInfo}>
              <p className={styles.configTitle}>Aprovacao automatica de payouts</p>
              <p className={styles.configDesc}>
                {autoApprove
                  ? 'Ativada: payouts sao liberados automaticamente apos a entrega (exceto bloqueados).'
                  : 'Desativada: cada payout precisa ser aprovado manualmente por voce.'}
              </p>
            </div>
            <label className={styles.toggle}>
              <input type="checkbox" checked={autoApprove} onChange={handleToggleAutoApprove} />
              <span className={styles.slider} />
            </label>
          </div>

          {/* Stats */}
          <div className={styles.statsRow}>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Total de Payouts</p>
              <h2 className={styles.statValue}>{total}</h2>
            </div>
            <div className={styles.statCard}>
              <p className={styles.statLabel}>Obrigacoes Pendentes</p>
              <h2 className={styles.statValueWarning}>R$ {stats.pending.toFixed(2)}</h2>
            </div>
          </div>

          {/* Filters */}
          <div className={styles.filters}>
            <select className={styles.filterSelect} value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
              <option value="">Todos os status</option>
              <option value="pending">Pendente</option>
              <option value="released">Disponivel</option>
              <option value="requested">Saque solicitado</option>
              <option value="paid">Pago</option>
              <option value="cancelled">Cancelado</option>
            </select>
            <select className={styles.filterSelect} value={typeFilter} onChange={e => setTypeFilter(e.target.value)}>
              <option value="">Todos os tipos</option>
              <option value="store">Loja</option>
              <option value="motoboy">Motoboy</option>
            </select>
          </div>

          {/* Table */}
          {payouts.length === 0 ? (
            <div className={styles.emptyState}>Nenhum payout encontrado</div>
          ) : (
            <table className={styles.table}>
              <thead className={styles.thead}>
                <tr>
                  <th className={styles.th}>Data</th>
                  <th className={styles.th}>Destinatario</th>
                  <th className={styles.th}>Pedido</th>
                  <th className={styles.th}>Valor</th>
                  <th className={styles.th}>Status</th>
                  <th className={styles.th}>Acoes</th>
                </tr>
              </thead>
              <tbody>
                {payouts.map(p => (
                  <tr
                    key={p._id}
                    className={p.blocked ? styles.rowBlocked : styles.row}
                    onClick={() => setSelectedPayout(p)}
                    style={{ cursor: 'pointer' }}
                  >
                    <td className={styles.cell}>{new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
                    <td className={styles.cell}>
                      <div style={{ fontWeight: 600 }}>
                        {p.recipient?.name || (p.recipientType === 'store' ? 'Loja' : 'Motoboy')}
                      </div>
                      <div style={{ fontSize: 11, opacity: 0.6 }}>
                        {p.recipientType === 'store' ? 'Loja' : 'Motoboy'}
                      </div>
                    </td>
                    <td className={styles.cell} style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.orderId?.slice(-6)}</td>
                    <td className={styles.cell}>R$ {p.amount.toFixed(2)}</td>
                    <td className={styles.cell}>
                      <span className={badgeClass(p.status)}>{statusLabel(p.status)}</span>
                      {p.blocked && (
                        <>
                          <span className={styles.badgeBlocked} style={{ marginLeft: 6 }}>Bloqueado</span>
                          {p.blockReason && <div className={styles.blockReasonText}>{p.blockReason}</div>}
                        </>
                      )}
                    </td>
                    <td className={styles.cell} onClick={e => e.stopPropagation()}>
                      <div className={styles.actionStack}>
                        {p.status === 'pending' && !p.blocked && (
                          <>
                            <button className={styles.actionBtn} onClick={() => handleRelease(p._id)}>Liberar</button>
                            <button className={styles.actionBtnDanger} onClick={() => handleBlock(p._id)}>Bloquear</button>
                          </>
                        )}
                        {p.status === 'pending' && p.blocked && (
                          <button className={styles.actionBtn} onClick={() => handleUnblock(p._id)}>Desbloquear</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {selectedPayout && (
        <TransactionDetailsModal
          isOpen={!!selectedPayout}
          onClose={() => setSelectedPayout(null)}
          title="Detalhes do Payout"
          subtitle={buildSubtitle(selectedPayout)}
          statusLabel={selectedPayout.blocked ? 'Bloqueado' : statusLabel(selectedPayout.status)}
          statusTone={selectedPayout.blocked ? 'blocked' : selectedPayout.status}
          amount={selectedPayout.amount}
          details={buildPayoutDetails(selectedPayout, router, selectedInvoice)}
        />
      )}
    </ProtectedRoute>
  );
}

function buildSubtitle(p: Payout): string {
  const from = p.order?.buyerName ? `De ${p.order.buyerName}` : 'Origem: cliente do pedido';
  const to = p.recipient?.name
    ? `para ${p.recipient.name}`
    : `para ${p.recipientType === 'store' ? 'loja' : 'motoboy'}`;
  return `${from} ${to}`;
}

function linkValue(label: string, href: string, router: any): React.ReactNode {
  return (
    <a
      href={href}
      onClick={(e) => {
        e.preventDefault();
        router.push(href);
      }}
      style={{
        color: '#3b82f6',
        textDecoration: 'underline',
        cursor: 'pointer',
      }}
    >
      {label}
    </a>
  );
}

function buildPayoutDetails(p: Payout, router: any, invoice?: any): DetailRow[] {
  const rows: DetailRow[] = [];

  // Origem (comprador do pedido)
  rows.push({ label: 'ORIGEM', value: '', highlight: 'neutral' });
  if (p.order?.buyerName && p.order?.buyerId) {
    rows.push({
      label: 'Cliente',
      value: linkValue(p.order.buyerName, `/user/${p.order.buyerId}`, router),
    });
  } else if (p.order?.buyerName) {
    rows.push({ label: 'Cliente', value: p.order.buyerName });
  }
  if (p.order?.buyerEmail) rows.push({ label: 'Email cliente', value: p.order.buyerEmail });
  rows.push({
    label: 'Pedido',
    value: linkValue(`#${p.orderId.slice(-6)}`, `/order/${p.orderId}`, router),
    mono: true,
  });
  if (p.order?.total != null) {
    rows.push({ label: 'Total do pedido', value: `R$ ${p.order.total.toFixed(2)}` });
  }
  // Nota de servico da entrega (existe 1 por pedido-entrega, aparece em qualquer payout do mesmo pedido)
  if (invoice?._id) {
    rows.push({
      label: 'Nota de Servico',
      value: linkValue(invoice.invoiceNumber || 'Ver nota', `/invoice/${invoice._id}`, router),
    });
  }

  // Destino (recipiente do payout)
  rows.push({ label: 'DESTINO', value: '', highlight: 'neutral' });
  rows.push({ label: 'Tipo', value: p.recipientType === 'store' ? 'Loja' : 'Motoboy' });
  if (p.recipient?.name) {
    if (p.recipientType === 'store') {
      rows.push({
        label: 'Loja',
        value: linkValue(p.recipient.name, `/stores/${p.recipient.id}`, router),
      });
      if (p.recipient.ownerName && p.recipient.ownerId) {
        rows.push({
          label: 'Dono',
          value: linkValue(p.recipient.ownerName, `/user/${p.recipient.ownerId}`, router),
        });
      }
      if (p.recipient.ownerEmail) rows.push({ label: 'Email dono', value: p.recipient.ownerEmail });
    } else {
      rows.push({
        label: 'Motoboy',
        value: linkValue(p.recipient.name, `/user/${p.recipient.id}`, router),
      });
      if (p.recipient.email) rows.push({ label: 'Email', value: p.recipient.email });
    }
  } else {
    rows.push({ label: 'ID destinatario', value: p.recipientId, mono: true });
  }

  // Datas e status
  rows.push({ label: 'DATAS', value: '', highlight: 'neutral' });
  rows.push({ label: 'Criado em', value: new Date(p.createdAt).toLocaleString('pt-BR') });
  if (p.releasedAt) rows.push({ label: 'Liberado em', value: new Date(p.releasedAt).toLocaleString('pt-BR'), highlight: 'info' as const });
  if (p.paidAt) rows.push({ label: 'Pago em', value: new Date(p.paidAt).toLocaleString('pt-BR'), highlight: 'success' as const });

  // Gateway
  if (p.gatewayProvider || p.gatewayTransferId) {
    rows.push({ label: 'GATEWAY', value: '', highlight: 'neutral' });
    if (p.gatewayProvider) rows.push({ label: 'Provedor', value: p.gatewayProvider });
    if (p.gatewayTransferId) rows.push({ label: 'Transfer ID', value: p.gatewayTransferId, mono: true });
  }

  // Bloqueio
  if (p.blocked) {
    rows.push({ label: 'BLOQUEIO', value: '', highlight: 'danger' });
    rows.push({ label: 'Motivo', value: p.blockReason || 'Sem motivo', highlight: 'danger' as const });
  }

  rows.push({ label: 'ID Payout', value: p._id, mono: true });

  return rows;
}
