import { useState, useEffect } from 'react';
import Link from 'next/link';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import { useGamification } from '../../hooks/useSync';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import styles from './MotoboyBeneficios.module.css';

interface Benefit {
  id: string;
  name: string;
  description: string;
  cost: number;
  type: 'wallet' | 'system';
  icon: string;
}

export default function MotoboyBeneficios() {
  useRequireAuth(['motoboy']);
  const { user } = useAuth();
  const { gam } = useGamification(user?.id || user?._id);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    api.get('/gamification/benefits').then(r => setBenefits(r.data)).catch(() => {});
  }, []);

  const points = gam?.points || 0;

  const handleRedeem = async (benefit: Benefit) => {
    if (points < benefit.cost) return;
    if (!confirm(`Resgatar "${benefit.name}" por ${benefit.cost} pontos?`)) return;
    setRedeeming(benefit.id);
    setSuccessMsg('');
    setErrorMsg('');
    try {
      await api.post('/gamification/redeem', {
        user_id: user?.id || user?._id,
        benefit: benefit.id,
      });
      setSuccessMsg(`"${benefit.name}" resgatado com sucesso!`);
    } catch (err: any) {
      setErrorMsg(err?.response?.data?.error || 'Erro ao resgatar');
    } finally {
      setRedeeming(null);
    }
  };

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        <div className={styles.container}>

          <div className={styles.header}>
            <div>
              <h1 className={styles.pageTitle}>Benefícios</h1>
              <p className={styles.pageSubtitle}>Resgate recompensas com seus pontos</p>
            </div>
            <Link href="/motoboy/gamification" className={styles.linkBtn}>← Gamificação</Link>
          </div>

          {/* Pontos disponíveis */}
          <div className={styles.pointsCard}>
            <div className={styles.pointsIcon}><Icon name="zap" size={28} /></div>
            <div>
              <div className={styles.pointsValue}>{points} pts</div>
              <div className={styles.pointsLabel}>disponíveis para resgate</div>
            </div>
          </div>

          {successMsg && <div className={styles.successAlert}>{successMsg}</div>}
          {errorMsg && <div className={styles.errorAlert}>{errorMsg}</div>}

          {/* Grid de benefícios */}
          <div className={styles.benefitsGrid}>
            {benefits.map(b => {
              const canRedeem = points >= b.cost;
              const isLoading = redeeming === b.id;
              return (
                <div key={b.id} className={`${styles.benefitCard} ${!canRedeem ? styles.benefitCardLocked : ''}`}>
                  <div className={styles.benefitIcon}>{b.icon}</div>
                  <div className={styles.benefitName}>{b.name}</div>
                  <div className={styles.benefitDesc}>{b.description}</div>
                  <div className={styles.benefitFooter}>
                    <div className={styles.benefitCost}>
                      <span className={styles.costValue}>{b.cost}</span>
                      <span className={styles.costLabel}> pts</span>
                    </div>
                    <button
                      className={`${styles.redeemBtn} ${!canRedeem ? styles.redeemBtnDisabled : ''}`}
                      disabled={!canRedeem || !!redeeming}
                      onClick={() => handleRedeem(b)}
                    >
                      {isLoading ? '...' : canRedeem ? 'Resgatar' : 'Insuficiente'}
                    </button>
                  </div>
                  {b.type === 'wallet' && <div className={styles.typeChip}><Icon name="wallet" size={14} /> Crédito na carteira</div>}
                  {b.type === 'system' && <div className={styles.typeChipSystem}><Icon name="settings" size={14} /> Benefício automático</div>}
                </div>
              );
            })}
          </div>

          {benefits.length === 0 && (
            <LoadingSkeleton variant="list" count={3} />
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
