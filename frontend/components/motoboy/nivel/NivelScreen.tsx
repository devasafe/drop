import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Gift, Lock, Trophy } from 'lucide-react';
import MotoboyShell from '../panel/MotoboyShell';
import { NavRow } from '../../panel/NavRow';
import blocks from '../../panel/PanelBlocks.module.css';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import { ProgressBar } from '../../ui/ProgressBar';
import { Sheet } from '../../ui/Sheet';
import { Skeleton } from '../../ui/Skeleton';
import { useAuth } from '../../../contexts/AuthContext';
import { useGamificationFeatures } from '../../../hooks/useGamificationFeatures';
import { useGamification, useRanking } from '../../../hooks/useSync';
import api from '../../../lib/api';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import { BADGES, formatPoints, levelProgress, unlockedBadges } from '../../../lib/motoboyLevel';
import styles from './Nivel.module.css';

interface Benefit { id: string; name: string; description: string; cost: number; type: 'wallet' | 'system' }

/** Aba Nível (protótipo 7): nível, benefícios, conquistas e a linha do ranking. Funde gamification + beneficios. */
export function NivelScreen() {
  const router = useRouter();
  const { user } = useAuth() || ({} as any);
  const uid = String(user?.id || user?._id || '');
  const { features, loading: featuresLoading } = useGamificationFeatures();
  const { gam, loading: gamLoading, setGam } = useGamification(uid || undefined);
  const { ranking, loading: rankingLoading } = useRanking();
  const [benefits, setBenefits] = useState<Benefit[] | null>(null);
  const [benefitsFailed, setBenefitsFailed] = useState(false);
  const [confirm, setConfirm] = useState<Benefit | null>(null);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemMsg, setRedeemMsg] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  const loadBenefits = useCallback(() => {
    setBenefitsFailed(false);
    setBenefits(null);
    api.get('/gamification/benefits')
      .then((r) => setBenefits(Array.isArray(r.data) ? r.data : []))
      .catch(() => setBenefitsFailed(true));
  }, []);
  useEffect(() => { loadBenefits(); }, [loadBenefits]);

  const reloadGam = () => {
    if (!uid) return;
    api.get(`/gamification/${uid}`).then((r) => setGam(r.data)).catch(() => undefined);
  };

  // Fail closed: enquanto os freios carregam (ou se a leitura falhou) o resgate fica fechado.
  const redeemOn = !featuresLoading && features.benefitsRedeemEnabled === true;
  // Saldo gastável (resgate); o nível usa o total acumulado (totalPoints).
  const points = Math.max(0, Number(gam?.points) || 0);

  const confirmRedeem = async () => {
    if (!confirm || redeeming || !redeemOn) return;
    const b = confirm;
    setRedeeming(true);
    setRedeemMsg(null);
    try {
      const r = await api.post('/gamification/redeem', { benefit: b.id });
      // Os pontos só mudam pelo que o servidor devolveu.
      if (r.data?.gam) setGam(r.data.gam);
      else reloadGam();
      setRedeemMsg({ tone: 'success', text: `"${b.name}" resgatado.` });
    } catch (e: any) {
      setRedeemMsg({ tone: 'error', text: e?.response?.data?.error || 'Não deu para resgatar agora. Tente de novo.' });
    } finally {
      setConfirm(null);
      setRedeeming(false);
    }
  };

  const myIndex = ranking.findIndex((r: any) => String(r?.user_id) === uid);
  const rankingSub = rankingLoading
    ? 'Carregando…'
    : myIndex >= 0 ? `Você está em ${myIndex + 1}º de ${ranking.length}` : 'Faça a primeira corrida do mês para entrar';
  const unlocked = unlockedBadges(gam?.badges);

  let levelBlock: JSX.Element;
  if (featuresLoading || gamLoading) {
    levelBlock = <Skeleton height={120} radius="var(--radius-lg)" />;
  } else if (!gam) {
    levelBlock = <EmptyState variant="error" icon={<Trophy />} title="Não carregamos seu nível" onRetry={reloadGam} />;
  } else if (!features.gamificationPointsEnabled) {
    levelBlock = (
      <section className={blocks.blk} aria-label="Seu nível">
        <h2 className={blocks.headTitle}>Pontuação pausada</h2>
        <p className={blocks.sub}>Pontos e níveis ainda não estão valendo. Suas conquistas continuam liberadas.</p>
      </section>
    );
  } else {
    const prog = levelProgress(Number(gam.totalPoints) || 0);
    levelBlock = (
      <section className={styles.level} aria-label="Seu nível">
        <div className={styles.levelHead}>
          <span className={styles.levelIco} aria-hidden="true"><Trophy size={20} /></span>
          <span className={styles.levelTx}>
            <b>{prog.level}</b>
            <span>{`${formatPoints(prog.points)} pontos`}</span>
          </span>
          {prog.next && <span className={styles.levelNext}>{`${prog.next} em ${formatPoints(prog.points + prog.toNext)}`}</span>}
        </div>
        <ProgressBar value={prog.pct} max={100} label="Progresso até o próximo nível" valueText={prog.next ? `faltam ${prog.toNext} pontos` : 'nível máximo'} />
        <p className={styles.levelSub}>
          {prog.next ? `Faltam ${formatPoints(prog.toNext)} pontos para o nível ${prog.next}.` : 'Você está no nível mais alto.'}
        </p>
      </section>
    );
  }

  return (
    <MotoboyShell title="Nível">
      <div className={blocks.body}>
        {levelBlock}

        <section aria-labelledby="nivel-beneficios" className={blocks.stack}>
          <div className={blocks.head}>
            <h2 id="nivel-beneficios" className={blocks.cap}>Benefícios</h2>
            {redeemOn && gam && <span className={blocks.meta}>{`${formatPoints(points)} pts para trocar`}</span>}
          </div>
          {benefitsFailed ? (
            <Alert tone="error" title="Não carregamos os benefícios" action={{ label: 'Tentar de novo', onClick: loadBenefits }} />
          ) : benefits === null ? (
            <Skeleton height={120} radius="var(--radius-lg)" />
          ) : benefits.length === 0 ? (
            <EmptyState icon={<Gift />} title="Sem benefícios agora" description="Novas recompensas para trocar pontos aparecem aqui." />
          ) : (
            <ul className={blocks.list}>
              {benefits.map((b) => {
                const cost = Math.max(0, Number(b.cost) || 0);
                const fits = points >= cost;
                return (
                  <li key={b.id} className={blocks.row}>
                    <span className={[blocks.ico, fits && redeemOn ? blocks.icoBrand : ''].filter(Boolean).join(' ')} aria-hidden="true">
                      {fits || !redeemOn ? <Gift size={18} /> : <Lock size={18} />}
                    </span>
                    <span className={blocks.tx}>
                      <b>{b.name}</b>
                      <span>{`${formatPoints(cost)} pts · ${b.description}`}</span>
                    </span>
                    {!redeemOn ? (
                      <Button size="sm" disabled>Resgatar</Button>
                    ) : fits ? (
                      <Button size="sm" onClick={() => { setRedeemMsg(null); setConfirm(b); }}>Resgatar</Button>
                    ) : (
                      <span className={blocks.tag}>{`Faltam ${formatPoints(cost - points)} pts`}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          {!featuresLoading && !features.benefitsRedeemEnabled && (
            <Alert tone="warning" title="Resgates temporariamente indisponíveis">
              Seus pontos continuam guardados. Avisamos quando voltar.
            </Alert>
          )}
          {redeemMsg && <Alert tone={redeemMsg.tone} title={redeemMsg.text} />}
        </section>

        <section aria-labelledby="nivel-conquistas" className={blocks.stack}>
          <div className={blocks.head}>
            <h2 id="nivel-conquistas" className={blocks.cap}>Conquistas</h2>
            <span className={blocks.meta}>{`${unlocked.length} de ${BADGES.length}`}</span>
          </div>
          {unlocked.length > 0 ? (
            <div className={blocks.chips}>
              {unlocked.map((b) => <span key={b.id} className={[blocks.tag, blocks.tagBrand].join(' ')}>{b.label}</span>)}
            </div>
          ) : (
            <p className={blocks.sub}>Complete entregas para ganhar a primeira.</p>
          )}
        </section>

        <ul className={blocks.list}>
          <NavRow
            icon={<Trophy size={20} />}
            iconClassName={blocks.icoBrand}
            label="Ranking do mês"
            sub={rankingSub}
            end={myIndex >= 0 && myIndex < 10 ? <span className={[blocks.tag, blocks.tagBrand].join(' ')}>Top 10</span> : undefined}
            onClick={() => router.push(MOTOBOY_ROUTES.ranking)}
          />
        </ul>
      </div>

      <Sheet open={!!confirm} onClose={() => setConfirm(null)} title="Resgatar benefício">
        {confirm && (
          <div className={blocks.stack}>
            <p className={blocks.sub}>{`Trocar ${formatPoints(confirm.cost)} pts por "${confirm.name}"?`}</p>
            <Button onClick={confirmRedeem} loading={redeeming} disabled={!redeemOn}>Confirmar resgate</Button>
          </div>
        )}
      </Sheet>
    </MotoboyShell>
  );
}

export default NivelScreen;
