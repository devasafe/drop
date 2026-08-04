import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/router';
import { Trophy } from 'lucide-react';
import useRequireAuth from '../../hooks/useRequireAuth';
import ProtectedRoute from '../../components/ProtectedRoute';
import Icon from '../../components/Icon';
import { Button } from '../../components/ui/Button';
import { Chip } from '../../components/ui/Chip';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { useToast } from '../../components/ui/Toast';
import { useGamification } from '../../hooks/useSync';
import { useAuth } from '../../contexts/AuthContext';
import styles from './MotoboyGamification.module.css';

const LEVEL_ORDER = ['Bronze', 'Prata', 'Ouro', 'Platina', 'Diamante', 'Lendário'];

const LEVEL_THRESHOLDS: Record<string, { min: number; max: number; color: string; icon: string }> = {
  Bronze:   { min: 0,     max: 499,      color: '#CD7F32', icon: 'medal' },
  Prata:    { min: 500,   max: 1499,     color: '#C0C0C0', icon: 'award' },
  Ouro:     { min: 1500,  max: 2999,     color: '#FFD700', icon: 'trophy' },
  Platina:  { min: 3000,  max: 5999,     color: '#E5E4E2', icon: 'gem' },
  Diamante: { min: 6000,  max: 9999,     color: '#60A5FA', icon: 'star' },
  Lendário: { min: 10000, max: Infinity, color: '#A855F7', icon: 'crown' },
};

const ALL_BADGES = [
  { id: 'Primeira entrega', label: 'Primeira Entrega', icon: 'play', description: 'Completou sua primeira entrega avaliada', category: 'Entregas' },
  { id: '10 Missões', label: '10 Missões', icon: 'shopping-bag', description: 'Completou 10 entregas', category: 'Entregas' },
  { id: '50 Missões', label: '50 Missões', icon: 'package', description: 'Completou 50 entregas', category: 'Entregas' },
  { id: 'Centurião', label: 'Centurião', icon: 'shield', description: 'Completou 100 entregas', category: 'Entregas' },
  { id: 'Mestre das Ruas', label: 'Mestre das Ruas', icon: 'map-pin', description: 'Completou 250 entregas', category: 'Entregas' },
  { id: 'Lenda Viva', label: 'Lenda Viva', icon: 'zap', description: 'Completou 500 entregas', category: 'Entregas' },
  { id: 'Imortal', label: 'Imortal', icon: 'crown', description: 'Completou 1000 entregas', category: 'Entregas' },
  { id: 'Motoboy 5 estrelas', label: '5 Estrelas', icon: 'star', description: 'Recebeu 5 avaliações nota máxima', category: 'Qualidade' },
  { id: 'Sem reclamações', label: 'Sem Reclamações', icon: 'check-circle', description: '10+ entregas todas com nota 3+', category: 'Qualidade' },
  { id: 'Impecável', label: 'Impecável', icon: 'check', description: 'Recebeu 20 avaliações nota 5', category: 'Qualidade' },
  { id: 'Nota Máxima', label: 'Nota Máxima', icon: 'trophy', description: 'Média ≥ 4.9 com 30+ avaliações', category: 'Qualidade' },
  { id: 'Madrugador', label: 'Madrugador', icon: 'clock', description: '5 entregas antes das 8h', category: 'Horário' },
  { id: 'Noturno', label: 'Noturno', icon: 'eye', description: '5 entregas após as 22h', category: 'Horário' },
  { id: 'Guerreiro do FDS', label: 'Guerreiro do FDS', icon: 'target', description: '10 entregas em fins de semana', category: 'Horário' },
  { id: 'Corredor', label: 'Corredor', icon: 'truck', description: 'Acumulou 100km em entregas', category: 'Distância' },
  { id: 'Maratonista', label: 'Maratonista', icon: 'award', description: 'Acumulou 500km em entregas', category: 'Distância' },
  { id: 'Explorador Urbano', label: 'Explorador Urbano', icon: 'briefcase', description: 'Acumulou 1000km em entregas', category: 'Distância' },
  { id: 'Dedicado', label: 'Dedicado', icon: 'calendar', description: 'Entregou em 3 dias diferentes na semana', category: 'Consistência' },
  { id: 'Incansável', label: 'Incansável', icon: 'hourglass', description: '7 dias seguidos com ao menos 1 entrega', category: 'Consistência' },
  { id: 'Máquina', label: 'Máquina', icon: 'settings', description: '20 dias com entrega no mês', category: 'Consistência' },
  { id: 'Escalando', label: 'Escalando', icon: 'trending-up', description: 'Atingiu o nível Prata', category: 'Nível' },
  { id: 'Ouro Puro', label: 'Ouro Puro', icon: 'medal', description: 'Atingiu o nível Ouro', category: 'Nível' },
  { id: 'Elite', label: 'Elite', icon: 'gem', description: 'Atingiu o nível Platina', category: 'Nível' },
  { id: 'Diamante', label: 'Diamante', icon: 'edit', description: 'Atingiu o nível Diamante', category: 'Nível' },
  { id: 'Lendário', label: 'Lendário', icon: 'download', description: 'Atingiu o nível Lendário', category: 'Nível' },
  { id: 'Velocista', label: 'Velocista', icon: 'chart-bar', description: '5 entregas em menos de 20 min', category: 'Especial' },
  { id: 'Pódio', label: 'Pódio', icon: 'users', description: 'Top 3 no ranking mensal', category: 'Especial' },
  { id: 'Campeão do Mês', label: 'Campeão do Mês', icon: 'gift', description: '1º lugar no ranking mensal', category: 'Especial' },
];

