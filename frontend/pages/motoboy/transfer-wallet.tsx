import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import styles from './MotoboyTransferWallet.module.css';

export default function TransferWallet() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth() || {};
  const [userWallet, setUserWallet] = useState<any>(null);
  const [motoboyWallet, setMotoboyWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [amount, setAmount] = useState('');
  const [transferring, setTransferring] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Carregar dados das carteiras
  useEffect(() => {
    if (user?.id && user?.activeRole === 'motoboy') {
      loadWallets();
    }
  }, [user?.id, user?.activeRole]);

  const loadWallets = async () => {
    try {
      setLoading(true);
      setMessage(null);

      // Buscar carteira de USUÁRIO (role 'cliente')
      let userWalletData = null;
      try {
        console.log('Buscando carteira de usuário...');
        const userRes = await api.get('/wallets/my-wallet/by-role/cliente');
        userWalletData = userRes.data;
        console.log('Carteira de usuário carregada:', userWalletData);
      } catch (err: any) {
        console.warn('Erro ao buscar carteira de usuário (by-role):', err.response?.data || err.message);
        // Tentar sem o role específico
        try {
          console.log('Tentando fallback para /wallets/my-wallet...');
          const fallbackRes = await api.get('/wallets/my-wallet');
          console.log('Resposta do fallback:', fallbackRes.data);
          if (fallbackRes.data.ownerType !== 'motoboy') {
            userWalletData = fallbackRes.data;
            console.log('Carteira de usuário carregada via fallback:', userWalletData);
          }
        } catch (fallbackErr: any) {
          console.error('Fallback também falhou:', fallbackErr.message);
        }
      }

      // Buscar carteira de MOTOBOY (role 'motoboy')
      let motoboyWalletData = null;
      try {
        console.log('Buscando carteira de motoboy...');
        const motoboyRes = await api.get('/wallets/my-wallet/by-role/motoboy');
        motoboyWalletData = motoboyRes.data;
        console.log('Carteira de motoboy carregada:', motoboyWalletData);
      } catch (err: any) {
        console.error('Erro ao buscar carteira de motoboy:', {
          status: err.response?.status,
          data: err.response?.data,
          message: err.message
        });
        setMessage({
          type: 'error',
          text: `Erro ao carregar carteira de motoboy: ${err.response?.data?.error || err.message}`
        });
      }

      if (!userWalletData && !motoboyWalletData) {
        throw new Error('Não foi possível carregar nenhuma carteira');
      }

      setUserWallet(userWalletData);
      setMotoboyWallet(motoboyWalletData);
    } catch (err: any) {
      console.error('Erro ao carregar carteiras:', {
        message: err.message,
        stack: err.stack
      });
      setMessage({
        type: 'error',
        text: 'Erro ao carregar sua carteira'
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
      const res = await api.post('/wallets/transfer-to-motoboy', {
        amount: Number(amount)
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
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        <div className={styles.container}>
          <h1 className={styles.pageTitle}>Transferir Saldo</h1>
          <p className={styles.pageSubtitle}>
            Transfira seu saldo de usuário para a carteira de motoboy
          </p>

          {/* Mensagens */}
          {message && (
            <div className={message.type === 'success' ? styles.alertSuccess : styles.alertError}>
              {message.text}
            </div>
          )}

          {/* Grid de carteiras */}
          <div className={styles.walletsGrid}>
            {/* Carteira de Usuário */}
            <div className={styles.walletCardUser}>
              <h3 className={`${styles.walletCardTitle} ${styles.walletCardTitleUser}`}>Carteira Usuario</h3>
              <div>
                <div className={styles.walletBalanceLabel}>Saldo Disponível</div>
                <div className={styles.walletBalanceUser}>
                  R$ {userWallet?.balance?.toFixed(2) || '0.00'}
                </div>
              </div>
              <div className={styles.walletTotalIncome}>
                Total recebido: R$ {userWallet?.totalIncome?.toFixed(2) || '0.00'}
              </div>
            </div>

            {/* Carteira de Motoboy */}
            <div className={styles.walletCardMotoboy}>
              <h3 className={`${styles.walletCardTitle} ${styles.walletCardTitleMotoboy}`}>Carteira Motoboy</h3>
              <div>
                <div className={styles.walletBalanceLabel}>Saldo Disponível</div>
                <div className={styles.walletBalanceMotoboy}>
                  R$ {motoboyWallet?.balance?.toFixed(2) || '0.00'}
                </div>
              </div>
              <div className={styles.walletTotalIncome}>
                Total recebido: R$ {motoboyWallet?.totalIncome?.toFixed(2) || '0.00'}
              </div>
            </div>
          </div>

          {/* Formulário de transferência */}
          <div className={styles.formCard}>
            <h3 className={styles.formCardTitle}>Transferir Para Carteira de Motoboy</h3>

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
              <div className={styles.formNote}>
                Saldo disponível: R$ {userWallet?.balance?.toFixed(2) || '0.00'}
              </div>
            </div>

            {/* Botão de transferência */}
            <button
              onClick={handleTransfer}
              disabled={transferring || !amount || !userWallet}
              className={styles.btnTransfer}
            >
              {transferring ? 'Transferindo...' : <><Icon name="wallet" size={14} /> Transferir Agora</>}
            </button>
          </div>

          {/* Voltar */}
          <div className={styles.backWrap}>
            <button
              onClick={() => router.back()}
              className={styles.btnBack}
            >
              ← Voltar
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
