// Corridas (DS v2, D2): um estado por vez. Offline, online procurando, ofertas, oferta perdida,
// em análise. useMotoboyStatus (status + GPS do despacho) não muda.
import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Award, Bike, FileCheck2, ListChecks, MapPin, TriangleAlert, X, Zap } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import MotoboyShell from '../../components/motoboy/panel/MotoboyShell';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { NavRow } from '../../components/panel/NavRow';
import blocks from '../../components/panel/PanelBlocks.module.css';
import { useAuth } from '../../contexts/AuthContext';
import { useMotoboyStatus } from '../../hooks/useMotoboyStatus';
import { PUSH_FAILED_APP, usePushNotifications } from '../../hooks/usePushNotifications';
import { useGamificationFeatures } from '../../hooks/useGamificationFeatures';
import { useDeliveries, useOngoingDeliveries } from '../../hooks/useSync';
import api from '../../lib/api';
import { apiError } from '../../lib/sellerApi';
import { formatMoney } from '../../lib/money';
import { shortOrderCode } from '../../lib/customerOrder';
import { formatPoints, levelProgress } from '../../lib/motoboyLevel';
import { MOTOBOY_ROUTES } from '../../lib/motoboyRoutes';
import type { RoutePoint } from '../../lib/staticMap';
import { useNow } from '../../components/motoboy/corrida/useNow';
import { useCorridasSummary } from '../../components/motoboy/corridas/useCorridasSummary';
import { useCourierStatus } from '../../components/motoboy/corridas/useCourierStatus';
import { EmAnalise } from '../../components/motoboy/corridas/EmAnalise';
import { greeting, MotoboyBell, OnlineBadge, PowerButton } from '../../components/motoboy/corridas/CorridasTop';
import { OfferCard } from '../../components/motoboy/corridas/OfferCard';
import { OfferLost, type OfferLostVariant } from '../../components/motoboy/corridas/OfferLost';
import { offerSummary } from '../../components/motoboy/corridas/offerView';
import { readOnlineSince, writeOnlineSince } from '../../components/motoboy/corridas/onlineSince';
import styles from '../../components/motoboy/corridas/Corridas.module.css';
import { useIsNativeApp } from '../../hooks/useIsNativeApp';

const POOL_POLL_MS = 25000; // mesmo polling da tela antiga, só online
// Uma chave por dica (K39): dispensar uma não esconde a outra.
const HINT_PEAK_KEY = 'drop.motoboy.dicaPico';
const HINT_OPEN_KEY = 'drop.motoboy.dicaAppAberto';
const readHintOff = (key: string) => { try { return window.localStorage.getItem(key) === '1'; } catch { return false; } };
const writeHintOff = (key: string) => { try { window.localStorage.setItem(key, '1'); } catch { /* sem storage: some só nesta visita */ } };

