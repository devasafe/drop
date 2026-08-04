import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { Zap, Wallet, Settings, Gift } from 'lucide-react';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import { Button } from '../../components/ui/Button';
import { Sheet } from '../../components/ui/Sheet';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
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
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { gam } = useGamification(user?.id || user?._id);
  const [benefits, setBenefits] = useState<Benefit[]>([]);
  const [loading, setLoading] = useState(true);
  const [confirmB, setConfirmB] = useState<Benefit | null>(null);
  const [redeeming, setRedeeming] = useState(false);

  useEffect(() => {
    api.get('/gamification/benefits').then((r) => setBenefits(r.data)).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const points = gam?.points || 0;

  const confirmRedeem = async () => {
    if (!confirmB) return;
    setRedeeming(true);
    try {
      await api.post('/gamification/redeem', { user_id: user?.id || user?._id, benefit: confirmB.id });
      showToast(`"${confirmB.name}" resgatado com sucesso!`, 'success');
      setConfirmB(null);
    } catch (err: any) {
      showToast(err?.response?.data?.error || 'Erro ao resgatar', 'error');
    } finally {
      setRedeeming(false);
    }
  };

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <h1 className={styles.title}>Benefícios</h1>
            <Button variant="ghost" size="sm" onClick={() => router.push('/motoboy/gamification')}>Desempenho</Button>
          </header>

          <div className={styles.pointsCard}>
            <span className={styles.pointsGlow} aria-hidden="true" />
            <span className={styles.pointsIcon}><Zap size={24} aria-hidden="true" /></span>
            <div>
              <div className={styles.pointsValue}>{points} pts</div>
              <div className={styles.pointsLabel}>disponíveis para resgate</div>
            </div>
          </div>

          {loading ? (
            <>
              <Skeleton height={72} radius="var(--r-lg)" />
              <Skeleton height={72} radius="var(--r-lg)" />
            </>
          ) : benefits.length === 0 ? (
            <EmptyState icon={<Gift size={22} aria-hidden="true" />} title="Sem benefícios agora" description="Novas recompensas para resgatar aparecem aqui." />
          ) : (
            <div className={styles.benefitList}>
              {benefits.map((b) => {
                const canRedeem = points >= b.cost;
                return (
                  <div key={b.id} className={`${styles.benefit} ${canRedeem ? '' : styles.locked}`}>
                    <span className={styles.benefitIcon}>{b.icon}</span>
                    <div className={styles.benefitInfo}>
                      <div className={styles.benefitName}>{b.name}</div>
                      <div className={styles.benefitDesc}>{b.description}</div>
                      <div className={styles.benefitType}>
                        {b.type === 'wallet'
                          ? <><Wallet size={13} aria-hidden="true" /> Crédito na carteira</>
                          : <><Settings size={13} aria-hidden="true" /> Automático</>}
                      </div>
                    </div>
                    <div className={styles.benefitRight}>
                      <span className={styles.benefitCost}>{b.cost} pts</span>
                      <Button size="sm" disabled={!canRedeem} onClick={() => setConfirmB(b)}>
                        {canRedeem ? 'Resgatar' : 'Insuficiente'}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      <Sheet open={!!confirmB} onClose={() => setConfirmB(null)} title="Resgatar benefício">
        {confirmB && (
          <div className={styles.sheetBody}>
            <p className={styles.sheetText}>
              Resgatar <strong>{confirmB.name}</strong> por <strong>{confirmB.cost} pts</strong>?
            </p>
            <Button onClick={confirmRedeem} disabled={redeeming}>
              {redeeming ? 'Resgatando…' : 'Confirmar resgate'}
            </Button>
          </div>
        )}
      </Sheet>
    </ProtectedRoute>
  );
}
