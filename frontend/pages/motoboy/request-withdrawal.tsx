import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import styles from './MotoboyRequestWithdrawal.module.css';

export default function RequestWithdrawal() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth() || {};
  const [wallet, setWallet] = useState<any>(null);
  const [amount, setAmount] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [step, setStep] = useState<'form' | 'history'>('form');

  // Verificar permissão
  useEffect(() => {
    if (!authLoading && (user?.role || user?.activeRole) !== 'motoboy') {
      router.push('/access-denied');
    }
  }, [user, authLoading, router]);

  // Carregar dados
  useEffect(() => {
    if ((user?.role === 'motoboy' || user?.activeRole === 'motoboy') && (user?._id || user?.id)) {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      const res = await api.get('/wallets/my-wallet');
      setWallet(res.data);
      setMessage(null);
    } catch (err: any) {
      console.error('Erro:', err);
      setMessage({ type: 'error', text: 'Erro ao carregar carteira' });
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const amountNum = parseFloat(amount);
    if (!amountNum || amountNum <= 0) {
      setMessage({ type: 'error', text: 'Valor inválido' });
      return;
    }

    if (amountNum > (wallet?.balance || 0)) {
      setMessage({ type: 'error', text: 'Saldo insuficiente' });
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/withdrawals/request', { amount: amountNum });
      setMessage({ type: 'success', text: 'Solicitação enviada! Aguardando aprovação do CEO.' });
      setAmount('');
      setTimeout(() => {
        loadData();
        setStep('history');
      }, 1500);
    } catch (err: any) {
      console.error('Erro:', err);
      setMessage({ type: 'error', text: err?.response?.data?.error || 'Erro ao solicitar' });
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || loading) {
    return (
      <div className={styles.loadingScreen}>
        <LoadingSkeleton variant="form" />
      </div>
    );
  }

  if ((user?.role || user?.activeRole) !== 'motoboy') {
    return null;
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.pageTitle}><Icon name="send" size={20} /> Solicitar Saque</h1>
        <p className={styles.pageSubtitle}>
          Solicite um saque do seu saldo. Será necessária aprovação do CEO.
        </p>

        {message && (
          <div className={message.type === 'success' ? styles.alertSuccess : styles.alertError}>
            {message.text}
          </div>
        )}

        {/* Tabs */}
        <div className={styles.tabs}>
          <button
            onClick={() => setStep('form')}
            className={step === 'form' ? styles.tabBtnActive : styles.tabBtn}
          >
            <Icon name="clipboard" size={14} /> Solicitar
          </button>
          <button
            onClick={() => setStep('history')}
            className={step === 'history' ? styles.tabBtnActive : styles.tabBtn}
          >
            <Icon name="list" size={14} /> Histórico
          </button>
        </div>

        {step === 'form' && (
          <div>
            {/* Saldo Disponível */}
            <div className={styles.balanceDisplay}>
              <p className={styles.balanceDisplayLabel}>Saldo Disponível</p>
              <h2 className={styles.balanceDisplayAmount}>
                R$ {(wallet?.balance || 0).toFixed(2)}
              </h2>
              {wallet?.minimumWithdraw && (
                <p className={styles.balanceDisplayNote}>
                  Mínimo para saque: R$ {wallet.minimumWithdraw.toFixed(2)}
                </p>
              )}
            </div>

            {/* Formulário */}
            <form onSubmit={handleSubmit} className={styles.formCard}>
              <label className={styles.formLabel}>
                Valor a Sacar (R$) *
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="Ex: 100.00"
                required
                className={styles.formInput}
              />

              <button
                type="submit"
                disabled={submitting}
                className={styles.btnPrimary}
              >
                {submitting ? 'Enviando...' : <><Icon name="send" size={14} /> Solicitar Saque</>}
              </button>
            </form>

            {/* Informações */}
            <div className={styles.infoBox}>
              <p className={styles.infoBoxTitle}><Icon name="info" size={14} /> Como funciona:</p>
              <ol className={styles.infoBoxList}>
                <li>Solicite um saque informando o valor desejado</li>
                <li>Sua solicitação é enviada para o CEO da plataforma</li>
                <li>Depois de aprovado, os fundos são transferidos para a carteira do CEO</li>
                <li>Você verá um recibo da transação em seu histórico</li>
              </ol>
            </div>
          </div>
        )}

        {step === 'history' && wallet?.withdrawalRequests && (
          <div>
            {wallet.withdrawalRequests.length === 0 ? (
              <div className={styles.emptyHistory}>
                <p className={styles.emptyHistoryText}>Nenhuma solicitação de saque</p>
              </div>
            ) : (
              <div className={styles.historyList}>
                {wallet.withdrawalRequests.map((w: any) => (
                  <div
                    key={w._id}
                    className={`${styles.withdrawalItem} ${
                      w.status === 'pending' ? styles.withdrawalItemPending :
                      w.status === 'processed' ? styles.withdrawalItemProcessed :
                      w.status === 'rejected' ? styles.withdrawalItemRejected :
                      styles.withdrawalItemDefault
                    }`}
                  >
                    <div className={styles.withdrawalHeader}>
                      <div>
                        <h3 className={styles.withdrawalAmount}>
                          R$ {w.amount.toFixed(2)}
                        </h3>
                        <p className={styles.withdrawalDate}>
                          {new Date(w.requestedAt).toLocaleDateString('pt-BR', {
                            weekday: 'short',
                            day: '2-digit',
                            month: 'short',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                      <span className={
                        w.status === 'pending' ? styles.statusPending :
                        (w.status === 'processed' || w.status === 'approved') ? styles.statusProcessed :
                        styles.statusRejected
                      }>
                        {w.status === 'pending' ? 'Pendente' :
                         w.status === 'processed' ? 'Processado' :
                         w.status === 'approved' ? 'Aprovado' :
                         'Rejeitado'}
                      </span>
                    </div>

                    {w.status === 'rejected' && w.rejectionReason && (
                      <div className={styles.rejectionNote}>
                        <p className={styles.rejectionNoteTitle}><Icon name="x-circle" size={14} /> Motivo da rejeição:</p>
                        <p className={styles.rejectionNoteText}>{w.rejectionReason}</p>
                      </div>
                    )}

                    {w.status === 'processed' && w.processedAt && (
                      <div className={styles.processedNote}>
                        <p className={styles.processedNoteTitle}><Icon name="check-circle" size={14} /> Processado em:</p>
                        <p className={styles.processedNoteText}>
                          {new Date(w.processedAt).toLocaleDateString('pt-BR', {
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
