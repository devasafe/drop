import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import api from '../../lib/api';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import styles from './AdminWallets.module.css';

interface WalletData {
  _id: string;
  owner: string;
  userId?: string;
  balance: number | null;
  totalIncome?: number | null;
  totalSpent?: number | null;
  totalWithdrawn?: number | null;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  createdAt?: string;
  hasAccess?: boolean;
}

interface AccessRequest {
  _id: string;
  targetUserId: any;
  status: 'pending' | 'approved' | 'rejected' | 'expired' | 'revoked';
  reason: string;
  expiresAt: string | null;
  createdAt: string;
}

interface Transaction {
  _id?: string;
  type: 'credit' | 'debit' | 'withdrawal' | 'refund';
  category?: 'deposit' | 'withdrawal' | 'payment' | 'refund' | 'transfer';
  amount: number;
  description?: string;
  reason?: string;
  paymentMethod?: string;
  status: 'completed' | 'pending' | 'failed';
  createdAt: string;
}

export default function AdminWalletsPanel() {
  const auth = useAuth();
  const { user, token } = auth || {};
  const [wallets, setWallets] = useState<WalletData[]>([]);
  const [selectedWallet, setSelectedWallet] = useState<WalletData | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [pageLoading, setPageLoading] = useState(true);
  const [txLoading, setTxLoading] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterRole, setFilterRole] = useState('all');
  const [showAddBalance, setShowAddBalance] = useState(false);
  const [addAmount, setAddAmount] = useState('');
  const [addReason, setAddReason] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [outgoing, setOutgoing] = useState<AccessRequest[]>([]);
  const [requestModal, setRequestModal] = useState<WalletData | null>(null);
  const [requestReason, setRequestReason] = useState('');
  const [requestLoading, setRequestLoading] = useState(false);

  const loadOutgoing = async () => {
    try {
      const res = await api.get('/wallet-access/outgoing');
      setOutgoing(res.data?.requests || []);
    } catch {
      setOutgoing([]);
    }
  };

  useEffect(() => {
    if (user) loadOutgoing();
  }, [user]);

  const getRequestStatus = (targetUserId: string): AccessRequest | null => {
    const rel = outgoing.filter(r => {
      const tid = typeof r.targetUserId === 'string' ? r.targetUserId : r.targetUserId?._id;
      return String(tid) === String(targetUserId);
    });
    if (!rel.length) return null;
    return rel.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];
  };

  const submitAccessRequest = async () => {
    if (!requestModal || requestReason.trim().length < 5) {
      alert('Justificativa obrigatória (mín. 5 caracteres)');
      return;
    }
    setRequestLoading(true);
    try {
      await api.post('/wallet-access/request', {
        targetUserId: requestModal.userId || requestModal.owner,
        reason: requestReason.trim(),
      });
      alert('Solicitação enviada ao cliente');
      setRequestModal(null);
      setRequestReason('');
      await loadOutgoing();
    } catch (err: any) {
      alert(err.response?.data?.error || 'Erro ao enviar solicitação');
    } finally {
      setRequestLoading(false);
    }
  };

  // Carregar carteiras
  useEffect(() => {
    const loadWallets = async () => {
      try {
        const res = await api.get('/admin/wallets');
        console.log('Carteiras carregadas:', res.data);
        setWallets(res.data || []);
      } catch (err) {
        console.error('Erro ao carregar carteiras:', err);
      } finally {
        setPageLoading(false);
      }
    };

    if (user) {
      loadWallets();
    } else {
      setPageLoading(false);
    }
  }, [user]);

  // Carregar transações ao selecionar carteira
  const handleSelectWallet = async (wallet: WalletData) => {
    if (!wallet.hasAccess) {
      setRequestModal(wallet);
      return;
    }
    setSelectedWallet(wallet);
    setTxLoading(true);
    try {
      const res = await api.get(`/admin/wallets/${wallet._id}/transactions`);
      setTransactions(res.data || []);
    } catch (err: any) {
      if (err.response?.status === 403) {
        alert('Acesso expirado. Solicite novamente.');
        await loadOutgoing();
      }
      console.error('Erro ao carregar transações:', err);
      setTransactions([]);
    } finally {
      setTxLoading(false);
    }
  };

  // Adicionar saldo
  const handleAddBalance = async () => {
    if (!selectedWallet || !addAmount) {
      alert('Preencha o valor');
      return;
    }

    setAddLoading(true);
    try {
      const res = await api.post(`/admin/wallets/${selectedWallet._id}/add-balance`, {
        amount: parseFloat(addAmount),
        reason: addReason || 'Adição manual de saldo'
      });

      // Atualizar carteira
      setSelectedWallet({
        ...selectedWallet,
        balance: (selectedWallet.balance || 0) + parseFloat(addAmount)
      });

      // Atualizar na lista
      setWallets(wallets.map(w =>
        w._id === selectedWallet._id
          ? { ...w, balance: (w.balance || 0) + parseFloat(addAmount) }
          : w
      ));

      alert('Saldo adicionado com sucesso!');
      setAddAmount('');
      setAddReason('');
      setShowAddBalance(false);

      // Recarregar transações
      const txRes = await api.get(`/admin/wallets/${selectedWallet._id}/transactions`);
      setTransactions(txRes.data || []);
    } catch (err: any) {
      alert('Erro: ' + (err.response?.data?.message || 'Falha ao adicionar saldo'));
    } finally {
      setAddLoading(false);
    }
  };

  // Filtrar carteiras
  const filtered = wallets.filter(w => {
    const matchRole = filterRole === 'all' || w.userRole === filterRole;
    const matchSearch = !searchText ||
      w.userName?.toLowerCase().includes(searchText.toLowerCase()) ||
      w.userEmail?.toLowerCase().includes(searchText.toLowerCase());
    return matchRole && matchSearch;
  });

  // Formatar moeda
  const fmt = (val: number) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(val || 0);

  // Helper para determinar categoria e label
  const getTransactionLabel = (tx: Transaction) => {
    const category = tx.category;
    const reason = tx.reason || '';
    const type = tx.type;

    // Inferir categoria baseado em reason se não tiver category explícita
    let inferredCategory = category;
    if (!inferredCategory) {
      if (reason.includes('Carregamento') || reason.includes('Depósito')) inferredCategory = 'deposit';
      else if (reason.includes('Transferência para banco')) inferredCategory = 'withdrawal';
      else if (reason.includes('Pedido') || reason.includes('Venda')) inferredCategory = 'payment';
      else if (reason.includes('Reembolso')) inferredCategory = 'refund';
      else if (reason.includes('Transferência') && !reason.includes('para banco')) inferredCategory = 'transfer';
    }

    // Ícone
    let icon = '';
    if (inferredCategory === 'deposit') icon = 'Dep.';
    else if (inferredCategory === 'withdrawal') icon = 'Saq.';
    else if (inferredCategory === 'payment') icon = 'Pag.';
    else if (inferredCategory === 'refund' || type === 'refund') icon = 'Est.';
    else if (inferredCategory === 'transfer') icon = 'Transf.';
    else icon = type === 'credit' ? '+' : type === 'debit' ? '-' : 'Tx';

    // Label
    let label = '';
    if (inferredCategory === 'deposit') label = 'Depósito';
    else if (inferredCategory === 'withdrawal') label = 'Saque';
    else if (inferredCategory === 'payment') label = 'Pagamento';
    else if (inferredCategory === 'refund') label = 'Estorno';
    else if (inferredCategory === 'transfer') label = 'Transferência';
    else label = type === 'credit' ? 'Entrada' : type === 'debit' ? 'Retirada' : 'Transação';

    return `${icon} ${label}`;
  };

  // Helper para determinar método de pagamento
  const getPaymentMethod = (tx: Transaction) => {
    if (!tx.paymentMethod) return '';

    const methods: Record<string, string> = {
      'credit_card': 'Cartão',
      'pix': 'PIX',
      'bank_transfer': 'Transferência Bancária',
      'wallet': 'Carteira',
      'wallet_transfer': 'Transferência de Carteira',
      'refund': 'Reembolso'
    };

    return methods[tx.paymentMethod] || tx.paymentMethod;
  };

  if (pageLoading) {
    return (
      <ProtectedRoute required_permission="wallet:view_all">
        <div className={styles.loadingScreen}>
          <LoadingSkeleton variant="dashboard" />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute required_permission="wallet:view_all">
      <div className={styles.page}>
        {/* HEADER */}
        <div className={styles.header}>
          <h1 className={styles.pageTitle}>
            <Icon name="wallet" size={20} /> Gerenciar Carteiras
          </h1>
          <p className={styles.headerSub}>
            Total: <strong>{wallets.length}</strong> carteira{wallets.length !== 1 ? 's' : ''} no sistema
          </p>
          <div style={{
            marginTop: 10, padding: '10px 14px', borderRadius: 10,
            background: 'rgba(56,189,248,0.10)', border: '1px solid rgba(56,189,248,0.4)',
            color: 'rgba(255,255,255,0.8)', fontSize: 13, lineHeight: 1.5,
          }}>
            <Icon name="info" size={14} /> Página de <b>auditoria/consulta</b>. No modo Asaas, o
            dinheiro de pedidos e repasses fica nas <b>subcontas do gateway</b> (não nesta carteira).
            Adicionar valor aqui credita apenas <b>cashback/recarga</b> na carteira interna — não
            transfere dinheiro real.
          </div>
        </div>

        {/* CONTAINER 2 COLUNAS */}
        <div className={selectedWallet ? styles.gridSplit : styles.grid}>

          {/* COLUNA ESQUERDA - LISTA */}
          <div>
            {/* FILTROS */}
            <div className={styles.filtersCard}>
              <input
                type="text"
                placeholder="Buscar por nome ou email..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                className={styles.filterInput}
              />

              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                className={styles.filterSelect}
              >
                <option value="all">Todos os Papéis</option>
                <option value="cliente">Clientes</option>
                <option value="lojista">Lojistas</option>
                <option value="motoboy">Motoboys</option>
                <option value="ceo">CEOs</option>
              </select>
            </div>

            {/* TABELA */}
            <div className={styles.tableWrapper}>
              {filtered.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyIcon}><Icon name="mail" size={24} /></div>
                  <p className={styles.emptyText}>Nenhuma carteira encontrada</p>
                </div>
              ) : (
                <table className={styles.table}>
                  <thead className={styles.thead}>
                    <tr>
                      <th className={styles.th}>Usuário</th>
                      <th className={styles.thRight}>Saldo</th>
                      <th className={styles.thRight}>Gastos</th>
                      <th className={styles.thCenter}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((w) => {
                      const targetId = String(w.userId || w.owner);
                      const reqStatus = getRequestStatus(targetId);
                      const hasAccess = w.hasAccess;
                      let accessLabel = 'Solicitar acesso';
                      if (hasAccess && reqStatus?.expiresAt) {
                        accessLabel = `Até ${new Date(reqStatus.expiresAt).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}`;
                      } else if (reqStatus?.status === 'pending') {
                        accessLabel = 'Aguardando';
                      } else if (reqStatus?.status === 'rejected') {
                        accessLabel = 'Rejeitado';
                      } else if (reqStatus?.status === 'expired' || reqStatus?.status === 'revoked') {
                        accessLabel = 'Solicitar novamente';
                      }
                      return (
                        <tr
                          key={w._id}
                          onClick={() => handleSelectWallet(w)}
                          className={selectedWallet?._id === w._id ? styles.trActive : styles.tr}
                        >
                          <td className={styles.td}>
                            <div className={styles.userName}>{w.userName || 'Sem nome'}</div>
                            <div className={styles.userEmail}>{w.userEmail || 'N/A'}</div>
                          </td>
                          <td className={`${styles.tdRight} ${styles.balanceCell}`}>
                            {hasAccess ? fmt(w.balance || 0) : '••••'}
                          </td>
                          <td className={styles.tdRight}>
                            {hasAccess ? fmt(w.totalSpent || 0) : '••••'}
                          </td>
                          <td className={styles.tdCenter}>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                if (hasAccess) handleSelectWallet(w);
                                else setRequestModal(w);
                              }}
                              disabled={reqStatus?.status === 'pending'}
                              className={selectedWallet?._id === w._id ? styles.btnViewActive : styles.btnView}
                            >
                              {hasAccess ? (selectedWallet?._id === w._id ? '✓' : 'Ver') : accessLabel}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* COLUNA DIREITA - DETALHES */}
          {selectedWallet && (
            <div>
              {/* CARD GRADIENT */}
              <div className={styles.detailCard}>
                <div>
                  <p className={styles.detailUserLabel}>USUÁRIO</p>
                  <h2 className={styles.detailUserName}>
                    {selectedWallet.userName || 'Usuário'}
                  </h2>
                  <p className={styles.detailUserEmail}>
                    {selectedWallet.userEmail || 'N/A'}
                  </p>
                </div>

                <div className={styles.detailStatsRow}>
                  <div>
                    <p className={styles.detailStatLabel}>Saldo Atual</p>
                    <p className={styles.detailStatValue}>
                      {fmt(selectedWallet.balance || 0)}
                    </p>
                  </div>
                  <div>
                    <p className={styles.detailStatLabel}>Gasto Total</p>
                    <p className={styles.detailStatValue}>
                      {fmt(selectedWallet.totalSpent || 0)}
                    </p>
                  </div>
                </div>
              </div>

              {/* BOTÃO ADICIONAR SALDO */}
              <button
                onClick={() => setShowAddBalance(!showAddBalance)}
                className={styles.btnAddBalance}
              >
                {showAddBalance ? 'Cancelar' : <><Icon name="plus" size={14} /> Adicionar Cashback</>}
              </button>

              {/* FORMULÁRIO ADICIONAR CASHBACK/RECARGA (carteira interna, não Asaas) */}
              {showAddBalance && (
                <div className={styles.addBalanceForm}>
                  <h3 className={styles.addBalanceTitle}>
                    <Icon name="plus" size={14} /> Adicionar Cashback / Recarga
                  </h3>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: '0 0 10px' }}>
                    Crédito na carteira interna (cashback/recarga voluntária). Não movimenta
                    dinheiro real do gateway.
                  </p>

                  <div className={styles.formField}>
                    <label className={styles.formLabel}>
                      Quanto deseja adicionar?
                    </label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={addAmount}
                      onChange={(e) => setAddAmount(e.target.value)}
                      min="0.01"
                      step="0.01"
                      className={styles.formInput}
                    />
                  </div>

                  <div className={styles.formField}>
                    <label className={styles.formLabel}>
                      Motivo (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Descreva o motivo da adição"
                      value={addReason}
                      onChange={(e) => setAddReason(e.target.value)}
                      className={styles.formInput}
                    />
                  </div>

                  <button
                    onClick={handleAddBalance}
                    disabled={addLoading || !addAmount}
                    className={styles.btnConfirm}
                  >
                    {addLoading ? 'Processando...' : 'Confirmar Adição'}
                  </button>
                </div>
              )}

              {/* GRID STATS */}
              <div className={styles.statsGrid}>
                <div className={styles.statCard}>
                  <p className={styles.statLabel}>Total Gasto</p>
                  <p className={styles.statValueDanger}>
                    {fmt(selectedWallet.totalSpent || 0)}
                  </p>
                </div>
                <div className={styles.statCard}>
                  <p className={styles.statLabel}>Saques</p>
                  <p className={styles.statValueWarning}>
                    {fmt(selectedWallet.totalWithdrawn || 0)}
                  </p>
                </div>
              </div>

              {/* TRANSAÇÕES */}
              <div className={styles.txCard}>
                <h3 className={styles.txTitle}>
                  <Icon name="clipboard" size={16} /> Últimas Transações
                </h3>

                {txLoading ? (
                  <div className={styles.txLoading}>
                    <LoadingSkeleton variant="list" count={3} />
                  </div>
                ) : transactions.length === 0 ? (
                  <div className={styles.txEmpty}>
                    Nenhuma transação encontrada
                  </div>
                ) : (
                  <div className={styles.txList}>
                    {transactions.map((tx, idx) => (
                      <div
                        key={tx._id || idx}
                        className={idx < transactions.length - 1 ? styles.txRow : styles.txRowLast}
                      >
                        <div className={styles.txInfo}>
                          <p className={styles.txLabel}>
                            {getTransactionLabel(tx)}
                            {tx.paymentMethod && ` via ${getPaymentMethod(tx)}`}
                          </p>
                          <p className={styles.txMeta}>
                            {tx.reason && <span>{tx.reason}</span>}
                            {tx.reason && ' • '}
                            {new Date(tx.createdAt).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div className={styles.txAmountRight}>
                          <p className={tx.type === 'credit' || tx.type === 'refund' ? styles.txAmountCredit : styles.txAmountDebit}>
                            {tx.type === 'credit' || tx.type === 'refund' ? '+' : '-'}
                            {fmt(tx.amount)}
                          </p>
                          <p className={styles.txStatus}>
                            {tx.status === 'completed' ? 'OK' : tx.status === 'pending' ? 'Pendente' : 'Falhou'}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* MODAL: Solicitar acesso */}
        {requestModal && (
          <div
            onClick={() => !requestLoading && setRequestModal(null)}
            style={{
              position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000, padding: 16
            }}
          >
            <div
              onClick={e => e.stopPropagation()}
              style={{
                background: 'var(--drop-surface)', border: '1px solid var(--drop-border)',
                borderRadius: 'var(--drop-radius-lg)', padding: 24, maxWidth: 440, width: '100%',
                color: 'var(--drop-white)', fontFamily: 'var(--drop-font-body)'
              }}
            >
              <h3 style={{ margin: '0 0 8px 0', fontSize: 18, fontFamily: 'var(--drop-font-display)' }}>
                <Icon name="lock" size={16} /> Solicitar acesso à carteira
              </h3>
              <p style={{ margin: '0 0 16px 0', fontSize: 13, color: 'var(--drop-text-muted)' }}>
                Cliente: <strong>{requestModal.userName}</strong>. O pedido será enviado com sua justificativa; o cliente precisa aprovar.
              </p>
              <label style={{ display: 'block', fontSize: 12, marginBottom: 6, color: 'var(--drop-text-muted)' }}>
                Justificativa (obrigatório)
              </label>
              <textarea
                value={requestReason}
                onChange={e => setRequestReason(e.target.value)}
                rows={4}
                placeholder="Ex.: investigando reclamação #123 sobre débito indevido..."
                style={{
                  width: '100%', background: 'rgba(255,255,255,0.04)',
                  border: '1px solid var(--drop-border)', borderRadius: 'var(--drop-radius-sm)',
                  color: 'var(--drop-white)', padding: 10, fontSize: 14, resize: 'vertical',
                  fontFamily: 'var(--drop-font-body)', boxSizing: 'border-box', outline: 'none'
                }}
              />
              <div style={{ display: 'flex', gap: 8, marginTop: 16, justifyContent: 'flex-end' }}>
                <button
                  onClick={() => setRequestModal(null)}
                  disabled={requestLoading}
                  style={{
                    padding: '10px 16px', background: 'transparent',
                    border: '1px solid var(--drop-border)', borderRadius: 'var(--drop-radius-sm)',
                    color: 'var(--drop-white)', cursor: 'pointer', fontSize: 14
                  }}
                >
                  Cancelar
                </button>
                <button
                  onClick={submitAccessRequest}
                  disabled={requestLoading || requestReason.trim().length < 5}
                  style={{
                    padding: '10px 16px', background: 'var(--drop-purple)',
                    border: 'none', borderRadius: 'var(--drop-radius-sm)',
                    color: 'var(--drop-white)', cursor: 'pointer', fontSize: 14, fontWeight: 600,
                    opacity: (requestLoading || requestReason.trim().length < 5) ? 0.5 : 1
                  }}
                >
                  {requestLoading ? 'Enviando...' : 'Enviar solicitação'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
