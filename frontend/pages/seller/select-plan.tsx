import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../../contexts/AuthContext';
import Link from 'next/link';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import api from '../../lib/api';
import styles from './SelectPlan.module.css';

const PlanFeatures = {
  plan1: [
    { included: true, text: 'Vitrine no marketplace' },
    { included: true, text: 'Gestão de produtos' },
    { included: true, text: 'Pedidos pelo app' },
    { included: false, text: 'Motoboy integrado (entrega por conta própria)' },
    { included: false, text: 'Taxa de entrega pelo app' },
    { included: false, text: 'Banners e destaque' },
  ],
  plan2: [
    { included: true, text: 'Vitrine no marketplace' },
    { included: true, text: 'Gestão de produtos' },
    { included: true, text: 'Pedidos pelo app' },
    { included: true, text: 'Motoboy integrado' },
    { included: true, text: 'Taxa de entrega calculada por distância' },
    { included: false, text: 'Banners e destaque' },
  ],
  plan3: [
    { included: true, text: 'Vitrine no marketplace' },
    { included: true, text: 'Gestão de produtos' },
    { included: true, text: 'Pedidos pelo app' },
    { included: true, text: 'Motoboy integrado' },
    { included: true, text: 'Taxa de entrega calculada por distância' },
    { included: true, text: 'Banners rotativos na homepage e lojas' },
    { included: true, text: 'Prioridade no topo das buscas' },
    { included: true, text: 'Badge Premium visível para clientes' },
    { included: true, text: 'Capa personalizada no perfil da loja' },
    { included: true, text: 'Analytics avançados de conversão' },
  ],
};

