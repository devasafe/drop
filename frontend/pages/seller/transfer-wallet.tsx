import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import styles from './TransferWallet.module.css';

export default function TransferWallet() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth() || {};
  const [userWallet, setUserWallet] = useState<any>(null);
  const [storeWallet, setStoreWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Carregar dados das carteiras
  useEffect(() => {
    if (user?.id && user?.activeRole === 'lojista') {
      loadWallets();
    }
  }, [user?.id, user?.activeRole]);

  const loadWallets = async () => {
    try {
      setLoading(true);

      // ✅ Buscar carteira de USUÁRIO
      const userRes = await api.get('/wallets/my-wallet/by-role/cliente');

      // ✅ Buscar carteira de LOJA
      const storeRes = await api.get('/wallets/my-wallet/by-role/lojista');

      console.log('Carteira de usuário:', userRes.data);
      console.log('Carteira de loja:', storeRes.data);

      setUserWallet(userRes.data);
      setStoreWallet(storeRes.data);
    } catch (err: any) {
      console.error('Erro ao carregar carteiras:', err);
      setMessage({
        type: 'error',
        text: err?.response?.data?.error || 'Erro ao carregar carteiras'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = async () => {
    if (!amount || Number(amount) <= 0) {
      setMessage({ type: 'error', text: 'Digite um valor válido' });
      return;
    }

    if (!userWallet || userWallet.balance < Number(amount)) {
      setMessage({
        type: 'error',
        text: `Saldo insuficiente. Você tem R$ ${userWallet?.balance.toFixed(2) || '0.00'}`
      });
      return;
    }

    setTransferring(true);
    try {
      const res = await api.post('/wallets/transfer', {
        toUserId: user?.id, // Identifica qual é a carteira de loja
        amount: Number(amount),
        reason: 'Transferência de usuário para loja'
      });

      setMessage({
        type: 'success',
        text: `Transferência de R$ ${Number(amount).toFixed(2)} realizada com sucesso!`
      });

      // Refresh das carteiras
      setTimeout(() => {
        loadWallets();
        setAmount('');
      }, 1000);
    } catch (err: any) {
      console.error('Erro na transferência:', err);
      setMessage({
        type: 'error',
        text: err?.response?.data?.error || 'Erro ao realizar transferência'
      });
    } finally {
      setTransferring(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className={styles.loadingScreen}>
        <LoadingSkeleton variant="form" />
      </div>
    );
  }

  return (
    <ProtectedRoute required_role="lojista">
      <div className={styles.page}>
        <div className={styles.container}>

          {/* Header */}
          <div className={styles.header}>
            <h1 className={styles.headerTitle}>Transferir Saldo</h1>
            <p className={styles.headerSubtitle}>
              Transfira seu saldo de usuário para a carteira da sua loja
            </p>
          </div>

          {/* Mensagens */}
          {message && (
            <div className={message.type === 'success' ? styles.alertSuccess : styles.alertError}>
              {message.text}
            </div>
          )}

          {/* Grid de carteiras */}
          <div className={styles.walletsGrid}>
            {/* Carteira de Usuário */}
            <div className={`${styles.walletCard} ${styles.walletCardUser}`}>
              <h3 className={`${styles.walletCardTitle} ${styles.walletCardTitleUser}`}>
                Carteira Usuário
              </h3>
              <div className={styles.walletBalanceLabel}>Saldo Disponível</div>
              <div className={styles.walletBalanceUser}>
                R$ {userWallet?.balance?.toFixed(2) || '0.00'}
              </div>
              <div className={styles.walletIncome}>
                Total recebido: R$ {userWallet?.totalIncome?.toFixed(2) || '0.00'}
              </div>
            </div>

            {/* Carteira de Loja */}
            <div className={`${styles.walletCard} ${styles.walletCardStore}`}>
              <h3 className={`${styles.walletCardTitle} ${styles.walletCardTitleStore}`}>
                Carteira Loja
              </h3>
              <div className={styles.walletBalanceLabel}>Saldo Disponível</div>
              <div className={styles.walletBalanceStore}>
                R$ {storeWallet?.balance?.toFixed(2) || '0.00'}
              </div>
              <div className={styles.walletIncome}>
                Total recebido: R$ {storeWallet?.totalIncome?.toFixed(2) || '0.00'}
              </div>
            </div>
          </div>

          {/* Formulário de transferência */}
          <div className={styles.formCard}>
            <h3 className={styles.formCardTitle}>Transferir Para Carteira da Loja</h3>

            <div className={styles.formGroup}>
              <label className={styles.formLabel}>
                Valor (R$)
              </label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className={styles.formInput}
                disabled={transferring}
              />
              <div className={styles.formHint}>
                Saldo disponível: R$ {userWallet?.balance?.toFixed(2) || '0.00'}
              </div>
            </div>

            {/* Botão de transferência */}
            <button
              onClick={handleTransfer}
              disabled={transferring || !amount || !userWallet}
              className={styles.btnSubmit}
            >
              {transferring ? 'Transferindo...' : 'Transferir Agora'}
            </button>
          </div>

          {/* Voltar */}
          <div className={styles.backWrapper}>
            <button
              onClick={() => router.push('/seller/dashboard')}
              className={styles.btnBack}
            >
              ← Voltar ao Dashboard
            </button>
          </div>

        </div>
      </div>
    </ProtectedRoute>
  );
}
