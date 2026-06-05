import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import styles from './AdminPlanApprovals.module.css';

export default function PlanApprovals() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth() || {};
  const [pending, setPending] = useState<any[]>([]);
  const [allSubs, setAllSubs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [rejectionReason, setRejectionReason] = useState<string>('');
  const [showRejectForm, setShowRejectForm] = useState<string | null>(null);
  const [tabFilter, setTabFilter] = useState<'pending' | 'all'>('pending');

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
    }
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [pendRes, allRes] = await Promise.all([
        api.get('/settings/pending-plan-changes'),
        api.get('/settings/all-store-subscriptions'),
      ]);
      setPending(pendRes.data);
      setAllSubs(allRes.data);
      setMessage(null);
    } catch (err: any) {
      console.error('Erro ao carregar:', err);
      setMessage({ type: 'error', text: 'Erro ao carregar requisições' });
    } finally {
      setLoading(false);
    }
  };

  const getPlanInfo = (planId: string) => {
    const planMap: any = {
      plan1: { name: 'Marketplace Only', icon: 'package' as const },
      plan2: { name: 'Marketplace + Motoboys', icon: 'truck' as const },
      plan3: { name: 'Premium', icon: 'star' as const },
    };
    return planMap[planId] || { name: 'Desconhecido', icon: 'alert-triangle' as const };
  };

  const handleApprove = async (subscriptionId: string) => {
    setProcessing(subscriptionId);
    try {
      const res = await api.post('/settings/approve-plan-change', { subscriptionId });
      setPending(pending.filter((p) => p._id !== subscriptionId));
      setAllSubs(allSubs.map((s) => (s._id === subscriptionId ? res.data.subscription : s)));
      setMessage({ type: 'success', text: 'Plano aprovado com sucesso!' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Erro ao aprovar:', err);
      setMessage({ type: 'error', text: err?.response?.data?.error || 'Erro ao aprovar' });
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (subscriptionId: string) => {
    if (!rejectionReason.trim()) {
      setMessage({ type: 'error', text: 'Informe o motivo da rejeição' });
      return;
    }

    setProcessing(subscriptionId);
    try {
      const res = await api.post('/settings/reject-plan-change', {
        subscriptionId,
        reason: rejectionReason,
      });
      setPending(pending.filter((p) => p._id !== subscriptionId));
      setAllSubs(allSubs.map((s) => (s._id === subscriptionId ? res.data.subscription : s)));
      setMessage({ type: 'success', text: 'Plano rejeitado!' });
      setRejectionReason('');
      setShowRejectForm(null);
      setTimeout(() => setMessage(null), 3000);
    } catch (err: any) {
      console.error('Erro ao rejeitar:', err);
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

  const displayData = tabFilter === 'pending' ? pending : allSubs;

  return (
    <div className={styles.page}>
      <h1 className={styles.pageTitle}><Icon name="clipboard" size={20} /> Aprovações de Planos</h1>
      <p className={styles.pageSub}>
        Gerenciar mudanças de planos das lojas
      </p>

      {message && (
        <div className={message.type === 'success' ? styles.messageSuccess : styles.messageError}>
          {message.text}
        </div>
      )}

      {/* Tabs */}
      <div className={styles.tabs}>
        <button
          onClick={() => setTabFilter('pending')}
          className={tabFilter === 'pending' ? styles.tabBtnActive : styles.tabBtn}
        >
          <Icon name="clock" size={14} /> Pendentes ({pending.length})
        </button>
        <button
          onClick={() => setTabFilter('all')}
          className={tabFilter === 'all' ? styles.tabBtnActive : styles.tabBtn}
        >
          <Icon name="package" size={14} /> Todos ({allSubs.length})
        </button>
      </div>

      {/* Lista */}
      {displayData.length === 0 ? (
        <div className={styles.emptyCard}>
          <p className={styles.emptyText}>
            {tabFilter === 'pending' ? 'Nenhuma requisição pendente' : 'Nenhum plano  registrado'}
          </p>
        </div>
      ) : (
        <div className={styles.list}>
          {displayData.map((sub) => {
            const currentPlan = getPlanInfo(sub.currentPlan);
            const requestedPlan = sub.requestedPlan ? getPlanInfo(sub.requestedPlan) : null;
            const isPending = sub.planChangeStatus === 'pending';
            const isRejected = sub.planChangeStatus === 'rejected';

            return (
              <div
                key={sub._id}
                className={isPending ? styles.subCardPending : styles.subCard}
              >
                <div className={styles.subCardInner}>
                  <div className={styles.subInfo}>
                    <h3 className={styles.storeName}>
                      <Icon name="store" size={14} /> {sub.storeName}
                    </h3>

                    {isPending && requestedPlan ? (
                      <div className={styles.planInfoPending}>
                        <p className={styles.planLine}>
                          Plano atual: <Icon name={currentPlan.icon} size={14} /> {currentPlan.name}
                        </p>
                        <p className={styles.planRequested}>
                          → Solicitando: <Icon name={requestedPlan.icon} size={14} /> {requestedPlan.name}
                        </p>
                        <p className={styles.planMeta}>
                          Solicitado em: {new Date(sub.requestedAt).toLocaleDateString('pt-BR')}
                        </p>
                      </div>
                    ) : isRejected ? (
                      <div className={styles.planInfoRejected}>
                        <p className={styles.planLine}>
                          Plano atual: <Icon name={currentPlan.icon} size={14} /> {currentPlan.name}
                        </p>
                        <p className={styles.planMeta}>
                          Motivo da rejeição: {sub.rejectionReason}
                        </p>
                      </div>
                    ) : (
                      <div className={styles.planInfoDefault}>
                        <p className={styles.planLine}>
                          Plano: <Icon name={currentPlan.icon} size={14} /> {currentPlan.name}
                        </p>
                        <p className={styles.planMeta}>
                          Comissão: {sub.commissionRate}%
                        </p>
                      </div>
                    )}
                  </div>

                  {isPending && (
                    <div className={styles.actionBtns}>
                      <button
                        onClick={() => handleApprove(sub._id)}
                        disabled={processing === sub._id}
                        className={styles.btnApprove}
                      >
                        {processing === sub._id ? <Icon name="hourglass" size={14} /> : <Icon name="check" size={14} />} Aprovar
                      </button>

                      <button
                        onClick={() => setShowRejectForm(showRejectForm === sub._id ? null : sub._id)}
                        className={styles.btnReject}
                      >
                        <Icon name="x" size={14} /> Rejeitar
                      </button>
                    </div>
                  )}
                </div>

                {/* Reject Form */}
                {showRejectForm === sub._id && isPending && (
                  <div className={styles.rejectForm}>
                    <label className={styles.rejectLabel}>
                      Motivo da rejeição:
                    </label>
                    <textarea
                      value={rejectionReason}
                      onChange={(e) => setRejectionReason(e.target.value)}
                      placeholder="Ex: Plano não corresponde ao perfil da loja"
                      className={styles.rejectTextarea}
                    />
                    <div className={styles.rejectActions}>
                      <button
                        onClick={() => handleReject(sub._id)}
                        disabled={processing === sub._id}
                        className={styles.btnConfirmReject}
                      >
                        {processing === sub._id ? 'Rejeitando...' : 'Confirmar Rejeição'}
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
            );
          })}
        </div>
      )}
    </div>
  );
}