const BADGE_CATEGORIES = ['Entregas', 'Qualidade', 'Horário', 'Distância', 'Consistência', 'Nível', 'Especial'];

export default function MotoboyGamification() {
  useRequireAuth(['motoboy']);
  const router = useRouter();
  const { user } = useAuth();
  const { showToast } = useToast();
  const { gam, loading } = useGamification(user?.id || user?._id);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const prevBadges = useRef<string[]>([]);

  useEffect(() => {
    if (!gam?.badges) return;
    if (prevBadges.current.length > 0) {
      const fresh = gam.badges.filter((b: string) => !prevBadges.current.includes(b));
      if (fresh.length > 0) showToast(`Novo badge desbloqueado: ${fresh.join(', ')}`, 'success');
    }
    prevBadges.current = gam.badges || [];
  }, [gam, showToast]);

  const unlockedSet = new Set<string>(gam?.badges || []);

  const getLevelProgress = () => {
    const lvl = gam?.level || 'Bronze';
    const threshold = LEVEL_THRESHOLDS[lvl];
    if (!threshold || threshold.max === Infinity) return 100;
    const total = gam?.totalPoints || 0;
    return Math.min(100, Math.round(((total - threshold.min) / (threshold.max - threshold.min + 1)) * 100));
  };

  const getNextLevel = () => {
    const lvl = gam?.level || 'Bronze';
    const idx = LEVEL_ORDER.indexOf(lvl);
    return LEVEL_ORDER[idx + 1] || null;
  };

  const filteredBadges = activeCategory ? ALL_BADGES.filter((b) => b.category === activeCategory) : ALL_BADGES;
  const lvlInfo = LEVEL_THRESHOLDS[gam?.level || 'Bronze'];
  const progress = getLevelProgress();
  const nextLevel = getNextLevel();

  return (
    <ProtectedRoute required_role="motoboy">
      <div className={styles.page}>
        <div className={styles.container}>
          <header className={styles.header}>
            <h1 className={styles.title}>Desempenho</h1>
            <div className={styles.headerActions}>
              <Button variant="ghost" size="sm" onClick={() => router.push('/motoboy/ranking')}>Ranking</Button>
              <Button variant="ghost" size="sm" onClick={() => router.push('/motoboy/beneficios')}>Benefícios</Button>
            </div>
          </header>

          {loading ? (
            <>
              <Skeleton height={80} radius="var(--r-lg)" />
              <Skeleton height={120} radius="var(--r-lg)" />
              <Skeleton height={200} radius="var(--r-lg)" />
            </>
          ) : !gam ? (
            <EmptyState icon={<Trophy size={22} aria-hidden="true" />} title="Sem dados" description="Não foi possível carregar seu desempenho agora." />
          ) : (
            <>
              {/* Stats */}
              <div className={styles.stats}>
                <div className={styles.stat}>
                  <div className={styles.statValue}>{gam.points || 0}</div>
                  <div className={styles.statLabel}>Pontos disponíveis</div>
                </div>
                <div className={styles.stat}>
                  <div className={styles.statValue}>{gam.totalPoints || 0}</div>
                  <div className={styles.statLabel}>Acumulados</div>
                </div>
                <div className={styles.stat}>
                  <div className={styles.statValue}>{unlockedSet.size}</div>
                  <div className={styles.statLabel}>de {ALL_BADGES.length} badges</div>
                </div>
              </div>

              {/* Nível */}
              <div className={styles.levelCard}>
                <div className={styles.levelHead}>
                  <div className={styles.levelId}>
                    <span className={styles.levelIcon} style={{ color: lvlInfo?.color }}>
                      <Icon name={(lvlInfo?.icon || 'award') as any} size={22} />
                    </span>
                    <span className={styles.levelName} style={{ color: lvlInfo?.color }}>{gam.level || 'Bronze'}</span>
                  </div>
                  {nextLevel && (
                    <span className={styles.levelNext}>
                      Faltam {Math.max(0, (LEVEL_THRESHOLDS[nextLevel]?.min || 0) - (gam.totalPoints || 0))} pts para {nextLevel}
                    </span>
                  )}
                </div>
                <div className={styles.progressTrack}>
                  <div className={styles.progressBar} style={{ width: `${progress}%` }} />
                </div>
                <div className={styles.progressLabel}>{progress}% para {nextLevel || 'nível máximo'}</div>
              </div>

              {/* Conquistas */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Conquistas</h2>
                <div className={styles.filters}>
                  <Chip label="Todas" active={!activeCategory} onClick={() => setActiveCategory(null)} />
                  {BADGE_CATEGORIES.map((cat) => (
                    <Chip key={cat} label={cat} active={activeCategory === cat} onClick={() => setActiveCategory(activeCategory === cat ? null : cat)} />
                  ))}
                </div>
                <div className={styles.badgesGrid}>
                  {filteredBadges.map((badge) => {
                    const unlocked = unlockedSet.has(badge.id);
                    return (
                      <div key={badge.id} className={`${styles.badge} ${unlocked ? '' : styles.badgeLocked}`}>
                        <span className={styles.badgeIcon}>
                          <Icon name={(unlocked ? badge.icon : 'lock') as any} size={24} />
                        </span>
                        <span className={styles.badgeName}>{badge.label}</span>
                        <span className={styles.badgeDesc}>{badge.description}</span>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Histórico */}
              <section className={styles.section}>
                <h2 className={styles.sectionTitle}>Histórico recente</h2>
                {gam.history && gam.history.length > 0 ? (
                  <div className={styles.histCard}>
                    {gam.history.slice(-20).reverse().map((h: any, i: number) => (
                      <div key={i} className={styles.histRow}>
                        <div className={styles.histInfo}>
                          <div className={styles.histAction}>{h.action}</div>
                          <div className={styles.histDate}>{new Date(h.date).toLocaleDateString('pt-BR')}</div>
                        </div>
                        <div className={h.points > 0 ? styles.histPos : styles.histNeg}>
                          {h.points > 0 ? '+' : ''}{h.points} pts
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<Trophy size={22} aria-hidden="true" />} title="Nada ainda" description="Suas conquistas de pontos aparecem aqui." />
                )}
              </section>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

export async function getServerSideProps() {
  return { props: {} };
}