export default function CorridasPage() {
  const router = useRouter();
  const { user } = useAuth();
  const userId = String(user?.id ?? user?._id ?? '');
  const firstName = String(user?.name || '').split(' ')[0] || 'motoboy';
  const { online, loading: statusLoading, setOnline, gps } = useMotoboyStatus();
  const nativeApp = useIsNativeApp();
  const push = usePushNotifications();
  const courier = useCourierStatus();
  const { summary, error: summaryError, retrying, retry: retrySummary } = useCorridasSummary();
  const { features } = useGamificationFeatures();
  const { deliveries: pool, loading: poolLoading, requiresVerification, setDeliveries: setPool, refetch } = useDeliveries();
  const { deliveries: ongoing } = useOngoingDeliveries();
  const now = useNow(30_000);

  const [gam, setGam] = useState<any>(null);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [accepting, setAccepting] = useState<string | null>(null);
  const inFlight = useRef(false);
  const [claimError, setClaimError] = useState<string | null>(null);
  // Modo direto: o servidor recusa o aceite sem chave Pix (409 MOTOBOY_PIX_KEY_REQUIRED).
  const [pixRequired, setPixRequired] = useState<string | null>(null);
  const [notVerified, setNotVerified] = useState(false);
  const [lost, setLost] = useState<{ variant: OfferLostVariant; summary: string } | null>(null);
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [self, setSelf] = useState<RoutePoint | null>(null);
  const [since, setSince] = useState<number | null>(null);
  const [peakOff, setPeakOff] = useState(false);
  const [openOff, setOpenOff] = useState(false);
  const [pushMsg, setPushMsg] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setPeakOff(readHintOff(HINT_PEAK_KEY));
    setOpenOff(readHintOff(HINT_OPEN_KEY));
  }, []);

  // "Online · 0h42": hora de início guardada no aparelho.
  useEffect(() => {
    if (statusLoading) return;
    if (online) {
      const s = readOnlineSince() ?? Date.now();
      writeOnlineSince(s);
      setSince(s);
    } else {
      writeOnlineSince(null);
      setSince(null);
    }
  }, [online, statusLoading]);

  // Pontos do nível: só com a gamificação ligada (freio).
  useEffect(() => {
    if (!features.gamificationPointsEnabled || !userId) return undefined;
    let alive = true;
    api.get(`/gamification/${userId}`).then((r: any) => { if (alive) setGam(r.data); }).catch(() => undefined);
    return () => { alive = false; };
  }, [features.gamificationPointsEnabled, userId]);

  // Posição do motoboy para o mapa e a distância até a retirada (como a tela antiga).
  useEffect(() => {
    if (!online || typeof navigator === 'undefined' || !navigator.geolocation) return undefined;
    const id = navigator.geolocation.watchPosition(
      (p) => setSelf({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => undefined,
      { enableHighAccuracy: true, maximumAge: 30000, timeout: 20000 },
    );
    return () => navigator.geolocation.clearWatch(id);
  }, [online]);

  // Polling do pool só online (mesma regra da tela antiga).
  useEffect(() => {
    if (!online) return undefined;
    refetch?.();
    const t = setInterval(() => refetch?.(), POOL_POLL_MS);
    return () => clearInterval(t);
  }, [online, refetch]);

  const toggle = async () => {
    setToggling(true);
    setToggleError(null);
    try {
      await setOnline(!online);
    } catch (err) {
      const e = apiError(err);
      // Com entrega em andamento o servidor não deixa ficar offline (antifraude) e diz por quê.
      setToggleError(e.code === 'RIDE_IN_PROGRESS' && e.message ? e.message : 'Não foi possível mudar seu status. Tente de novo.');
    } finally { setToggling(false); }
  };

  // "Tentar de novo" dos ganhos: uma releitura por vez.
  const retry = () => { if (!retrying) retrySummary(); };

  const claim = useCallback(async (d: any) => {
    // Um aceite por vez: a ref barra o 2º toque antes de o botão re-renderizar desabilitado.
    if (inFlight.current) return;
    inFlight.current = true;
    setAccepting(d._id);
    setClaimError(null);
    setPixRequired(null);
    try {
      const res = await api.post(`/deliveries/${d._id}/claim`);
      // Sem ?nav=1 (K1): a navegação abre tocando no mapa da corrida.
      router.push(MOTOBOY_ROUTES.corrida(String(res?.data?._id ?? d._id)));
    } catch (err) {
      const e = apiError(err);
      if (e.status === 409 && e.code === 'MOTOBOY_PIX_KEY_REQUIRED') {
        // A oferta segue valendo: só falta a chave Pix.
        setPixRequired(e.message || 'Cadastre sua chave Pix para pegar corridas: é por ela que você recebe.');
      } else if (e.status === 409) {
        setLost({ variant: e.code === 'ORDER_CLOSED' ? 'closed' : 'claimed', summary: offerSummary(d) });
        setPool((prev: any[]) => prev.filter((x: any) => x._id !== d._id));
        refetch?.();
      } else if (e.status === 403 && e.code === 'COURIER_NOT_VERIFIED') {
        // O servidor recusou por cadastro (C2): trava a tela e relê o estado do cadastro.
        setNotVerified(true);
        courier.reload();
      } else {
        setClaimError(e.message || 'Não deu para aceitar agora. Confira a conexão e tente de novo.');
      }
    } finally {
      inFlight.current = false;
      setAccepting(null);
    }
  }, [router, setPool, refetch, courier]);

  const skip = (d: any) => {
    setSkipped((prev) => new Set(prev).add(String(d._id)));
    setLost({ variant: 'skipped', summary: offerSummary(d) });
  };

  const enablePush = async () => {
    const ok = await push.enable();
    if (ok) { setPushMsg({ tone: 'ok', text: 'Notificações ativadas! Você recebe as corridas mesmo com o app fechado.' }); push.sendTest(); }
    else if (push.permission === 'denied') setPushMsg({ tone: 'err', text: push.blockedText });
    else setPushMsg({ tone: 'err', text: nativeApp ? PUSH_FAILED_APP : 'Não foi possível ativar as notificações agora.' });
  };

  const dismissPeak = () => { setPeakOff(true); writeHintOff(HINT_PEAK_KEY); };
  const dismissOpen = () => { setOpenOff(true); writeHintOff(HINT_OPEN_KEY); };

  // C2/K3: quem trava é o servidor (requiresVerification ou 403 no aceite). Erro de leitura não trava.
  const blocked = requiresVerification === true || notVerified;
  const visible = (pool || []).filter((d: any) => !skipped.has(String(d._id)));
  const active = ongoing?.[0] ?? null;
  const level = gam ? levelProgress(Number(gam.totalPoints ?? gam.points ?? 0)) : null;

  // KPIs só do servidor (K35): erro nunca vira R$ 0,00.
  const kpis = summaryError ? (
    <Alert tone="error" title="Não carregamos seus ganhos">
      Confira sua conexão.{' '}
      <Button size="sm" variant="secondary" onClick={retry} disabled={retrying} loading={retrying}>Tentar de novo</Button>
    </Alert>
  ) : !summary ? (
    <div className={blocks.kpis}><Skeleton height={72} /><Skeleton height={72} /></div>
  ) : (
    <div className={blocks.kpis}>
      <div className={blocks.kpi}><small>Ganhos hoje</small><b>{formatMoney(summary.today.earnings)}</b><em className={blocks.ok}>{summary.today.count} {summary.today.count === 1 ? 'corrida' : 'corridas'}</em></div>
      <div className={blocks.kpi}><small>Esta semana</small><b>{formatMoney(summary.week.earnings)}</b><em>{summary.week.count} {summary.week.count === 1 ? 'corrida' : 'corridas'}</em></div>
    </div>
  );

  const pushBlock = push.supported && !push.subscribed && (
    push.permission === 'denied'
      ? <Alert tone="warning" title="Notificações bloqueadas">{push.blockedText}</Alert>
      : <Alert tone="info" title="Receba corridas com o celular bloqueado" action={{ label: push.busy ? 'Ativando…' : 'Ativar', onClick: enablePush }}>Ative as notificações para ser avisado mesmo com o app fechado.</Alert>
  );

  return (
    <ProtectedRoute required_role="motoboy">
      <MotoboyShell
        title={online ? '' : `${greeting(new Date(now))}, ${firstName}`}
        lead={online ? <OnlineBadge since={since} now={now} /> : <Avatar name={user?.name || 'Motoboy'} size="sm" />}
        actions={online ? <PowerButton onClick={toggle} disabled={toggling || statusLoading} /> : <MotoboyBell />}
      >
        <div className={styles.screen}>
          {/* Online, o badge ocupa o lugar do título: o nome da tela fica só para o leitor de tela. */}
          {online && <h1 className={blocks.srOnly}>Corridas</h1>}
          {active && (
            <section className={`${blocks.blk} ${blocks.blkBrand}`}>
              <div className={blocks.head}><b className={blocks.headTitle}>Corrida em andamento</b><span className={blocks.meta}>Pedido #{shortOrderCode(String(active.orderId || active._id))}</span></div>
              <Button onClick={() => router.push(MOTOBOY_ROUTES.corrida(String(active._id)))}>Continuar corrida</Button>
            </section>
          )}

          {pushMsg && <p role="status" className={pushMsg.tone === 'ok' ? blocks.meta : blocks.errText}>{pushMsg.text}</p>}
          {toggleError && <p role="alert" className={blocks.errText}>{toggleError}</p>}

          {blocked ? (
            <EmAnalise state={courier.state === 'incomplete' ? 'incomplete' : 'review'} />
          ) : !online ? (
            <>
              <section className={`${blocks.blk} ${styles.offline}`}>
                <span className={blocks.tag}>Você está offline</span>
                <button type="button" className={styles.goOnline} onClick={toggle} disabled={toggling || statusLoading}>
                  <Zap size={20} aria-hidden="true" /> Ficar online
                </button>
              </section>
              {courier.state === 'incomplete' && (
                <Alert tone="warning" title="Termine seu cadastro" action={{ label: 'Continuar cadastro', onClick: () => router.push(MOTOBOY_ROUTES.cadastro) }}>
                  Falta enviar parte da verificação da sua conta.
                </Alert>
              )}
              {courier.state === 'review' && (
                <Alert tone="info" title="Seus documentos estão em análise">Avisamos por notificação quando a análise terminar.</Alert>
              )}
              {pushBlock}
              {kpis}
              <ul className={blocks.list}>
                {features.gamificationPointsEnabled && level && (
                  <NavRow
                    icon={<Award size={18} />}
                    iconClassName={blocks.icoBrand}
                    label={`${level.level} · ${formatPoints(level.points)} pts`}
                    sub={level.next ? `Faltam ${formatPoints(level.toNext)} pts para ${level.next}` : 'Nível máximo'}
                    onClick={() => router.push(MOTOBOY_ROUTES.nivel)}
                  />
                )}
                {courier.state === 'error' ? (
                  <NavRow icon={<TriangleAlert size={18} />} iconClassName={blocks.icoWarn} label="Não carregamos seus documentos" sub="Toque para tentar de novo" onClick={courier.reload} />
                ) : courier.state === 'verified' ? (
                  <NavRow icon={<FileCheck2 size={18} />} iconClassName={blocks.icoOk} label="Documentos em dia" sub="Verificação completa" onClick={() => router.push(MOTOBOY_ROUTES.perfil)} />
                ) : null}
                <NavRow icon={<ListChecks size={18} />} label="Suas entregas" sub="Em andamento e concluídas" onClick={() => router.push(MOTOBOY_ROUTES.entregas())} />
              </ul>
              {push.subscribed && (
                <p className={blocks.meta}>Notificações ativas · <button type="button" className={blocks.link} onClick={() => push.sendTest()}>enviar teste</button></p>
              )}
              {!peakOff && (
                <div className={styles.hint}>
                  <span><b>Horário de pico</b>No fim da tarde as ofertas costumam chegar mais rápido.</span>
                  <button type="button" className={styles.hintClose} aria-label="Dispensar dica" onClick={dismissPeak}><X size={16} aria-hidden="true" /></button>
                </div>
              )}
            </>
          ) : (
            <>
              {gps === 'stale' && (
                <Alert tone="warning" title="Localização parada.">
                  {nativeApp
                    ? 'O GPS não manda posição há um tempo. Confira se a localização do celular está ligada.'
                    : 'Mantenha o app aberto e a tela ligada — com o celular bloqueado ou fora do app, as corridas param de chegar.'}
                </Alert>
              )}
              {gps === 'denied' && (
                <Alert tone="error" title="Localização desativada.">
                  {nativeApp
                    ? 'Permita a localização do DROP nas configurações do celular para receber corridas perto de você.'
                    : 'Ative a localização do navegador para este site para receber corridas perto de você.'}
                </Alert>
              )}
              {pushBlock}
              {lost && <OfferLost variant={lost.variant} summary={lost.summary} onContinue={() => setLost(null)} />}
              {claimError && <p role="alert" className={blocks.errText}>{claimError}</p>}
              {pixRequired && (
                <Alert tone="warning" title="Falta sua chave Pix" action={{ label: 'Cadastrar chave Pix', onClick: () => router.push(MOTOBOY_ROUTES.recebimento) }}>
                  {pixRequired}
                </Alert>
              )}
              {poolLoading ? (
                <div className={blocks.stack}><Skeleton height={300} radius="var(--radius-lg)" /><Skeleton height={160} /></div>
              ) : visible.length === 0 ? (
                !lost && (
                  <>
                    <section className={`${blocks.blk} ${styles.searching}`} aria-live="polite">
                      <span className={`${blocks.ico} ${blocks.icoBrand}`} aria-hidden="true"><Bike size={18} /></span>
                      <span className={styles.searchingTitle}>Procurando corridas perto de você</span>
                      <span className={blocks.sub}>Assim que aparecer uma corrida perto, ela surge aqui.</span>
                    </section>
                    {kpis}
                    {!openOff && (
                      <div className={styles.hint}>
                        <span><b>Mantenha o app aberto</b>Com a tela apagada o GPS para e as corridas deixam de chegar.</span>
                        <button type="button" className={styles.hintClose} aria-label="Dispensar dica" onClick={dismissOpen}><X size={16} aria-hidden="true" /></button>
                      </div>
                    )}
                  </>
                )
              ) : (
                visible.map((d: any, i: number) => (
                  <OfferCard
                    key={d._id}
                    delivery={d}
                    self={self}
                    showMap={i === 0}
                    accepting={accepting === d._id}
                    disabled={!!accepting && accepting !== d._id}
                    onAccept={() => claim(d)}
                    onSkip={() => skip(d)}
                  />
                ))
              )}
              {gps === 'active' && visible.length > 0 && (
                <p className={blocks.meta}><MapPin size={14} aria-hidden="true" /> Localização ativa — você está recebendo corridas perto de você.</p>
              )}
            </>
          )}
        </div>
      </MotoboyShell>
    </ProtectedRoute>
  );
}
