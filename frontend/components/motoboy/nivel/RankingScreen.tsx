// frontend/components/motoboy/nivel/RankingScreen.tsx
import { useEffect, useState } from 'react';
import { Medal, Trophy } from 'lucide-react';
import MotoboyShell from '../panel/MotoboyShell';
import blocks from '../../panel/PanelBlocks.module.css';
import { Alert } from '../../ui/Alert';
import { EmptyState } from '../../ui/EmptyState';
import { Skeleton } from '../../ui/Skeleton';
import { useAuth } from '../../../contexts/AuthContext';
import { useGamificationFeatures } from '../../../hooks/useGamificationFeatures';
import { useRanking } from '../../../hooks/useSync';
import api from '../../../lib/api';
import { formatMoney } from '../../../lib/money';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import { formatPoints, rankingMonth, shortName } from '../../../lib/motoboyLevel';
import styles from './Nivel.module.css';

interface Prize { position: number; amount: number }

/** Ranking do mês (protótipo 24). A classificação aparece sempre; os prêmios só com o freio ligado. */
export function RankingScreen({ now }: { now?: Date } = {}) {
  const { user } = useAuth() || ({} as any);
  const uid = String(user?.id || user?._id || '');
  const { features, loading: featuresLoading } = useGamificationFeatures();
  const { ranking, loading, error, reload } = useRanking();
  const prizesOn = !featuresLoading && features.rankingPrizesEnabled === true;
  const [prizes, setPrizes] = useState<Prize[]>([]);

  useEffect(() => {
    if (!prizesOn) { setPrizes([]); return; }
    let alive = true;
    api.get('/ranking-prizes')
      .then((r) => { if (alive) setPrizes(Array.isArray(r.data?.prizes) ? r.data.prizes : []); })
      .catch(() => { if (alive) setPrizes([]); }); // fail closed: sem valor presumido
    return () => { alive = false; };
  }, [prizesOn]);

  const month = rankingMonth(now ?? new Date());
  const list: any[] = Array.isArray(ranking) ? ranking : [];
  const myIndex = list.findIndex((r) => String(r?.user_id) === uid);
  const me = myIndex >= 0 ? list[myIndex] : null;
  const above = myIndex > 0 ? list[myIndex - 1] : null;
  const prizeOf = (pos: number) => (prizesOn ? prizes.find((p) => Number(p.position) === pos) : undefined);
  // Top 10 e, se estiver fora dele, a sua linha.
  const shown = list.map((r, i) => ({ r, pos: i + 1 })).filter(({ pos }) => pos <= 10 || pos === myIndex + 1);

  let content: JSX.Element;
  if (loading) {
    content = <><Skeleton height={96} radius="var(--radius-lg)" /><Skeleton height={240} radius="var(--radius-lg)" /></>;
  } else if (error) {
    content = (
      <Alert tone="error" title="Não conseguimos abrir o ranking" action={{ label: 'Tentar de novo', onClick: () => reload?.() }}>
        Confira a conexão e tente de novo.
      </Alert>
    );
  } else if (list.length === 0) {
    content = <EmptyState icon={<Trophy />} title="Ninguém pontuou ainda" description="Complete entregas para aparecer no ranking do mês." />;
  } else {
    content = (
      <>
        {me ? (
          <section className={[blocks.blk, blocks.blkBrand].join(' ')} aria-label="Sua posição">
            <div className={blocks.head}>
              <span className={[styles.pos, styles.posMe].join(' ')}>{`${myIndex + 1}º`}</span>
              <span className={blocks.tx}>
                <b>{`Você · ${shortName(me.name)}`}</b>
                <span>{`${me.level} · ${formatPoints(me.pontosMes)} pts no mês`}</span>
              </span>
              {myIndex < 10 && <span className={[blocks.tag, blocks.tagBrand].join(' ')}>Top 10</span>}
            </div>
            <p className={blocks.sub}>
              {above
                ? `Faltam ${formatPoints(Number(above.pontosMes) - Number(me.pontosMes) + 1)} pts para passar o ${myIndex}º lugar.`
                : 'Você está em 1º lugar.'}
            </p>
          </section>
        ) : (
          <section className={blocks.blk} aria-label="Sua posição">
            <p className={blocks.sub}>Faça a primeira corrida do mês para entrar no ranking.</p>
          </section>
        )}
        <ul className={blocks.list} aria-label="Classificação">
          {shown.map(({ r, pos }) => {
            const isMe = pos === myIndex + 1;
            const prize = prizeOf(pos);
            return (
              <li key={String(r.user_id ?? pos)} className={[blocks.row, isMe && blocks.rowCurrent].filter(Boolean).join(' ')}>
                {pos <= 3
                  ? <span className={[blocks.ico, pos === 1 ? blocks.icoWarn : ''].filter(Boolean).join(' ')} aria-hidden="true"><Medal size={18} /></span>
                  : <span className={styles.pos} aria-hidden="true">{`${pos}º`}</span>}
                <span className={blocks.tx}>
                  <b>{isMe ? `${pos}º · Você` : `${pos}º · ${shortName(r.name)}`}</b>
                  <span>{`${r.level} · ${formatPoints(r.pontosMes)} pts`}</span>
                </span>
                {prize && <span className={styles.prize}>{formatMoney(Number(prize.amount))}</span>}
              </li>
            );
          })}
        </ul>
      </>
    );
  }

  return (
    <MotoboyShell
      title={`Ranking · ${month.name}`}
      back={MOTOBOY_ROUTES.nivel}
      actions={<span className={blocks.meta}>{month.daysLeft > 0 ? `faltam ${month.daysLeft} dias` : 'último dia'}</span>}
    >
      <div className={blocks.body}>
        {content}
        {!featuresLoading && !features.rankingPrizesEnabled && (
          <Alert tone="info" title="Prêmios do ranking pausados">
            A posição continua valendo. Avisamos quando os prêmios voltarem.
          </Alert>
        )}
      </div>
    </MotoboyShell>
  );
}

export default RankingScreen;
