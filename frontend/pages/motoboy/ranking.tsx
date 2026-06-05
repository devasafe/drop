import { useEffect, useState } from 'react';
import Link from 'next/link';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import { useRanking } from '../../hooks/useSync';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../lib/api';
import styles from './MotoboyRanking.module.css';

interface PrizeEntry { position: number; amount: number; type: string }
interface PrizesData { month: number; year: number; prizes: PrizeEntry[]; distributed: boolean }

const MEDAL: Record<number, string> = { 1: '#1', 2: '#2', 3: '#3' };
const MONTH_NAMES = ['', 'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

export default function MotoboyMonthlyRanking() {
  useRequireAuth(['motoboy']);
  const { user } = useAuth();
  const { ranking, loading } = useRanking();
  const [prizes, setPrizes] = useState<PrizesData | null>(null);

  useEffect(() => {
    api.get('/ranking-prizes').then(r => setPrizes(r.data)).catch(() => {});
  }, []);

  const data = Array.isArray(ranking) ? ranking : [];
  const currentUserId = user?.id || user?._id;
  const userRank = data.find(r => r.user_id === currentUserId || r._id === currentUserId);

  const getMedal = (pos: number) => MEDAL[pos] || `#${pos}`;
  const getPrize = (pos: number) => prizes?.prizes?.find(p => p.position === pos);

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        <div className={styles.container}>

          {/* Header */}
          <div className={styles.header}>
            <div>
              <h1 className={styles.pageTitle}>Ranking do Mês</h1>
              <p className={styles.pageSubtitle}>
                {prizes ? `${MONTH_NAMES[prizes.month]} ${prizes.year}` : 'Mês atual'}
              </p>
            </div>
            <Link href="/motoboy/gamification" className={styles.linkBtn}><Icon name="trophy" size={16} /> Gamificação</Link>
          </div>

          {loading ? (
            <div className={styles.loadingBox}>
              <LoadingSkeleton variant="list" count={5} />
            </div>
          ) : (
            <>
              {/* Pódio top 3 */}
              {data.length > 0 && (
                <div className={styles.podiumSection}>
                  <div className={styles.podiumGrid}>
                    {/* Exibe na ordem: 2º, 1º, 3º para efeito visual */}
                    {[1, 0, 2].map(idx => {
                      const r = data[idx];
                      if (!r) return null;
                      const pos = idx + 1;
                      const isMe = r.user_id === currentUserId || r._id === currentUserId;
                      const prize = getPrize(pos);
                      return (
                        <div
                          key={r.user_id || idx}
                          className={`${styles.podiumCard} ${styles[`podiumPos${pos}`]} ${isMe ? styles.podiumCardMe : ''}`}
                        >
                          <div className={styles.podiumMedal}>{getMedal(pos)}</div>
                          <div className={styles.podiumName}>{r.name}</div>
                          <div className={styles.podiumPts}>{r.pontosMes || 0} pts</div>
                          <div className={styles.podiumLevel}>{r.level}</div>
                          {prize && (
                            <div className={styles.podiumPrize}>
                              R$ {prize.amount.toFixed(0)}
                              {prize.type === 'manual' && <span className={styles.prizeManual}> (manual)</span>}
                            </div>
                          )}
                          {r.badges?.length > 0 && (
                            <div className={styles.podiumBadgeCount}>{r.badges.length} badge{r.badges.length > 1 ? 's' : ''}</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Prêmios */}
              {prizes && (
                <div className={styles.prizesCard}>
                  <h3 className={styles.prizesTitle}>
                    Prêmios do Mês
                    {prizes.distributed && <span className={styles.distributedBadge}>Distribuídos</span>}
                  </h3>
                  <div className={styles.prizesGrid}>
                    {prizes.prizes.map(p => (
                      <div key={p.position} className={styles.prizeItem}>
                        <span className={styles.prizePosition}>{getMedal(p.position)}</span>
                        <span className={styles.prizeAmount}>R$ {p.amount.toFixed(0)}</span>
                        <span className={styles.prizeType}>{p.type === 'wallet' ? 'na carteira' : 'manual'}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Ranking completo */}
              <div className={styles.rankingCard}>
                <h2 className={styles.rankingTitle}>Ranking Completo</h2>
                {data.length === 0 ? (
                  <p className={styles.empty}>Nenhum motoboy pontuou este mês ainda.</p>
                ) : (
                  <div className={styles.rankingList}>
                    {data.map((r, i) => {
                      const pos = i + 1;
                      const isMe = r.user_id === currentUserId || r._id === currentUserId;
                      return (
                        <div key={r.user_id || i} className={`${styles.rankRow} ${isMe ? styles.rankRowMe : ''}`}>
                          <div className={styles.rankPos}>{getMedal(pos)}</div>
                          <div className={styles.rankName}>{r.name}{isMe && <span className={styles.youChip}>Você</span>}</div>
                          <div className={styles.rankLevel}>{r.level}</div>
                          <div className={styles.rankPts}>{r.pontosMes || 0} pts</div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Sua posição */}
              {userRank && (
                <div className={styles.myPositionCard}>
                  <h3 className={styles.myPositionTitle}>Sua Posição</h3>
                  <div className={styles.myPositionRow}>
                    <div className={styles.myPositionStat}>
                      <div className={styles.myPositionValue}>
                        #{data.findIndex(r => r.user_id === currentUserId || r._id === currentUserId) + 1}
                      </div>
                      <div className={styles.myPositionLabel}>Lugar</div>
                    </div>
                    <div className={styles.myPositionStat}>
                      <div className={styles.myPositionValueGreen}>{userRank.pontosMes || 0}</div>
                      <div className={styles.myPositionLabel}>Pontos no mês</div>
                    </div>
                    <div className={styles.myPositionStat}>
                      <div className={styles.myPositionValueYellow}>{userRank.level}</div>
                      <div className={styles.myPositionLabel}>Nível</div>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
