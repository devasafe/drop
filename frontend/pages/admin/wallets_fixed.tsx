import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import ProtectedRoute from '../../components/ProtectedRoute';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import api from '../../lib/api';

interface WalletData {
  _id: string;
  owner: string;
  balance: number;
  totalIncome?: number;
  totalSpent?: number;
  totalWithdrawn?: number;
  userName?: string;
  userEmail?: string;
  userRole?: string;
  createdAt?: string;
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

  // Carregar carteiras
  useEffect(() => {
    const loadWallets = async () => {
      try {
        const res = await api.get('/admin/wallets');
        console.log('✅ Carteiras carregadas:', res.data);
        setWallets(res.data || []);
      } catch (err) {
        console.error('❌ Erro ao carregar carteiras:', err);
      } finally {
        setPageLoading(false);
      }
    };

    if (user && token) {
      loadWallets();
    } else {
      setPageLoading(false);
    }
  }, [user, token]);

  // Carregar transações ao selecionar carteira
  const handleSelectWallet = async (wallet: WalletData) => {
    setSelectedWallet(wallet);
    setTxLoading(true);
    try {
      const res = await api.get(`/admin/wallets/${wallet._id}/transactions`);
      setTransactions(res.data || []);
    } catch (err) {
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
    if (inferredCategory === 'deposit') icon = '+';
    else if (inferredCategory === 'withdrawal') icon = '−';
    else if (inferredCategory === 'payment') icon = '•';
    else if (inferredCategory === 'refund' || type === 'refund') icon = '↩';
    else if (inferredCategory === 'transfer') icon = '→';
    else icon = type === 'credit' ? '+' : type === 'debit' ? '−' : '•';
    
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
      <ProtectedRoute required_role="ceo,gerente_geral">
        <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
          <LoadingSkeleton variant="dashboard" />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute required_role="ceo,gerente_geral">
      <div style={{ 
        maxWidth: '1600px', 
        margin: '0 auto', 
        padding: '40px 20px',
        background: '#f8f9fa',
        minHeight: '100vh'
      }}>
        {/* HEADER */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ margin: 0, fontSize: '32px', fontWeight: 'bold', color: '#1f2937' }}>
            <Icon name="wallet" size={24} /> Gerenciar Carteiras
          </h1>
          <p style={{ margin: '8px 0 0 0', color: '#6b7280', fontSize: '14px' }}>
            Total: <strong>{wallets.length}</strong> carteira{wallets.length !== 1 ? 's' : ''} no sistema
          </p>
        </div>

        {/* CONTAINER 2 COLUNAS */}
        <div style={{ display: 'grid', gridTemplateColumns: selectedWallet ? '1fr 1fr' : '1fr', gap: '24px' }}>
          
          {/* COLUNA ESQUERDA - LISTA */}
          <div>
            {/* FILTROS */}
            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '20px',
              background: '#fff',
              padding: '16px',
              borderRadius: '12px',
              boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
            }}>
              <input
                type="text"
                placeholder="Buscar por nome ou email..."
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontFamily: 'inherit'
                }}
              />

              <select
                value={filterRole}
                onChange={(e) => setFilterRole(e.target.value)}
                style={{
                  padding: '10px 12px',
                  border: '1px solid #e5e7eb',
                  borderRadius: '8px',
                  fontSize: '13px',
                  fontFamily: 'inherit',
                  background: '#fff'
                }}
              >
                <option value="all">Todos os Papéis</option>
                <option value="cliente">Clientes</option>
                <option value="lojista">Lojistas</option>
                <option value="motoboy">Motoboys</option>
                <option value="ceo">CEOs</option>
              </select>
            </div>

            {/* TABELA */}
            <div style={{
              background: '#fff',
              borderRadius: '12px',
              overflow: 'hidden',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
              maxHeight: '650px',
              overflowY: 'auto'
            }}>
              {filtered.length === 0 ? (
                <div style={{ padding: '40px', textAlign: 'center', color: '#6b7280' }}>
                  <div style={{ fontSize: '24px', marginBottom: '8px' }}>—</div>
                  <p style={{ margin: 0 }}>Nenhuma carteira encontrada</p>
                </div>
              ) : (
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead style={{ background: '#f3f4f6', position: 'sticky', top: 0 }}>
                    <tr>
                      <th style={{ padding: '12px 16px', textAlign: 'left', fontWeight: '600', fontSize: '12px', color: '#374151', borderBottom: '2px solid #e5e7eb' }}>Usuário</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', fontSize: '12px', color: '#374151', borderBottom: '2px solid #e5e7eb' }}>Saldo</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right', fontWeight: '600', fontSize: '12px', color: '#374151', borderBottom: '2px solid #e5e7eb' }}>Gastos</th>
                      <th style={{ padding: '12px 16px', textAlign: 'center', fontWeight: '600', fontSize: '12px', color: '#374151', borderBottom: '2px solid #e5e7eb' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((w) => (
                      <tr
                        key={w._id}
                        onClick={() => handleSelectWallet(w)}
                        style={{
                          borderBottom: '1px solid #e5e7eb',
                          background: selectedWallet?._id === w._id ? '#f0f9ff' : '#fff',
                          cursor: 'pointer',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={(e) => {
                          if (selectedWallet?._id !== w._id) {
                            (e.currentTarget as HTMLTableRowElement).style.background = '#f9fafb';
                          }
                        }}
                        onMouseLeave={(e) => {
                          if (selectedWallet?._id !== w._id) {
                            (e.currentTarget as HTMLTableRowElement).style.background = '#fff';
                          }
                        }}
                      >
                        <td style={{ padding: '12px 16px', fontSize: '13px' }}>
                          <div style={{ fontWeight: '500', color: '#111827' }}>{w.userName || 'Sem nome'}</div>
                          <div style={{ fontSize: '11px', color: '#6b7280' }}>{w.userEmail || 'N/A'}</div>
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', fontWeight: '600', color: '#059669' }}>
                          {fmt(w.balance || 0)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'right', fontSize: '13px', color: '#6b7280' }}>
                          {fmt(w.totalSpent || 0)}
                        </td>
                        <td style={{ padding: '12px 16px', textAlign: 'center' }}>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              handleSelectWallet(w);
                            }}
                            style={{
                              padding: '5px 12px',
                              background: selectedWallet?._id === w._id ? '#667eea' : '#e5e7eb',
                              color: selectedWallet?._id === w._id ? '#fff' : '#374151',
                              border: 'none',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              fontSize: '11px',
                              fontWeight: '600',
                              transition: 'all 0.15s'
                            }}
                          >
                            {selectedWallet?._id === w._id ? '✓' : 'Ver'}
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* COLUNA DIREITA - DETALHES */}
          {selectedWallet && (
            <div>
              {/* CARD GRADIENT */}
              <div style={{
                background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
                borderRadius: '12px',
                padding: '32px',
                color: '#fff',
                marginBottom: '24px',
                boxShadow: '0 20px 40px rgba(102, 126, 234, 0.2)'
              }}>
                <div style={{ marginBottom: '28px' }}>
                  <p style={{ fontSize: '12px', opacity: 0.85, margin: '0 0 4px 0', fontWeight: '500' }}>USUÁRIO</p>
                  <h2 style={{ fontSize: '28px', fontWeight: 'bold', margin: 0 }}>
                    {selectedWallet.userName || 'Usuário'}
                  </h2>
                  <p style={{ fontSize: '12px', opacity: 0.8, margin: '4px 0 0 0' }}>
                    {selectedWallet.userEmail || 'N/A'}
                  </p>
                </div>

                <div style={{
                  display: 'grid',
                  gridTemplateColumns: '1fr 1fr',
                  gap: '20px',
                  paddingTop: '28px',
                  borderTop: '1px solid rgba(255,255,255,0.2)'
                }}>
                  <div>
                    <p style={{ fontSize: '11px', opacity: 0.75, margin: 0, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Saldo Atual</p>
                    <p style={{ fontSize: '32px', fontWeight: 'bold', margin: '8px 0 0 0' }}>
                      {fmt(selectedWallet.balance || 0)}
                    </p>
                  </div>
                  <div>
                    <p style={{ fontSize: '11px', opacity: 0.75, margin: 0, fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Gasto Total</p>
                    <p style={{ fontSize: '32px', fontWeight: 'bold', margin: '8px 0 0 0' }}>
                      {fmt(selectedWallet.totalSpent || 0)}
                    </p>
                  </div>
                </div>
              </div>

              {/* BOTÃO ADICIONAR SALDO */}
              <button
                onClick={() => setShowAddBalance(!showAddBalance)}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#10b981',
                  color: '#fff',
                  border: 'none',
                  borderRadius: '10px',
                  cursor: 'pointer',
                  fontWeight: '600',
                  fontSize: '14px',
                  marginBottom: '24px',
                  transition: 'background 0.2s'
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#059669')}
                onMouseLeave={(e) => (e.currentTarget.style.background = '#10b981')}
              >
                {showAddBalance ? '✕ Cancelar' : 'Adicionar Saldo'}
              </button>

              {/* FORMULÁRIO ADICIONAR SALDO */}
              {showAddBalance && (
                <div style={{
                  background: '#fff',
                  padding: '20px',
                  borderRadius: '12px',
                  marginBottom: '24px',
                  border: '2px solid #10b981'
                }}>
                  <h3 style={{ margin: '0 0 16px 0', fontSize: '16px', fontWeight: 'bold', color: '#1f2937' }}>
                    <Icon name="plus" size={14} /> Adicionar Saldo
                  </h3>

                  <div style={{ marginBottom: '12px' }}>
                    <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                      Quanto deseja adicionar?
                    </label>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={addAmount}
                      onChange={(e) => setAddAmount(e.target.value)}
                      min="0.01"
                      step="0.01"
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>

                  <div style={{ marginBottom: '16px' }}>
                    <label style={{ fontSize: '12px', color: '#6b7280', fontWeight: '600', display: 'block', marginBottom: '6px' }}>
                      Motivo (opcional)
                    </label>
                    <input
                      type="text"
                      placeholder="Descreva o motivo da adição"
                      value={addReason}
                      onChange={(e) => setAddReason(e.target.value)}
                      style={{
                        width: '100%',
                        padding: '10px 12px',
                        border: '1px solid #e5e7eb',
                        borderRadius: '8px',
                        fontSize: '13px',
                        boxSizing: 'border-box',
                        fontFamily: 'inherit'
                      }}
                    />
                  </div>

                  <button
                    onClick={handleAddBalance}
                    disabled={addLoading || !addAmount}
                    style={{
                      width: '100%',
                      padding: '10px',
                      background: addLoading || !addAmount ? '#9ca3af' : '#10b981',
                      color: '#fff',
                      border: 'none',
                      borderRadius: '8px',
                      cursor: addLoading || !addAmount ? 'not-allowed' : 'pointer',
                      fontWeight: '600',
                      fontSize: '13px'
                    }}
                  >
                    {addLoading ? 'Processando...' : 'Confirmar Adição'}
                  </button>
                </div>
              )}

              {/* GRID STATS */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '12px',
                marginBottom: '24px'
              }}>
                <div style={{
                  background: '#fff',
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb'
                }}>
                  <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 8px 0', fontWeight: '600' }}>Total Gasto</p>
                  <p style={{ fontSize: '22px', fontWeight: 'bold', margin: 0, color: '#ef4444' }}>
                    {fmt(selectedWallet.totalSpent || 0)}
                  </p>
                </div>
                <div style={{
                  background: '#fff',
                  padding: '16px',
                  borderRadius: '10px',
                  border: '1px solid #e5e7eb'
                }}>
                  <p style={{ fontSize: '11px', color: '#6b7280', margin: '0 0 8px 0', fontWeight: '600' }}>Saques</p>
                  <p style={{ fontSize: '22px', fontWeight: 'bold', margin: 0, color: '#f59e0b' }}>
                    {fmt(selectedWallet.totalWithdrawn || 0)}
                  </p>
                </div>
              </div>

              {/* TRANSAÇÕES */}
              <div style={{
                background: '#fff',
                borderRadius: '12px',
                padding: '20px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)'
              }}>
                <h3 style={{ fontSize: '14px', fontWeight: 'bold', margin: '0 0 16px 0', color: '#1f2937' }}>
                  <Icon name="clipboard" size={14} /> Últimas Transações
                </h3>

                {txLoading ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280' }}>
                    <LoadingSkeleton variant="list" count={3} />
                  </div>
                ) : transactions.length === 0 ? (
                  <div style={{ padding: '24px', textAlign: 'center', color: '#6b7280', fontSize: '13px' }}>
                    Nenhuma transação encontrada
                  </div>
                ) : (
                  <div style={{ maxHeight: '320px', overflowY: 'auto' }}>
                    {transactions.map((tx, idx) => (
                      <div
                        key={tx._id || idx}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '12px 0',
                          borderBottom: idx < transactions.length - 1 ? '1px solid #f3f4f6' : 'none'
                        }}
                      >
                        <div style={{ flex: 1 }}>
                          <p style={{ margin: 0, fontWeight: '500', color: '#111827', fontSize: '13px' }}>
                            {getTransactionLabel(tx)}
                            {tx.paymentMethod && ` via ${getPaymentMethod(tx)}`}
                          </p>
                          <p style={{ margin: '4px 0 0 0', fontSize: '11px', color: '#6b7280' }}>
                            {tx.reason && <span>{tx.reason}</span>}
                            {tx.reason && ' • '}
                            {new Date(tx.createdAt).toLocaleDateString('pt-BR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right', marginLeft: '16px' }}>
                          <p style={{
                            margin: 0,
                            fontWeight: '700',
                            fontSize: '14px',
                            color: tx.type === 'credit' || tx.type === 'refund' ? '#059669' : '#ef4444'
                          }}>
                            {tx.type === 'credit' || tx.type === 'refund' ? '+' : '-'}
                            {fmt(tx.amount)}
                          </p>
                          <p style={{ margin: '2px 0 0 0', fontSize: '10px', color: '#9ca3af' }}>
                            {tx.status === 'completed' ? '✓' : tx.status === 'pending' ? '…' : '✗'} {tx.status}
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
      </div>
    </ProtectedRoute>
  );
}