export default function SelectPlan() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth() || {};
  const [subscription, setSubscription] = useState<any>(null);
  const [config, setConfig] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [requesting, setRequesting] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Verificar permissão - apenas lojistas
  useEffect(() => {
    if (!authLoading && user?.activeRole !== 'lojista') {
      router.push('/access-denied');
    }
  }, [user, authLoading, router]);

  // Carregar dados
  useEffect(() => {
    if (user?.activeRole === 'lojista') {
      loadData();
    }
  }, [user]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [subRes, configRes] = await Promise.all([
        api.get('/settings/store-subscription'),
        api.get('/settings/platform-config'),
      ]);
      setSubscription(subRes.data);
      setConfig(configRes.data);
      setMessage(null);
    } catch (err: any) {
      console.error('Erro ao carregar:', err);
      setMessage({ type: 'error', text: 'Erro ao carregar dados' });
    } finally {
      setLoading(false);
    }
  };

  const handleRequestPlanChange = async (newPlan: string) => {
    if (subscription.currentPlan === newPlan) {
      setMessage({ type: 'info', text: 'Você já está neste plano' });
      return;
    }

    setRequesting(newPlan);
    try {
      const res = await api.post('/settings/store-subscription/request-change', { newPlan });
      setSubscription(res.data.subscription);
      setMessage({
        type: 'success',
        text: 'Solicitação enviada! O CEO analisará sua requisição em breve.',
      });
      setTimeout(() => setMessage(null), 4000);
    } catch (err: any) {
      console.error('Erro:', err);
      setMessage({
        type: 'error',
        text: err?.response?.data?.error || 'Erro ao solicitar mudança',
      });
    } finally {
      setRequesting(null);
    }
  };

  if (authLoading || loading) {
    return (
      <div className={styles.loadingWrapper}>
        <LoadingSkeleton variant="cards" />
      </div>
    );
  }

  if (user?.activeRole !== 'lojista' || !subscription || !config) {
    return null;
  }

  const getPlanName = (plan: string) => {
    switch (plan) {
      case 'plan1': return 'Plano 1 (Marketplace Only)';
      case 'plan2': return 'Plano 2 (Marketplace + Motoboys)';
      case 'plan3': return 'Plano 3 (Premium)';
      default: return 'Desconhecido';
    }
  };

  const getPlanEmoji = (plan: string) => {
    switch (plan) {
      case 'plan1': return <Icon name="package" size={16} />;
      case 'plan2': return <Icon name="truck" size={16} />;
      case 'plan3': return <Icon name="crown" size={16} />;
      default: return <Icon name="clipboard" size={16} />;
    }
  };

  const plans = [
    {
      id: 'plan1',
      name: 'Plano 1',
      subtitle: 'Marketplace Only',
      emoji: <Icon name="package" size={24} />,
      commission: config.commissionPlan1,
      features: PlanFeatures.plan1,
    },
    {
      id: 'plan2',
      name: 'Plano 2',
      subtitle: 'Marketplace + Motoboys',
      emoji: <Icon name="truck" size={24} />,
      commission: config.commissionPlan2,
      features: PlanFeatures.plan2,
    },
    {
      id: 'plan3',
      name: 'Plano 3',
      subtitle: 'Premium',
      emoji: <Icon name="crown" size={24} />,
      commission: config.commissionPlan3,
      features: PlanFeatures.plan3,
    },
  ];

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.pageTitle}><Icon name="package" size={20} /> Escolher Plano</h1>
        <p className={styles.pageSubtitle}>
          Seu plano atual: {getPlanEmoji(subscription.currentPlan)} {getPlanName(subscription.currentPlan)}
        </p>

        {message && (
          <div
            className={`${styles.alert} ${
              message.type === 'success'
                ? styles.alertSuccess
                : message.type === 'error'
                ? styles.alertError
                : styles.alertInfo
            }`}
          >
            {message.text}
          </div>
        )}

        {/* Status de requisição pendente */}
        {subscription.planChangeStatus === 'pending' && (
          <div className={styles.pendingBanner}>
            <p className={styles.pendingBannerTitle}><Icon name="clock" size={14} /> Você tem uma solicitação pendente</p>
            <p className={styles.pendingBannerText}>
              Plano solicitado: {getPlanEmoji(subscription.requestedPlan)} {getPlanName(subscription.requestedPlan)}
            </p>
            <p className={styles.pendingBannerNote}>
              Aguardando aprovação do CEO...
            </p>
          </div>
        )}

        {subscription.planChangeStatus === 'rejected' && (
          <div className={styles.rejectedBanner}>
            <p className={styles.rejectedBannerTitle}><Icon name="x-circle" size={14} /> Sua solicitação foi rejeitada</p>
            <p className={styles.rejectedBannerText}>
              Motivo: {subscription.rejectionReason}
            </p>
          </div>
        )}

        {/* Planos */}
        <div className={styles.plansGrid}>
          {plans.map((plan) => {
            const isCurrent = subscription.currentPlan === plan.id;
            const isPending = subscription.planChangeStatus === 'pending' && subscription.requestedPlan === plan.id;

            return (
              <div
                key={plan.id}
                className={`${styles.planCard} ${isCurrent ? styles.planCardSelected : ''}`}
              >
                {isCurrent && (
                  <div className={styles.currentBadge}>
                    <Icon name="check-circle" size={14} /> Plano Atual
                  </div>
                )}

                <div className={styles.planHeader}>
                  <span className={styles.planEmoji}>{plan.emoji}</span>
                  <h3 className={styles.planName}>{plan.name}</h3>
                  <p className={styles.planSubtitle}>{plan.subtitle}</p>
                </div>

                <div className={styles.commissionBox}>
                  <p className={styles.commissionLabel}>Comissão da plataforma</p>
                  <p className={styles.commissionValue}>{plan.commission}%</p>
                  <p className={styles.commissionNote}>
                    Você recebe: {100 - plan.commission}%
                  </p>
                </div>

                <div className={styles.featuresList}>
                  <p className={styles.featuresTitle}>Recursos:</p>
                  {plan.features.map((feature, idx) => (
                    <p key={idx} className={styles.planFeature}>
                      <Icon name={feature.included ? 'check-circle' : 'x-circle'} size={14} color={feature.included ? '#10b981' : '#ef4444'} /> {feature.text}
                    </p>
                  ))}
                </div>

                <button
                  onClick={() => handleRequestPlanChange(plan.id)}
                  disabled={isCurrent || requesting === plan.id || isPending}
                  className={`${styles.btnSelectPlan} ${
                    isCurrent
                      ? styles.btnSelectPlanCurrent
                      : isPending
                      ? styles.btnSelectPlanPending
                      : ''
                  }`}
                >
                  {isCurrent
                    ? 'Plano Atual'
                    : isPending
                    ? 'Pendente'
                    : requesting === plan.id
                    ? 'Solicitando...'
                    : 'Selecionar'}
                </button>
              </div>
            );
          })}
        </div>

        {/* Link para voltar */}
        <div className={styles.backLinkWrapper}>
          <Link href="/seller/dashboard" className={styles.backLink}>
            ← Voltar ao Dashboard
          </Link>
        </div>
      </div>
    </div>
  );
}
