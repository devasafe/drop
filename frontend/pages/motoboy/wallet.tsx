import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import TransactionDetailsModal, { DetailRow } from '../../components/TransactionDetailsModal';
import styles from './MotoboyWallet.module.css';

interface MototboyWallet {
  _id: string;
  owner: string;
  ownerType: 'user';
  balance: number;
  totalIncome: number;
  totalSpent: number;
  availableBalance: number;
  pendingBalance: number;
  freeDeliveriesAvailable?: number;
  discountPercentage?: number;
}

interface PayoutItem {
  _id: string;
  amount: number;
  status: 'pending' | 'released' | 'requested' | 'paid' | 'cancelled';
  orderId: string;
  createdAt: string;
}

interface HistoryItem {
  date: string;
  type: 'credit' | 'debit';
  amount: number;
  reason: string;
  relatedId?: string;
}

export default function MototboyWalletPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [transferring, setTransferring] = useState(false);
  const [wallet, setWallet] = useState<MototboyWallet | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'saldo' | 'historico' | 'payouts' | 'beneficios' | 'sacar'>('saldo');
  const [payouts, setPayouts] = useState<PayoutItem[]>([]);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedTx, setSelectedTx] = useState<
    | { kind: 'payout'; data: PayoutItem; orderInfo?: any; invoice?: any }
    | { kind: 'history'; data: HistoryItem }
    | null
  >(null);

  const handlePayoutClick = async (p: PayoutItem) => {
    setSelectedTx({ kind: 'payout', data: p });
    if (!p.orderId) return;

    // Busca em paralelo: pedido + nota de servico
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


  useEffect(() => {
    const fetchWallet = async () => {
      try {
        const motoboyId = user?._id || user?.id;
        if (!motoboyId) return;
        setFetchError(null);

        // Carteira de repasse do motoboy (ownerType='motoboy')
        const walletRes = await api.get(`/wallets/motoboy/${motoboyId}`);
        setWallet(walletRes.data);

        // Buscar histórico da mesma carteira
        try {
          const historyRes = await api.get(`/wallets/${motoboyId}/history?limit=30`);
          setHistory(historyRes.data.history || []);
        } catch (e) { /* history opcional */ }

        // Buscar payouts
        try {
          const payoutsRes = await api.get('/payouts/my');
          setPayouts(payoutsRes.data.payouts || []);
        } catch { /* ignore */ }
      } catch (err: any) {
        const status = err?.response?.status;
        const data = err?.response?.data;
        const msg = data?.error || err?.message || 'Erro desconhecido';
        console.error('Erro ao buscar carteira do motoboy:', status, data, err);
        setFetchError(`[${status ?? 'NET'}] ${msg}`);
      } finally {
        setLoading(false);
      }
    };

    fetchWallet();
  }, [(user?._id || user?.id)]);

  const handleTransferToOwner = async () => {
    const motoboyId = user?._id || user?.id;
    if (!motoboyId) return;
    const available = wallet?.availableBalance ?? 0;
    if (available <= 0) {
      alert('Nenhum saldo disponível para transferir');
      return;
    }
    if (!confirm(`Transferir R$ ${available.toFixed(2)} da carteira de motoboy para a sua carteira pessoal? De lá você poderá sacar para o banco.`)) return;
    setTransferring(true);
    try {
      const res = await api.post(`/wallets/motoboy/${motoboyId}/transfer-to-owner`);
      alert(`R$ ${res.data.transferred.toFixed(2)} transferidos! Vá em "Minha Carteira" para sacar para o banco.`);
      // Recarrega dados
      const walletRes = await api.get(`/wallets/motoboy/${motoboyId}`);
      setWallet(walletRes.data);
      try {
        const payoutsRes = await api.get('/payouts/my');
        setPayouts(payoutsRes.data.payouts || []);
      } catch { /* ignore */ }
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao transferir');
    } finally {
      setTransferring(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute required_role="motoboy">
        <div className={styles.loadingScreen}>
          <LoadingSkeleton variant="dashboard" />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.pageTitle}><Icon name="motorcycle" size={20} /> Minha Carteira</h1>
          <p className={styles.pageSubtitle}>Ganhos e benefícios de entrega</p>
        </div>

        {/* Erro de fetch */}
        {fetchError && (
          <div style={{
            background: 'rgba(239,68,68,0.12)',
            border: '1px solid rgba(239,68,68,0.4)',
            color: '#EF4444',
            padding: '12px 16px',
            borderRadius: 10,
            marginBottom: 16,
            fontSize: 13,
            fontFamily: 'monospace',
          }}>
            Erro ao carregar carteira: {fetchError}
          </div>
        )}

        {/* Saldo Principal */}
        {wallet && (
          <div className={styles.balanceCard}>
            <div className={styles.balanceGrid}>
              <div>
                <p className={styles.balanceLabel}>DISPONIVEL PARA SAQUE</p>
                <h2 className={styles.balanceAmount}>
                  R$ {(wallet.availableBalance ?? wallet.balance).toFixed(2)}
                </h2>
              </div>
              <div>
                <p className={styles.balanceLabel}>PENDENTE</p>
                <h2 className={styles.balanceAmountSm} style={{ color: '#f59e0b' }}>
                  R$ {(wallet.pendingBalance ?? 0).toFixed(2)}
                </h2>
              </div>
              <div>
                <p className={styles.balanceLabel}>TOTAL GANHO</p>
                <h2 className={styles.balanceAmountSm}>
                  R$ {wallet.totalIncome.toFixed(2)}
                </h2>
              </div>
              <div>
                <p className={styles.balanceLabel}>ENTREGA GRATIS</p>
                <h2 className={styles.balanceAmountSm}>
                  {wallet.freeDeliveriesAvailable || 0}x
                </h2>
                <p className={styles.balanceSub}>
                  {wallet.discountPercentage || 0}% desc.
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Abas */}
        <div className={styles.tabs}>
          {(['saldo', 'historico', 'payouts', 'beneficios', 'sacar'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={activeTab === tab ? `${styles.tabBtn} ${styles.tabBtnActive}` : styles.tabBtn}
            >
              {tab === 'saldo' && 'Saldo'}
              {tab === 'historico' && 'Historico'}
              {tab === 'payouts' && 'Payouts'}
              {tab === 'beneficios' && 'Beneficios'}
              {tab === 'sacar' && 'Sacar'}
            </button>
          ))}
        </div>

        {/* Conteúdo */}
        {activeTab === 'saldo' && wallet && (
          <div className={styles.saldoGrid}>
            <div className={styles.ganhoCard}>
              <h3 className={styles.ganhoTitle}><Icon name="money" size={16} /> Seu Ganho</h3>
              <div className={styles.ganhoAmount}>
                R$ {wallet.balance.toFixed(2)}
              </div>
              <p className={styles.ganhoNote}>
                Valor pronto para sacar da sua carteira
              </p>
              <button
                onClick={() => setActiveTab('sacar')}
                className={styles.btnSacarNow}
              >
                <Icon name="bank" size={14} /> Sacar Agora
              </button>
            </div>

            <div className={styles.statsSubGrid}>
              <div className={styles.statCard}>
                <p className={styles.statLabel}>TOTAL GANHO MÊS</p>
                <h3 className={styles.statValue}>
                  R$ {wallet.totalIncome.toFixed(2)}
                </h3>
              </div>

              <div className={styles.statCard}>
                <p className={styles.statLabel}>GANHO POR ENTREGA</p>
                <h3 className={styles.statValueGreen}>
                  ~R$ {wallet.totalIncome > 0 ? (wallet.totalIncome / 20).toFixed(2) : '0.00'}
                </h3>
                <p className={styles.statNote}>R$7 + distância + bônus</p>
              </div>
            </div>
          </div>
        )}

        {/* Aba Payouts */}
        {activeTab === 'payouts' && (
          <div className={styles.historyCard}>
            {payouts.length === 0 ? (
              <p style={{ textAlign: 'center', padding: 24, opacity: 0.5 }}>Nenhum payout encontrado</p>
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
                      <td className={styles.txCell}>{new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
                      <td className={styles.txCell} style={{ fontFamily: 'monospace', fontSize: 11 }}>{p.orderId?.slice(-6)}</td>
                      <td className={styles.txCell}>R$ {p.amount.toFixed(2)}</td>
                      <td className={styles.txCell}>
                        <span style={{
                          padding: '2px 8px', borderRadius: 999, fontSize: 11, fontWeight: 600,
                          background: p.status === 'paid' ? 'rgba(34,197,94,0.15)' : p.status === 'released' ? 'rgba(59,130,246,0.15)' : p.status === 'pending' ? 'rgba(245,158,11,0.15)' : p.status === 'requested' ? 'rgba(139,92,246,0.15)' : 'rgba(239,68,68,0.15)',
                          color: p.status === 'paid' ? '#22C55E' : p.status === 'released' ? '#3B82F6' : p.status === 'pending' ? '#F59E0B' : p.status === 'requested' ? '#8B5CF6' : '#EF4444',
                        }}>
                          {p.status === 'pending' ? 'Pendente' : p.status === 'released' ? 'Disponivel' : p.status === 'requested' ? 'Saque solicitado' : p.status === 'paid' ? 'Pago' : 'Cancelado'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'historico' && (
          <div className={styles.historyCard}>
            {payouts.length === 0 && history.length === 0 ? (
              <div className={styles.emptyHistory}>
                <p className={styles.emptyHistoryText}>Nenhuma entrega ainda</p>
              </div>
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
                  {/* Repasses por entrega */}
                  {payouts.map((p) => (
                    <tr
                      key={p._id}
                      className={styles.historyTr}
                      style={{ cursor: 'pointer' }}
                      onClick={() => handlePayoutClick(p)}
                    >
                      <td className={styles.historyTd}>{new Date(p.createdAt).toLocaleDateString('pt-BR')}</td>
                      <td className={styles.historyTd} style={{ fontFamily: 'monospace', fontSize: 11 }}>
                        #{p.orderId?.slice(-6)}
                      </td>
                      <td className={styles.historyTd}>
                        <span className={styles.amountCredit}>+ R$ {p.amount.toFixed(2)}</span>
                      </td>
                      <td className={styles.historyTd}>
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
                      className={styles.historyTr}
                      style={{ cursor: 'pointer' }}
                      onClick={() => setSelectedTx({ kind: 'history', data: item })}
                    >
                      <td className={styles.historyTd}>{new Date(item.date).toLocaleDateString('pt-BR')}</td>
                      <td className={styles.historyTd} style={{ fontSize: 11, opacity: 0.5 }}>—</td>
                      <td className={styles.historyTd}>
                        <span className={styles.amountDebit}>− R$ {item.amount.toFixed(2)}</span>
                      </td>
                      <td className={styles.historyTd}>
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

        {activeTab === 'beneficios' && wallet && (
          <div className={styles.beneficiosGrid}>
            <div className={styles.beneficioFree}>
              <h3 className={styles.beneficioTitle}><Icon name="gift" size={16} /> Entregas Grátis</h3>
              <div className={styles.beneficioValue}>
                {wallet.freeDeliveriesAvailable || 0}x
              </div>
              <p className={styles.beneficioNote}>
                Você tem {wallet.freeDeliveriesAvailable || 0} entregas com taxa de entrega grátis que pode usar
              </p>
            </div>

            <div className={styles.beneficioDiscount}>
              <h3 className={styles.beneficioTitle}><Icon name="percent" size={16} /> Desconto</h3>
              <div className={styles.beneficioValue}>
                {wallet.discountPercentage || 0}%
              </div>
              <p className={styles.beneficioNote}>
                Desconto permanente em todas as suas compras no app
              </p>
            </div>
          </div>
        )}

        {activeTab === 'sacar' && (
          <div className={styles.sacarContainer}>
            <h3 className={styles.sacarTitle}><Icon name="bank" size={16} /> Sacar ganhos</h3>

            <p style={{ fontSize: 13, color: 'var(--drop-text-dim)', lineHeight: 1.5, margin: '8px 0 16px' }}>
              O saque pro banco é feito pela sua carteira pessoal. Primeiro transfira o saldo disponível da carteira de motoboy pra lá, depois use "Minha Carteira" pra sacar pro banco.
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <button
                onClick={handleTransferToOwner}
                disabled={(wallet?.availableBalance ?? 0) <= 0 || transferring}
                className={styles.btnPrimary}
              >
                {transferring
                  ? 'Transferindo...'
                  : `Transferir R$ ${(wallet?.availableBalance ?? 0).toFixed(2)} para Minha Carteira`}
              </button>

              <button
                onClick={() => router.push('/my-wallet')}
                className={styles.btnSacarNow}
              >
                <Icon name="bank" size={14} /> Ir para Minha Carteira
              </button>
            </div>

            <div className={styles.warningNote} style={{ marginTop: 16 }}>
              <Icon name="clock" size={14} /> A transferência é instantânea. Saques pro banco a partir da carteira pessoal são processados em até 2 dias úteis.
            </div>
          </div>
        )}
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

        // Nota de Servico (se existir) - link primario
        if (invoice?._id) {
          details.push({
            label: 'Nota de Servico',
            value: link(invoice.invoiceNumber || 'Ver nota', `/invoice/${invoice._id}`),
          });
        }

        // Pedido (clicavel) - backup / referencia
        details.push({
          label: 'Pedido',
          value: link(`#${p.orderId?.slice(-6)}`, `/order/${p.orderId}`),
        });

        // Loja
        if (oi?.storeName || oi?.storeObj?.name) {
          details.push({ label: 'Loja', value: oi.storeObj?.name || oi.storeName });
          if (oi.storeObj?.address) {
            details.push({ label: 'Endereco Loja', value: oi.storeObj.address });
          }
        }

        // Cliente
        if (oi?.customerName || oi?.customerObj?.name) {
          details.push({ label: 'Cliente', value: oi.customerObj?.name || oi.customerName });
        }

        // Endereco de entrega
        const addr = oi?.customerAddress || oi?.customerObj?.mainAddress || oi?.customerObj?.addresses?.[0];
        if (addr) {
          details.push({
            label: 'Entrega em',
            value: `${addr.street || ''}, ${addr.number || ''}, ${addr.neighborhood || ''}, ${addr.city || ''}`,
          });
        }

        // Distancia
        if (oi?.deliveryDistance) {
          details.push({ label: 'Distancia', value: `${oi.deliveryDistance.toFixed(1)} km` });
        }

        // Delivery info
        if (oi?.delivery) {
          if (oi.delivery.pickedAt) {
            details.push({ label: 'Retirado', value: new Date(oi.delivery.pickedAt).toLocaleString('pt-BR') });
          }
          if (oi.delivery.deliveredAt) {
            details.push({ label: 'Entregue', value: new Date(oi.delivery.deliveredAt).toLocaleString('pt-BR'), highlight: 'success' as const });
          }
        }

        // Payout info
        details.push({ label: 'ID Payout', value: p._id, mono: true });
        details.push({ label: 'Criado em', value: new Date(p.createdAt).toLocaleString('pt-BR') });

        // Subtitle
        const subtitle = oi?.storeName || oi?.storeObj?.name
          ? `Entrega para ${oi.storeObj?.name || oi.storeName}`
          : `Pedido #${p.orderId?.slice(-6) || '—'}`;

        return (
          <TransactionDetailsModal
            isOpen={true}
            onClose={() => setSelectedTx(null)}
            title="Detalhes do Repasse"
            subtitle={subtitle}
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
