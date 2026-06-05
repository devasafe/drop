import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useRouter } from 'next/router';
import api from '../lib/api';
import styles from './MyWallet.module.css';
import LoadingSkeleton from '../components/LoadingSkeleton';
import TransactionDetailsModal from '../components/TransactionDetailsModal';
import { useWallet } from '../hooks/useSync';

type HistoryTx = {
  date: string;
  type: 'credit' | 'debit';
  amount: number;
  reason: string;
  relatedId?: string;
};

interface MyWallet {
  _id: string;
  owner: string;
  ownerType: 'user' | 'store';
  balance: number;
  totalIncome: number;
  totalSpent: number;
  history: Array<{
    date: string;
    type: 'credit' | 'debit';
    amount: number;
    reason: string;
    relatedId?: string;
  }>;
}


export default function MyWalletPage() {
  const auth = useAuth();
  const router = useRouter();
  const { user, loading: authLoading } = auth || { loading: true };
  const [wallet, setWallet] = useState<MyWallet | null>(null);
  const [bankInfoConfigured, setBankInfoConfigured] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferAmount, setTransferAmount] = useState('');
  const [transferLoading, setTransferLoading] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [depositAmount, setDepositAmount] = useState('');
  const [depositLoading, setDepositLoading] = useState(false);
  const [showWithdraw, setShowWithdraw] = useState(false);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [withdrawLoading, setWithdrawLoading] = useState(false);
  const [bankForm, setBankForm] = useState({
    bankName: '', accountType: 'checking', accountNumber: '', routingNumber: '', ownerName: '',
  });
  const [selectedTx, setSelectedTx] = useState<HistoryTx | null>(null);

  // ✅ NOVO: Debug para rastrear mudanças de role
  const currentRole = user?.activeRole || user?.role || 'cliente';
  const ownerType = (currentRole === 'lojista' || currentRole === 'store') ? 'store' : 'user';
  const ownerId = ownerType === 'store' ? user?.storeId : user?._id;
  const { wallet: realtimeWallet } = useWallet(ownerId, ownerType as 'user' | 'store');

  useEffect(() => {
    console.log('🔔 ROLE CHANGED DETECTED:', {
      oldRole: user?.role,
      activeRole: user?.activeRole,
      currentRole
    });
  }, [currentRole]);

  useEffect(() => {
    // Aguardar autenticação carregar
    if (authLoading) {
      return;
    }

    if (!user) {
      router.push('/login');
      return;
    }

    const loadWallet = async () => {
      try {
        // ✅ NOVO: Buscar carteira baseado no role ativo
        const activeRole = user.activeRole || user.role || 'cliente';
        console.log('📍 Loading wallet for role:', activeRole);
        console.log('👤 Full user object:', user);
        console.log('🔍 Debug - user.activeRole:', user.activeRole, 'user.role:', user.role);

        setLoading(true); // ← Resetar loading quando role muda

        // Verifica se banco está configurado (apenas para lojista)
        if (activeRole === 'lojista') {
          const bankRes = await api.get('/user/bank-info');
          setBankInfoConfigured(bankRes.data.isConfigured);
        } else {
          // Cliente não precisa de banco configurado
          setBankInfoConfigured(true);
        }

        // Carrega carteira correta baseado no role
        const res = await api.get(`/wallets/my-wallet/by-role/${activeRole}`);
        console.log('💰 Wallet loaded:', res.data);
        setWallet(res.data);
      } catch (err) {
        console.error('Erro ao carregar carteira:', err);
        setError('Erro ao carregar sua carteira');
      } finally {
        setLoading(false);
      }
    };

    loadWallet();
  }, [user?.id, user?.activeRole, authLoading]);

  // Sincroniza saldo em tempo real quando socket emite wallet:updated
  useEffect(() => {
    if (realtimeWallet && wallet) {
      setWallet(prev => prev ? {
        ...prev,
        balance: realtimeWallet.balance,
        totalIncome: realtimeWallet.totalIncome,
        totalSpent: realtimeWallet.totalSpent,
      } : prev);
    }
  }, [realtimeWallet, wallet]);

  const handleTransfer = async () => {
    if (!transferAmount || parseFloat(transferAmount) <= 0) {
      alert('Digite um valor válido');
      return;
    }

    setTransferLoading(true);
    try {
      // ✅ Transferir direto para a carteira da loja do usuário (sem pedir ID)
      console.log('↗️ Transferindo para carteira de loja do usuário:', { userId: user?.id, amount: transferAmount });

      await api.post('/wallets/transfer', {
        toUserId: user?.id,  // Identifica qual é a carteira de loja
        amount: parseFloat(transferAmount),
        reason: 'Transferência de usuário para loja'
      });

      alert('Transferência realizada com sucesso!');
      setTransferAmount('');
      setShowTransfer(false);

      // Recarregar carteira com o role correto
      const activeRole = user?.activeRole || 'cliente';
      const res = await api.get(`/wallets/my-wallet/by-role/${activeRole}`);
      setWallet(res.data);
    } catch (err: any) {
      alert('Erro: ' + (err.response?.data?.message || 'Falha na transferência'));
    } finally {
      setTransferLoading(false);
    }
  };

  const handleDeposit = async () => {
    // Verifica se banco está configurado
    if (!bankInfoConfigured) {
      alert('Você precisa configurar seus dados bancários primeiro!');
      router.push('/bank-setup');
      return;
    }

    if (!depositAmount || parseFloat(depositAmount) <= 0) {
      alert('Digite um valor válido');
      return;
    }

    setDepositLoading(true);
    try {
      // ✅ IMPORTANTE: Depósito SEMPRE vai na carteira de USUÁRIO (cliente)
      // Usa o ID do usuário (não wallet._id)
      console.log('💳 Depositando para usuário:', { userId: user?.id });

      await api.post(`/wallets/${user?.id}/credit`, {
        amount: parseFloat(depositAmount),
        paymentMethod: 'credit_card'
      });

      alert('Depósito realizado com sucesso!');
      setDepositAmount('');
      setShowDeposit(false);

      // Recarregar carteira com o role correto
      const activeRole = user?.activeRole || 'cliente';
      const res = await api.get(`/wallets/my-wallet/by-role/${activeRole}`);
      setWallet(res.data);
    } catch (err: any) {
      alert('Erro: ' + (err.response?.data?.message || 'Falha no depósito'));
      console.error('Deposit error:', err);
    } finally {
      setDepositLoading(false);
    }
  };

  const handleWithdraw = async () => {
    // Verifica se banco está configurado (apenas para lojista)
    if (wallet?.ownerType === 'store' && !bankInfoConfigured) {
      alert('Você precisa configurar seus dados bancários primeiro!');
      router.push('/bank-setup');
      return;
    }

    if (!withdrawAmount || parseFloat(withdrawAmount) <= 0) {
      alert('Digite um valor válido');
      return;
    }

    if (wallet && parseFloat(withdrawAmount) > wallet.balance) {
      alert('Saldo insuficiente');
      return;
    }

    setWithdrawLoading(true);
    try {
      if (wallet?.ownerType === 'store') {
        // Store wallet: transfere tudo que está em availableBalance pro user wallet do dono.
        // O valor digitado é ignorado — transferência é do total disponível.
        await api.post(`/wallets/store/${wallet.owner}/transfer-to-owner`);
        alert('Saldo transferido para sua carteira pessoal! Vá na aba de cliente para sacar pro banco.');
      } else {
        // User wallet: cria WithdrawalRequest pro admin aprovar
        if (!bankForm.bankName || !bankForm.accountNumber || !bankForm.ownerName) {
          alert('Preencha os dados bancários para o saque');
          setWithdrawLoading(false);
          return;
        }
        await api.post('/withdrawals/request-user', {
          amount: parseFloat(withdrawAmount),
          bankAccount: bankForm,
        });
        alert('Saque solicitado! Aguarde a aprovação do admin.');
      }

      setWithdrawAmount('');
      setShowWithdraw(false);

      // Recarregar carteira
      const activeRole = user?.activeRole || 'cliente';
      const res = await api.get(`/wallets/my-wallet/by-role/${activeRole}`);
      setWallet(res.data);
    } catch (err: any) {
      alert('Erro: ' + (err.response?.data?.message || 'Falha na operação'));
      console.error('Error:', err);
    } finally {
      setWithdrawLoading(false);
    }
  };

  // ✅ Cálculos de métricas
  const calculateMetrics = () => {
    if (!wallet) return {
      totalTransferred: 0,
      totalWithdrawn: 0,
      totalReceived: 0,
      totalSent: 0,
      profitMargin: 0
    };

    let totalTransferred = 0;  // De usuário para loja
    let totalWithdrawn = 0;    // Saques do usuário
    let totalReceived = 0;     // Total recebido pela loja
    let totalSent = 0;         // Total enviado pela loja

    wallet.history.forEach((transaction: any) => {
      if (wallet.ownerType === 'user') {
        // Métricas do USUÁRIO
        if (transaction.type === 'debit') {
          if (transaction.reason?.includes('Transferência')) {
            totalTransferred += transaction.amount;
          } else if (transaction.reason?.includes('Saque') || transaction.reason?.includes('withdrawal')) {
            totalWithdrawn += transaction.amount;
          }
        }
      } else if (wallet.ownerType === 'store') {
        // Métricas da LOJA
        if (transaction.type === 'credit') {
          totalReceived += transaction.amount;
        } else if (transaction.type === 'debit') {
          totalSent += transaction.amount;
        }
      }
    });

    // Cálculo de margem para loja
    const profitMargin = totalReceived > 0 ? ((totalReceived - totalSent) / totalReceived) * 100 : 0;

    return { totalTransferred, totalWithdrawn, totalReceived, totalSent, profitMargin };
  };

  const metrics = calculateMetrics();

  const fmt = (val: number) => new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL'
  }).format(val || 0);

  if (authLoading) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.loadingText}>Verificando autenticação...</div>
      </div>
    );
  }

  if (!user) return null;

  if (loading) {
    return (
      <div className={styles.loadingScreen}>
        <LoadingSkeleton variant="dashboard" />
      </div>
    );
  }

  if (error || !wallet) {
    return (
      <div className={styles.loadingScreen}>
        <div className={styles.errorText}>{error || 'Carteira não encontrada'}</div>
      </div>
    );
  }

  const isStore = wallet.ownerType === 'store';

  return (
    <div className={styles.page}>
      <div className={styles.container}>

        {/* Header */}
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Minha Carteira</h1>
          <p className={styles.pageSubtitle}>{user.name} · {isStore ? 'Conta Loja' : 'Conta Pessoal'}</p>
        </div>

        {/* Aviso banco não configurado */}
        {!bankInfoConfigured && isStore && (
          <div className={styles.bankWarning}>
            <div>
              <p className={styles.bankWarningTitle}>Dados bancários não configurados</p>
              <p className={styles.bankWarningDesc}>Configure agora para poder fazer saques da sua carteira.</p>
            </div>
            <button onClick={() => router.push('/bank-setup')} className={styles.bankWarningBtn}>
              Configurar Agora
            </button>
          </div>
        )}

        {/* Saldo hero card */}
        <div className={styles.balanceCard}>
          <div className={styles.balanceCardOrb1} />
          <div className={styles.balanceCardOrb2} />
          <p className={styles.balanceLabel}>Saldo Disponível</p>
          <h2 className={styles.balanceAmount}>{fmt(wallet.balance)}</h2>
        </div>

        {/* Stats grid */}
        <div className={`${styles.statsGrid} ${wallet.ownerType === 'user' ? styles.statsGrid5 : styles.statsGrid4}`}>
          {wallet.ownerType === 'user' ? (
            <>
              {[
                { label: 'Total Entrada',    value: fmt(wallet.totalIncome), color: '#4ADE80' },
                { label: 'Total Gasto',      value: fmt(wallet.totalSpent),  color: '#F87171' },
                { label: 'Transferido',      value: fmt(metrics.totalTransferred), color: '#A78BFA' },
                { label: 'Sacado',           value: fmt(metrics.totalWithdrawn),   color: '#FB923C' },
                { label: 'Diferença',        value: fmt(wallet.totalIncome - wallet.totalSpent), color: wallet.totalIncome - wallet.totalSpent >= 0 ? '#4ADE80' : '#F87171' },
              ].map((stat) => (
                <div key={stat.label} className={styles.statCard}>
                  <p className={styles.statLabel}>{stat.label}</p>
                  <p className={styles.statValue} style={{ color: stat.color }}>{stat.value}</p>
                </div>
              ))}
            </>
          ) : (
            <>
              {[
                { label: 'Total Recebido', value: fmt(metrics.totalReceived), color: '#4ADE80' },
                { label: 'Total Enviado',  value: fmt(metrics.totalSent),     color: '#F87171' },
                { label: 'Lucro Retido',   value: fmt(wallet.balance),        color: wallet.balance >= 0 ? '#4ADE80' : '#F87171' },
                { label: 'Margem',         value: `${metrics.profitMargin.toFixed(1)}%`, color: metrics.profitMargin >= 0 ? '#4ADE80' : '#F87171' },
              ].map((stat) => (
                <div key={stat.label} className={styles.statCard}>
                  <p className={styles.statLabel}>{stat.label}</p>
                  <p className={styles.statValue} style={{ color: stat.color }}>{stat.value}</p>
                </div>
              ))}
            </>
          )}
        </div>

        {/* Action buttons */}
        <div className={styles.actionBtns}>
          {wallet.ownerType === 'user' && (
            <>
              <button
                onClick={() => { setShowDeposit(!showDeposit); setShowTransfer(false); setShowWithdraw(false); }}
                className={`${styles.btnDeposit} ${showDeposit ? styles.btnDepositActive : ''}`}
              >
                {showDeposit ? '✕ Cancelar' : 'Depositar'}
              </button>

              <button
                onClick={() => { setShowTransfer(!showTransfer); setShowDeposit(false); setShowWithdraw(false); }}
                className={`${styles.btnTransfer} ${showTransfer ? styles.btnTransferActive : ''}`}
              >
                {showTransfer ? '✕ Cancelar' : 'Transferir'}
              </button>

              <button
                onClick={() => { setShowWithdraw(!showWithdraw); setShowDeposit(false); setShowTransfer(false); }}
                className={`${styles.btnWithdraw} ${showWithdraw ? styles.btnWithdrawActive : ''}`}
              >
                {showWithdraw ? '✕ Cancelar' : 'Sacar'}
              </button>
            </>
          )}

          {wallet.ownerType === 'store' && (
            <button
              onClick={() => setShowWithdraw(!showWithdraw)}
              className={`${styles.btnStoreWithdraw} ${showWithdraw ? styles.btnStoreWithdrawActive : ''}`}
            >
              {showWithdraw ? '✕ Cancelar' : 'Enviar para Usuário'}
            </button>
          )}
        </div>

        {/* Form: Depositar */}
        {showDeposit && (
          <div className={`${styles.actionForm} ${styles.actionFormGreen}`}>
            <h3 className={styles.actionFormTitle}>Depositar Dinheiro</h3>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Valor</label>
              <input
                type="number"
                placeholder="0,00"
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                min="0.01" step="0.01"
                className={styles.formInput}
              />
            </div>
            <button
              onClick={handleDeposit}
              disabled={depositLoading || !depositAmount}
              className={`${styles.confirmBtn} ${styles.confirmBtnGreen}`}
            >
              {depositLoading ? 'Processando...' : 'Confirmar Depósito'}
            </button>
          </div>
        )}

        {/* Form: Saque / Enviar para usuário */}
        {showWithdraw && (
          <div className={`${styles.actionForm} ${isStore ? styles.actionFormPurple : styles.actionFormOrange}`}>
            <h3 className={styles.actionFormTitle}>{isStore ? 'Transferir para Carteira Pessoal' : 'Sacar para Banco'}</h3>
            <p className={styles.actionFormSubtitle}>
              Saldo disponível: <strong style={{ color: isStore ? '#A78BFA' : '#FB923C' }}>{fmt(wallet.balance)}</strong>
            </p>
            {!isStore && (
              <div className={styles.formField}>
                <label className={styles.formLabel}>Valor</label>
                <input
                  type="number"
                  placeholder="0,00"
                  value={withdrawAmount}
                  onChange={(e) => setWithdrawAmount(e.target.value)}
                  min="0.01" step="0.01" max={wallet.balance}
                  className={styles.formInput}
                />
              </div>
            )}

            {!isStore && (
              <>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Banco</label>
                  <input
                    type="text"
                    placeholder="Ex: Itaú, Nubank"
                    value={bankForm.bankName}
                    onChange={(e) => setBankForm({ ...bankForm, bankName: e.target.value })}
                    className={styles.formInput}
                  />
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Titular</label>
                  <input
                    type="text"
                    placeholder="Nome completo"
                    value={bankForm.ownerName}
                    onChange={(e) => setBankForm({ ...bankForm, ownerName: e.target.value })}
                    className={styles.formInput}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Agência</label>
                    <input
                      type="text"
                      placeholder="0000"
                      value={bankForm.routingNumber}
                      onChange={(e) => setBankForm({ ...bankForm, routingNumber: e.target.value })}
                      className={styles.formInput}
                    />
                  </div>
                  <div className={styles.formField}>
                    <label className={styles.formLabel}>Conta</label>
                    <input
                      type="text"
                      placeholder="00000-0"
                      value={bankForm.accountNumber}
                      onChange={(e) => setBankForm({ ...bankForm, accountNumber: e.target.value })}
                      className={styles.formInput}
                    />
                  </div>
                </div>
                <div className={styles.formField}>
                  <label className={styles.formLabel}>Tipo</label>
                  <select
                    value={bankForm.accountType}
                    onChange={(e) => setBankForm({ ...bankForm, accountType: e.target.value })}
                    className={styles.formInput}
                  >
                    <option value="checking">Conta Corrente</option>
                    <option value="savings">Conta Poupança</option>
                  </select>
                </div>
              </>
            )}

            {isStore && (
              <p style={{ fontSize: 13, color: 'var(--drop-text-dim)', margin: '8px 0 12px' }}>
                Todo o saldo disponível da loja ({fmt(wallet.balance)}) será transferido para sua carteira pessoal.
              </p>
            )}

            <button
              onClick={handleWithdraw}
              disabled={withdrawLoading || (!isStore && (!withdrawAmount || parseFloat(withdrawAmount) > wallet.balance)) || (isStore && wallet.balance <= 0)}
              className={`${styles.confirmBtn} ${isStore ? styles.confirmBtnPurple : styles.confirmBtnOrange}`}
            >
              {withdrawLoading ? 'Processando...' : isStore ? 'Transferir para Minha Carteira' : 'Solicitar Saque'}
            </button>
          </div>
        )}

        {/* Form: Transferência */}
        {showTransfer && (
          <div className={`${styles.actionForm} ${styles.actionFormPurple}`}>
            <h3 className={styles.actionFormTitle}>Transferir para Loja</h3>
            <div className={styles.formField}>
              <label className={styles.formLabel}>Valor</label>
              <input
                type="number"
                placeholder="0,00"
                value={transferAmount}
                onChange={(e) => setTransferAmount(e.target.value)}
                min="0.01" step="0.01"
                className={styles.formInput}
              />
            </div>
            <div className={styles.formActions2}>
              <button onClick={() => setShowTransfer(false)} className={styles.btnCancelForm}>
                Cancelar
              </button>
              <button
                onClick={handleTransfer}
                disabled={transferLoading}
                className={`${styles.confirmBtn} ${styles.confirmBtnPurple}`}
              >
                {transferLoading ? 'Processando...' : 'Confirmar'}
              </button>
            </div>
          </div>
        )}

        {/* Histórico */}
        <div className={styles.historyCard}>
          <div className={styles.historyHeader}>
            <h3 className={styles.historyTitle}>Histórico de Transações</h3>
          </div>

          {wallet.history.length === 0 ? (
            <div className={styles.historyEmpty}>
              <p className={styles.historyEmptyText}>Nenhuma transação encontrada</p>
            </div>
          ) : (
            <div className={styles.historyList}>
              {wallet.history.map((tx, idx) => (
                <div
                  key={idx}
                  className={styles.txRow}
                  style={{ cursor: 'pointer' }}
                  onClick={() => setSelectedTx(tx)}
                >
                  <div className={styles.txLeft}>
                    <div className={`${styles.txIcon} ${tx.type === 'credit' ? styles.txIconCredit : styles.txIconDebit}`}>
                      {tx.type === 'credit' ? (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#4ADE80" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 6 13.5 15.5 8.5 10.5 1 18"/><polyline points="17 6 23 6 23 12"/></svg>
                      ) : (
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#F87171" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="23 18 13.5 8.5 8.5 13.5 1 6"/><polyline points="17 18 23 18 23 12"/></svg>
                      )}
                    </div>
                    <div>
                      <p className={styles.txReason}>{tx.reason}</p>
                      <p className={styles.txDate}>
                        {new Date(tx.date).toLocaleDateString('pt-BR')} · {new Date(tx.date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </p>
                    </div>
                  </div>
                  <div className={`${styles.txAmount} ${tx.type === 'credit' ? styles.txAmountCredit : styles.txAmountDebit}`}>
                    {tx.type === 'credit' ? '+' : '-'}{fmt(tx.amount)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

      {selectedTx && (
        <TransactionDetailsModal
          isOpen={!!selectedTx}
          onClose={() => setSelectedTx(null)}
          title={selectedTx.type === 'credit' ? 'Detalhes do Crédito' : 'Detalhes do Débito'}
          subtitle={selectedTx.reason}
          statusLabel={selectedTx.type === 'credit' ? 'Entrada' : 'Saida'}
          statusTone={selectedTx.type}
          amount={selectedTx.amount}
          amountSign={selectedTx.type === 'credit' ? '+' : '-'}
          details={[
            { label: 'Data', value: new Date(selectedTx.date).toLocaleString('pt-BR') },
            { label: 'Tipo', value: selectedTx.type === 'credit' ? 'Credito' : 'Debito' },
            { label: 'Motivo', value: selectedTx.reason },
            ...(selectedTx.relatedId ? [{ label: 'Referencia', value: selectedTx.relatedId, mono: true as const }] : []),
          ]}
        />
      )}
    </div>
  );
}
