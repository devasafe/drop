import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import ProtectedRoute from '../components/ProtectedRoute';
import Icon from '../components/Icon';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useAutoRefetch } from '../hooks/useAutoRefetch';

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

interface CreditRequest {
  amount: number;
  paymentMethod: 'pix' | 'credit_card' | 'debit_card';
  reference: string;
}

export default function WalletPage() {
  const { user } = useAuth();
  const [wallet, setWallet] = useState<WalletData | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'saldo' | 'historico' | 'carregar' | 'sacar'>('saldo');
  const [loadingAction, setLoadingAction] = useState(false);

  // Modal carregar saldo
  const [creditModal, setCreditModal] = useState(false);
  const [creditAmount, setCreditAmount] = useState('');
  const [creditMethod, setCreditMethod] = useState<'pix' | 'credit_card' | 'debit_card'>('pix');

  // Modal sacar
  const [withdrawModal, setWithdrawModal] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [bankData, setBankData] = useState({
    banco: '',
    agencia: '',
    conta: '',
    cpf: ''
  });

  // Buscar dados de carteira
  const fetchWallet = useCallback(async () => {
    try {
      if (!user?._id) return;
      
      // Buscar carteira
      const walletRes = await api.get(`/wallets/${user._id}`);
      setWallet(walletRes.data);

      // Buscar histórico
      const historyRes = await api.get(`/wallets/${user._id}/history?limit=20`);
      setHistory(historyRes.data.history || []);
    } catch (err: any) {
      console.error('Erro ao buscar carteira:', err);
    } finally {
      setLoading(false);
    }
  }, [user?._id]);

  // 🔄 Auto-refetch quando socket events chegam
  useAutoRefetch(
    ['wallet:updated', 'wallet:refund', 'wallet:transfer_completed', 'wallet:transfer_received'],
    fetchWallet
  );

  useEffect(() => {
    fetchWallet();
  }, [user?._id, fetchWallet]);

  // Carregar saldo
  const handleCredit = async () => {
    if (!creditAmount || isNaN(Number(creditAmount))) {
      alert('Insira um valor válido');
      return;
    }

    setLoadingAction(true);
    try {
      const res = await api.post(`/wallets/${user?._id}/credit`, {
        amount: Number(creditAmount),
        paymentMethod: creditMethod,
        reference: `Carregamento ${new Date().toLocaleDateString('pt-BR')}`
      });

      // Atualizar carteira
      setWallet(res.data.wallet);
      
      // Limpar modal
      setCreditAmount('');
      setCreditModal(false);
      
      alert('Saldo carregado com sucesso!');
      
      // Recarregar histórico
      const historyRes = await api.get(`/wallets/${user?._id}/history?limit=20`);
      setHistory(historyRes.data.history || []);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao carregar saldo');
    } finally {
      setLoadingAction(false);
    }
  };

  // Sacar
  const handleWithdraw = async () => {
    if (!withdrawAmount || isNaN(Number(withdrawAmount))) {
      alert('Insira um valor válido');
      return;
    }

    if (!bankData.banco || !bankData.agencia || !bankData.conta || !bankData.cpf) {
      alert('Preencha todos os dados bancários');
      return;
    }

    setLoadingAction(true);
    try {
      const res = await api.post(`/wallets/${user?._id}/transfer`, {
        amount: Number(withdrawAmount),
        bankAccount: bankData,
        reason: `Saque solicitado em ${new Date().toLocaleDateString('pt-BR')}`
      });

      // Atualizar carteira
      setWallet(res.data.wallet);
      
      // Limpar modal
      setWithdrawAmount('');
      setBankData({ banco: '', agencia: '', conta: '', cpf: '' });
      setWithdrawModal(false);
      
      alert('Saque solicitado com sucesso! Você receberá em até 2 dias úteis.');
      
      // Recarregar histórico
      const historyRes = await api.get(`/wallets/${user?._id}/history?limit=20`);
      setHistory(historyRes.data.history || []);
    } catch (err: any) {
      alert(err?.response?.data?.error || 'Erro ao sacar');
    } finally {
      setLoadingAction(false);
    }
  };

  if (loading) {
    return (
      <ProtectedRoute required_role="cliente">
        <div style={{ maxWidth: 1200, margin: '0 auto', padding: '40px 20px' }}>
          <LoadingSkeleton variant="dashboard" />
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute required_role="cliente">
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '20px' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{ fontSize: '32px', fontWeight: 'bold', margin: '0 0 8px 0' }}><Icon name="wallet" /> Minha Carteira</h1>
          <p style={{ fontSize: '15px', color: '#666', margin: 0 }}>Gerencie seu saldo e transações</p>
        </div>

        {/* Saldo Principal */}
        {wallet && (
          <div style={{
            background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
            borderRadius: '16px',
            padding: '32px',
            color: 'white',
            marginBottom: '32px',
            boxShadow: '0 10px 30px rgba(102, 126, 234, 0.3)'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '24px' }}>
              <div>
                <p style={{ fontSize: '12px', opacity: 0.9, margin: '0 0 8px 0', fontWeight: 500 }}>SALDO DISPONÍVEL</p>
                <h2 style={{ fontSize: '36px', fontWeight: 'bold', margin: 0 }}>
                  R$ {wallet.balance.toFixed(2)}
                </h2>
              </div>
              <div>
                <p style={{ fontSize: '12px', opacity: 0.9, margin: '0 0 8px 0', fontWeight: 500 }}>TOTAL CARREGADO</p>
                <h2 style={{ fontSize: '28px', fontWeight: 'bold', margin: 0 }}>
                  R$ {wallet.totalIncome.toFixed(2)}
                </h2>
              </div>
              <div>
                <p style={{ fontSize: '12px', opacity: 0.9, margin: '0 0 8px 0', fontWeight: 500 }}>TOTAL GASTO</p>
                <h2 style={{ fontSize: '28px', fontWeight: 'bold', margin: 0 }}>
                  R$ {wallet.totalSpent.toFixed(2)}
                </h2>
              </div>
            </div>
          </div>
        )}

        {/* Abas */}
        <div style={{
          display: 'flex',
          gap: '12px',
          marginBottom: '24px',
          borderBottom: '2px solid #eee',
          paddingBottom: '12px'
        }}>
          {(['saldo', 'historico', 'carregar', 'sacar'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              style={{
                padding: '12px 24px',
                border: 'none',
                background: activeTab === tab ? '#667eea' : 'transparent',
                color: activeTab === tab ? 'white' : '#666',
                borderRadius: '8px',
                cursor: 'pointer',
                fontSize: '14px',
                fontWeight: activeTab === tab ? 'bold' : 'normal',
                transition: 'all 0.2s'
              }}
            >
              {tab === 'saldo' && <><Icon name="chart-bar" size={14} /> Resumo</>}
              {tab === 'historico' && <><Icon name="clipboard" size={14} /> Histórico</>}
              {tab === 'carregar' && <><Icon name="credit-card" size={14} /> Carregar</>}
              {tab === 'sacar' && <><Icon name="bank" size={14} /> Sacar</>}
            </button>
          ))}
        </div>

        {/* Conteúdo das Abas */}
        {activeTab === 'saldo' && wallet && (
          <div style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '24px'
          }}>
            <div style={{
              background: '#f9fafb',
              padding: '24px',
              borderRadius: '12px',
              border: '1px solid #e5e7eb'
            }}>
              <h3 style={{ fontSize: '16px', fontWeight: 'bold', marginBottom: '16px' }}><Icon name="wallet" /> Saldo</h3>
              <div style={{ fontSize: '32px', fontWeight: 'bold', color: '#10b981', marginBottom: '20px' }}>
                R$ {wallet.balance.toFixed(2)}
              </div>
              <p style={{ fontSize: '12px', color: '#666', margin: '0 0 16px 0' }}>
                Quantidade de créditos disponíveis na sua carteira
              </p>
              <button
                onClick={() => setCreditModal(true)}
                style={{
                  width: '100%',
                  padding: '12px',
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  fontWeight: 'bold',
                  fontSize: '14px'
                }}
              >
                Carregar Saldo
              </button>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateRows: '1fr 1fr',
              gap: '16px'
            }}>
              <div style={{
                background: '#f0f9ff',
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid #bfdbfe'
              }}>
                <p style={{ fontSize: '12px', color: '#0369a1', fontWeight: 'bold', margin: 0 }}>TOTAL CARREGADO</p>
                <h3 style={{ fontSize: '24px', fontWeight: 'bold', color: '#0284c7', margin: '8px 0 0 0' }}>
                  R$ {wallet.totalIncome.toFixed(2)}
                </h3>
              </div>
              <div style={{
                background: '#fef3c7',
                padding: '20px',
                borderRadius: '12px',
                border: '1px solid #fcd34d'
              }}>
                <p style={{ fontSize: '12px', color: '#92400e', fontWeight: 'bold', margin: 0 }}>TOTAL GASTO</p>
                <h3 style={{ fontSize: '24px', fontWeight: 'bold', color: '#d97706', margin: '8px 0 0 0' }}>
                  R$ {wallet.totalSpent.toFixed(2)}
                </h3>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'historico' && (
          <div style={{
            background: '#f9fafb',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            overflow: 'hidden'
          }}>
            {history.length === 0 ? (
              <div style={{ padding: '40px', textAlign: 'center', color: '#999' }}>
                <p style={{ fontSize: '14px' }}>Nenhuma transação ainda</p>
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ background: '#f3f4f6', borderBottom: '2px solid #e5e7eb' }}>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#6b7280' }}>Data</th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#6b7280' }}>Tipo</th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#6b7280' }}>Valor</th>
                    <th style={{ padding: '16px', textAlign: 'left', fontSize: '12px', fontWeight: 'bold', color: '#6b7280' }}>Descrição</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((item, idx) => (
                    <tr
                      key={idx}
                      style={{
                        borderBottom: '1px solid #e5e7eb',
                        background: idx % 2 === 0 ? '#fff' : '#f9fafb'
                      }}
                    >
                      <td style={{ padding: '16px', fontSize: '14px' }}>
                        {new Date(item.date).toLocaleDateString('pt-BR')}
                      </td>
                      <td style={{ padding: '16px', fontSize: '14px' }}>
                        <span style={{
                          display: 'inline-block',
                          padding: '4px 12px',
                          borderRadius: '20px',
                          fontSize: '12px',
                          fontWeight: 'bold',
                          background: item.type === 'credit' ? '#dcfce7' : '#fee2e2',
                          color: item.type === 'credit' ? '#15803d' : '#991b1b'
                        }}>
                          {item.type === 'credit' ? <><Icon name="plus" size={12} /> Crédito</> : <><Icon name="minus" size={12} /> Débito</>}
                        </span>
                      </td>
                      <td style={{ padding: '16px', fontSize: '14px', fontWeight: 'bold' }}>
                        <span style={{ color: item.type === 'credit' ? '#10b981' : '#ef4444' }}>
                          {item.type === 'credit' ? '+' : '-'} R$ {item.amount.toFixed(2)}
                        </span>
                      </td>
                      <td style={{ padding: '16px', fontSize: '13px', color: '#666' }}>
                        {item.reason}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {activeTab === 'carregar' && (
          <div style={{
            background: '#f9fafb',
            padding: '32px',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            maxWidth: '500px'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '24px' }}>Carregar Saldo</h3>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#374151' }}>
                Valor (R$)
              </label>
              <input
                type="number"
                value={creditAmount}
                onChange={(e) => setCreditAmount(e.target.value)}
                placeholder="Ex: 100.00"
                step="0.01"
                min="0"
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#374151' }}>
                Forma de Pagamento
              </label>
              <select
                value={creditMethod}
                onChange={(e) => setCreditMethod(e.target.value as any)}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px'
                }}
              >
                <option value="pix">Pix</option>
                <option value="credit_card">Cartão de Crédito</option>
                <option value="debit_card">Cartão de Débito</option>
              </select>
            </div>

            <div style={{
              background: '#ecfdf5',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '13px',
              color: '#047857',
              lineHeight: '1.5'
            }}>
              <Icon name="check-circle" size={14} /> O crédito será disponibilizado imediatamente após a confirmação do pagamento
            </div>

            <button
              onClick={handleCredit}
              disabled={loadingAction || !creditAmount}
              style={{
                width: '100%',
                padding: '14px',
                background: loadingAction ? '#d1d5db' : '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loadingAction ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              {loadingAction ? 'Processando...' : 'Confirmar Carregamento'}
            </button>
          </div>
        )}

        {activeTab === 'sacar' && (
          <div style={{
            background: '#f9fafb',
            padding: '32px',
            borderRadius: '12px',
            border: '1px solid #e5e7eb',
            maxWidth: '500px'
          }}>
            <h3 style={{ fontSize: '18px', fontWeight: 'bold', marginBottom: '24px' }}><Icon name="bank" size={16} /> Sacar para Conta Bancária</h3>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#374151' }}>
                Valor (R$) - Máximo: R$ {wallet?.balance.toFixed(2)}
              </label>
              <input
                type="number"
                value={withdrawAmount}
                onChange={(e) => setWithdrawAmount(e.target.value)}
                placeholder="Ex: 100.00"
                step="0.01"
                min="0"
                max={wallet?.balance || 0}
                style={{
                  width: '100%',
                  padding: '12px',
                  border: '1px solid #d1d5db',
                  borderRadius: '8px',
                  fontSize: '14px',
                  boxSizing: 'border-box'
                }}
              />
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '20px'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#374151' }}>
                  Banco
                </label>
                <input
                  type="text"
                  value={bankData.banco}
                  onChange={(e) => setBankData({ ...bankData, banco: e.target.value })}
                  placeholder="Ex: Banco do Brasil"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#374151' }}>
                  Agência
                </label>
                <input
                  type="text"
                  value={bankData.agencia}
                  onChange={(e) => setBankData({ ...bankData, agencia: e.target.value })}
                  placeholder="Ex: 1234"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: '12px',
              marginBottom: '20px'
            }}>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#374151' }}>
                  Conta
                </label>
                <input
                  type="text"
                  value={bankData.conta}
                  onChange={(e) => setBankData({ ...bankData, conta: e.target.value })}
                  placeholder="Ex: 12345678"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '13px', fontWeight: 'bold', marginBottom: '8px', color: '#374151' }}>
                  CPF
                </label>
                <input
                  type="text"
                  value={bankData.cpf}
                  onChange={(e) => setBankData({ ...bankData, cpf: e.target.value })}
                  placeholder="Ex: 12345678901"
                  style={{
                    width: '100%',
                    padding: '12px',
                    border: '1px solid #d1d5db',
                    borderRadius: '8px',
                    fontSize: '14px',
                    boxSizing: 'border-box'
                  }}
                />
              </div>
            </div>

            <div style={{
              background: '#fef3c7',
              padding: '12px 16px',
              borderRadius: '8px',
              marginBottom: '20px',
              fontSize: '13px',
              color: '#92400e',
              lineHeight: '1.5'
            }}>
              <Icon name="clock" size={14} /> O saque será processado em até 2 dias úteis para sua conta bancária
            </div>

            <button
              onClick={handleWithdraw}
              disabled={loadingAction || !withdrawAmount}
              style={{
                width: '100%',
                padding: '14px',
                background: loadingAction ? '#d1d5db' : '#10b981',
                color: 'white',
                border: 'none',
                borderRadius: '8px',
                cursor: loadingAction ? 'not-allowed' : 'pointer',
                fontWeight: 'bold',
                fontSize: '14px'
              }}
            >
              {loadingAction ? 'Processando...' : 'Solicitar Saque'}
            </button>
          </div>
        )}

        {/* MODAIS (backup para ao invés de abas) */}
        {creditModal && (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.5)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000
          }}>
            <div style={{
              background: 'white',
              borderRadius: '12px',
              padding: '32px',
              maxWidth: '400px',
              boxShadow: '0 20px 60px rgba(0,0,0,0.3)'
            }}>
              <h2 style={{ fontSize: '24px', fontWeight: 'bold', margin: '0 0 20px 0' }}>Carregar Saldo</h2>
              <button
                onClick={() => setCreditModal(false)}
                style={{
                  position: 'absolute',
                  top: '16px',
                  right: '16px',
                  background: 'none',
                  border: 'none',
                  fontSize: '24px',
                  cursor: 'pointer'
                }}
              >
                ✕
              </button>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
