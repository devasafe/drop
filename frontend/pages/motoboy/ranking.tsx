import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Trophy } from 'lucide-react';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useRanking } from '../../hooks/useSync';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import styles from './MotoboyRanking.module.css';

interface PrizeEntry { position: number; amount: number; type: string }
interface PrizesData { month: number; year: number; prizes: PrizeEntry[]; distributed: boolean }

const MONTH_NAMES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function MotoboyMonthlyRanking() {
  useRequireAuth(['motoboy']);
  const router = useRouter();
  const { user } = useAuth();
  const { ranking, loading } = useRanking();
  const [prizes, setPrizes] = useState<PrizesData | null>(null);

  useEffect(() => {
    api.get('/ranking-prizes').then((r) => setPrizes(r.data)).catch(() => {});
  }, []);

  const data = Array.isArray(ranking) ? ranking : [];
  const currentUserId = user?.id || user?._id;
  const userRank = data.find((r) => r.user_id === currentUserId || r._id === currentUserId);
  const myPosNum = data.findIndex((r) => r.user_id === currentUserId || r._id === currentUserId) + 1;
  const getPrize = (pos: number) => prizes?.prizes?.find((p) => p.position === pos);

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <div>
              <h1 className={styles.title}>Ranking do mês</h1>
              <p className={styles.subtitle}>{prizes ? `${MONTH_NAMES[prizes.month]} ${prizes.year}` : 'Mês atual'}</p>
            </div>
            <Button variant="ghost" size="sm" onClick={() => router.push('/motoboy/gamification')}>Desempenho</Button>
          </header>

          {loading ? (
            <>
              <Skeleton height={72} radius="var(--r-lg)" />
              <Skeleton height={280} radius="var(--r-lg)" />
            </>
          ) : (
            <>
              {userRank && (
                <div className={styles.myPos}>
                  <div className={styles.myPosItem}><span className={styles.myPosValue}>{myPosNum}º</span><span className={styles.myPosLabel}>Lugar</span></div>
                  <div className={styles.myPosItem}><span className={styles.myPosValueGreen}>{userRank.pontosMes || 0}</span><span className={styles.myPosLabel}>Pontos no mês</span></div>
                  <div className={styles.myPosItem}><span className={styles.myPosValueYellow}>{userRank.level}</span><span className={styles.myPosLabel}>Nível</span></div>
                </div>
              )}

              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Classificação</h2>
                {data.length === 0 ? (
                  <EmptyState icon={<Trophy size={22} aria-hidden="true" />} title="Ninguém pontuou ainda" description="Complete entregas para aparecer no ranking do mês." />
                ) : (
                  <div className={styles.rankCard}>
                    {data.map((r, i) => {
                      const pos = i + 1;
                      const isMe = r.user_id === currentUserId || r._id === currentUserId;
                      const prize = getPrize(pos);
                      return (
                        <div key={r.user_id || i} className={`${styles.rankRow} ${isMe ? styles.rankRowMe : ''}`}>
                          <span className={`${styles.rankPos} ${pos <= 3 ? styles.rankPosTop : ''}`}>{pos}º</span>
                          <div className={styles.rankInfo}>
                            <span className={styles.rankName}>
                              {r.name}{isMe && <span className={styles.youChip}>Você</span>}
                            </span>
                            <span className={styles.rankMeta}>{r.level}{prize ? ` · prêmio R$ ${prize.amount.toFixed(0)}` : ''}</span>
                          </div>
                          <span className={styles.rankPts}>{r.pontosMes || 0} pts</span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
