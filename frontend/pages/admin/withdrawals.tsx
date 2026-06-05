import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import styles from './AdminWithdrawals.module.css';

export default function WithdrawalApprovals() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth() || {};
  const [pending, setPending] = useState<any[]>([]);
  const [all, setAll] = useState<any[]>([]);
  const [ceoWallet, setCeoWallet] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [showRejectForm, setShowRejectForm] = useState<string | null>(null);
  const [tab, setTab] = useState<'pending' | 'all' | 'wallet'>('pending');
  const [autoApprove, setAutoApprove] = useState(false);

  // Verificar permissão
  useEffect(() => {
    if (!authLoading && user?.role !== 'ceo') {
      router.push('/access-denied');
    }
  }, [user, authLoading, router]);

  // Carregar dados
  useEffect(() => {
    if (user?.role === 'ceo') {
      loadData();
      loadConfig();
    }
  }, [user]);

  const loadConfig = async () => {
    try {
      const res = await api.get('/withdrawals/admin/config');
      setAutoApprove(!!res.data.autoApproveWithdrawals);
    } catch { /* ignore */ }
  };

  const handleToggleAutoApprove = async () => {
    const next = !autoApprove;
    const msg = next
      ? 'Ativar aprovação automática? Novos saques serão aprovados e processados imediatamente ao serem solicitados.'
      : 'Desativar aprovação automática? Novos saques ficarão pendentes até aprovação manual.';
    if (!confirm(msg)) return;
    try {
      await api.put('/withdrawals/admin/config', { enabled: next });
      setAutoApprove(next);
    } catch (err: any) {
      setMessage({ type: 'error', text: err?.response?.data?.error || 'Erro ao alterar configuração' });
    }
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [pendRes, allRes, walletRes] = await Promise.all([
        api.get('/withdrawals/pending'),
        api.get('/withdrawals/all'),
        api.get('/withdrawals/ceo-wallet'),
      ]);
      setPending(pendRes.data);
      setAll(allRes.data.withdrawals || []);
      setCeoWallet(walletRes.data);
      setMessage(null);
    } catch (err: any) {
      console.error('Erro:', err);
      setMessage({ type: 'error', text: 'Erro ao carregar dados' });
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (withdrawalId: string) => {
    setProcessing(withdrawalId);
    try {
      const res = await api.post('/withdrawals/approve', { withdrawalId });
      setPending(pending.filter((p) => p._id !== withdrawalId));
      setAll(all.map((a) => (a._id === withdrawalId ? res.data.withdrawal : a)));
      setCeoWallet(res.data.ceoWallet);
      setMessage({ type: 'success', text: 'Saque aprovado e transferido!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Erro:', err);
      setMessage({ type: 'error', text: err?.response?.data?.error || 'Erro ao aprovar' });
    } finally {
      setProcessing(null);
    }
  };

  const handleMarkPaid = async (withdrawalId: string) => {
    if (!confirm('Confirmar que o pagamento manual (Pix/transferência) já foi feito? Isso vai marcar os payouts como pagos e debitar do AppCashbox.')) return;
    setProcessing(withdrawalId);
    try {
      await api.post(`/withdrawals/${withdrawalId}/mark-paid`);
      setMessage({ type: 'success', text: 'Saque marcado como pago!' });
      await loadData();
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Erro:', err);
      setMessage({ type: 'error', text: err?.response?.data?.error || 'Erro ao marcar como pago' });
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (withdrawalId: string) => {
    if (!rejectionReason.trim()) {
      setMessage({ type: 'error', text: 'Informe o motivo da rejeição' });
      return;
    }

    setProcessing(withdrawalId);
    try {
      const res = await api.post('/withdrawals/reject', {
        withdrawalId,
        reason: rejectionReason,
      });
      setPending(pending.filter((p) => p._id !== withdrawalId));
      setAll(all.map((a) => (a._id === withdrawalId ? res.data.withdrawal : a)));
      setMessage({ type: 'success', text: 'Saque rejeitado!' });
      setRejectionReason('');
      setShowRejectForm(null);
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Erro:', err);
      setMessage({ type: 'error', text: err?.response?.data?.error || 'Erro ao rejeitar' });
    } finally {
      setProcessing(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className={styles.loadingScreen}>
        <LoadingSkeleton variant="list" count={4} />
      </div>
    );
  }

  if (user?.role !== 'ceo') {
    return null;
  }

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}><Icon name="send" size={20} /> Gerenciar Saques e Repasses</h1>
          <p className={styles.pageSubtitle}>
            Aprovar/rejeitar saques de motoboys e gerenciar caixa da plataforma
          </p>
        </div>

        {message && (
          <div className={`${styles.messageBanner} ${message.type === 'success' ? styles.messageBannerSuccess : styles.messageBannerError}`}>
            {message.text}
          </div>
        )}

        {/* Auto-approve Toggle */}
        <div className={styles.configPanel}>
          <div className={styles.configInfo}>
            <p className={styles.configTitle}>Aprovação automática de saques</p>
            <p className={styles.configDesc}>
              {autoApprove
                ? 'Ativada: saques solicitados são aprovados e processados automaticamente.'
                : 'Desativada: cada saque precisa ser aprovado manualmente por você.'}
            </p>
          </div>
          <label className={styles.toggle}>
            <input type="checkbox" checked={autoApprove} onChange={handleToggleAutoApprove} />
            <span className={styles.slider} />
          </label>
        </div>

        {/* Tabs */}
        <div className={styles.tabsRow}>
          <button
            onClick={() => setTab('pending')}
            className={`${styles.tabBtn} ${tab === 'pending' ? styles.tabBtnActive : ''}`}
          >
            <Icon name="clock" size={14} /> Pendentes ({pending.length})
          </button>
          <button
            onClick={() => setTab('wallet')}
            className={`${styles.tabBtn} ${tab === 'wallet' ? styles.tabBtnActive : ''}`}
          >
            <Icon name="wallet" size={14} /> Carteira CEOWallet
          </button>
          <button
            onClick={() => setTab('all')}
            className={`${styles.tabBtn} ${tab === 'all' ? styles.tabBtnActive : ''}`}
          >
            <Icon name="clipboard" size={14} /> Histórico
          </button>
        </div>

        {/* Tab: Pendentes */}
        {tab === 'pending' && (
          <div>
            {pending.length === 0 ? (
              <div className={styles.emptyState}>
                <p>Nenhuma solicitação pendente</p>
              </div>
            ) : (
              <div className={styles.pendingList}>
                {pending.map((w) => (
                  <div key={w._id} className={styles.pendingCard}>
                    <div className={styles.pendingCardInner}>
                      <div className={styles.pendingCardInfo}>
                        <h3 className={styles.pendingName}><Icon name="motorcycle" size={16} /> {w.motoboyName}</h3>
                        <p className={styles.pendingEmail}>
                          Email: {w.motoboyEmail}
                        </p>
                        <p className={styles.pendingAmount}>
                          R$ {w.amount.toFixed(2)}
                        </p>
                        <p className={styles.pendingDate}>
                          Solicitado em: {new Date(w.requestedAt).toLocaleDateString('pt-BR')}
                        </p>
                        {w.bankAccount && (
                          <div style={{ marginTop: 8, padding: 10, background: 'rgba(255,255,255,0.04)', borderRadius: 8, fontSize: 12 }}>
                            <div style={{ fontWeight: 700, marginBottom: 4 }}>Dados bancários</div>
                            <div>{w.bankAccount.bankName} — {w.bankAccount.accountType === 'savings' ? 'Poupança' : 'Corrente'}</div>
                            <div>Ag {w.bankAccount.routingNumber} · CC {w.bankAccount.accountNumber}</div>
                            <div>Titular: {w.bankAccount.ownerName}</div>
                          </div>
                        )}
                      </div>

                      <div className={styles.pendingActions}>
                        <button
                          onClick={() => handleApprove(w._id)}
                          disabled={processing === w._id}
                          className={styles.btnApprove}
                        >
                          {processing === w._id ? <Icon name="hourglass" size={14} /> : <Icon name="check" size={14} />} Aprovar
                        </button>

                        <button
                          onClick={() => setShowRejectForm(showRejectForm === w._id ? null : w._id)}
                          className={styles.btnReject}
                        >
                          <Icon name="x" size={14} /> Rejeitar
                        </button>
                      </div>
                    </div>

                    {/* Reject Form */}
                    {showRejectForm === w._id && (
                      <div className={styles.rejectForm}>
                        <label className={styles.rejectLabel}>
                          Motivo:
                        </label>
                        <textarea
                          value={rejectionReason}
                          onChange={(e) => setRejectionReason(e.target.value)}
                          placeholder="Ex: Dados bancários incorretos"
                          className={styles.rejectTextarea}
                        />
                        <div className={styles.rejectFormButtons}>
                          <button
                            onClick={() => handleReject(w._id)}
                            disabled={processing === w._id}
                            className={styles.btnConfirmReject}
                          >
                            <Icon name="check" size={14} /> Confirmar
                          </button>
                          <button
                            onClick={() => {
                              setShowRejectForm(null);
                              setRejectionReason('');
                            }}
                            className={styles.btnCancelReject}
                          >
                            Cancelar
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Tab: Carteira CEO */}
        {tab === 'wallet' && ceoWallet && (
          <div className={styles.walletCard}>
            <div className={styles.walletBalance}>
              <p className={styles.walletBalanceLabel}>Saldo Disponível</p>
              <h2 className={styles.walletBalanceValue}>
                R$ {(ceoWallet.balance || 0).toFixed(2)}
              </h2>
            </div>

            <div>
              <h3 className={styles.walletTxTitle}>Últimas Transações</h3>
              {ceoWallet.transactions && ceoWallet.transactions.length > 0 ? (
                <div className={styles.txList}>
                  {ceoWallet.transactions.slice(-10).reverse().map((tx: any, idx: number) => (
                    <div key={idx} className={styles.txRow}>
                      <div>
                        <p className={styles.txDescription}>{tx.description}</p>
                        <p className={styles.txTimestamp}>
                          {new Date(tx.timestamp).toLocaleString('pt-BR')}
                        </p>
                      </div>
                      <p className={tx.amount > 0 ? styles.txAmountPositive : styles.txAmountNegative}>
                        {tx.amount > 0 ? '+' : ''} R$ {Math.abs(tx.amount).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className={styles.noTx}>Nenhuma transação</p>
              )}
            </div>
          </div>
        )}

        {/* Tab: Histórico */}
        {tab === 'all' && (
          <div>
            {all.length === 0 ? (
              <div className={styles.emptyState}>
                <p>Nenhum saque registrado</p>
              </div>
            ) : (
              <div className={styles.tableCard}>
                <table className={styles.table}>
                  <thead>
                    <tr>
                      <th className={styles.th}>Solicitante</th>
                      <th className={styles.th}>Valor</th>
                      <th className={styles.th}>Status</th>
                      <th className={styles.th}>Data</th>
                      <th className={styles.th}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {all.map((w) => (
                      <tr key={w._id} className={styles.tr}>
                        <td className={styles.td}>{w.motoboyName}</td>
                        <td className={`${styles.td} ${styles.tdAmount}`}>R$ {w.amount.toFixed(2)}</td>
                        <td className={styles.td}>
                          <span className={`${styles.statusBadge} ${
                            w.status === 'pending' ? styles.statusPending :
                            w.status === 'approved' ? styles.statusApproved :
                            w.status === 'processed' ? styles.statusProcessed :
                            styles.statusRejected
                          }`}>
                            {w.status === 'pending' ? 'Pendente' :
                             w.status === 'approved' ? 'Aprovado' :
                             w.status === 'processed' ? 'Pago' :
                             'Rejeitado'}
                          </span>
                        </td>
                        <td className={`${styles.td} ${styles.tdDate}`}>
                          {new Date(w.requestedAt).toLocaleDateString('pt-BR')}
                        </td>
                        <td className={styles.td}>
                          {w.status === 'approved' && (
                            <button
                              onClick={() => handleMarkPaid(w._id)}
                              disabled={processing === w._id}
                              className={styles.btnApprove}
                              style={{ fontSize: 12, padding: '6px 12px' }}
                            >
                              Marcar Pago
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
