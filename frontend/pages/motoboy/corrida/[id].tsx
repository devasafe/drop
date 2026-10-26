// Corrida (DS v2, D2): retirar → entregar, com as exceções (atrasada, ausente, problema, devolução,
// cancelada) e a conclusão. Sem barra de abas. O GPS da corrida segue igual (useRideLocationRelay).
// Tocar no mapa (ou ?nav=1) abre a navegação em tela cheia (MotoboyNavMap, C1/K1); o finalizar de
// dentro dela usa a MESMA guarda de envio da tela (um useFinalizeRide só, K2).
import { useEffect, useRef, useState } from 'react';
import dynamic from 'next/dynamic';
import { useRouter } from 'next/router';
import { PackageX } from 'lucide-react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import MotoboyShell from '../../../components/motoboy/panel/MotoboyShell';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import blocks from '../../../components/panel/PanelBlocks.module.css';
import { useSocket } from '../../../contexts/SocketContext';
import { useRideLocationRelay } from '../../../hooks/useRideLocationRelay';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import { useRide } from '../../../components/motoboy/corrida/useRide';
import { useNow } from '../../../components/motoboy/corrida/useNow';
import { useFinalizeRide } from '../../../components/motoboy/corrida/useFinalizeRide';
import { rideStage, rideCode, type RideStage } from '../../../components/motoboy/corrida/rideView';
import { RetirarView } from '../../../components/motoboy/corrida/RetirarView';
import { EntregarView } from '../../../components/motoboy/corrida/EntregarView';
import { ClienteAusenteView } from '../../../components/motoboy/corrida/ClienteAusenteView';
import { DevolverView, DevolucaoConfirmada } from '../../../components/motoboy/corrida/DevolverView';
import { DevolucaoBuscarView, DevolucaoLevarView, DevolucaoConcluida } from '../../../components/motoboy/corrida/DevolucaoViews';
import { CanceladaView } from '../../../components/motoboy/corrida/CanceladaView';
import { ConcluidaView } from '../../../components/motoboy/corrida/ConcluidaView';
import { ProblemSheet } from '../../../components/motoboy/corrida/ProblemSheet';
import { RideChatSheet, type RideChatKind } from '../../../components/motoboy/corrida/RideChatSheet';

// Drop Maps (MapLibre/WebGL) só no client.
const MotoboyNavMap = dynamic(
  () => import('../../../components/map/presets/MotoboyNavMap').then((m) => m.MotoboyNavMap),
  { ssr: false },
);

const BACK = MOTOBOY_ROUTES.corridas;

/** Devolução que o servidor já aceitou (resposta do reject 202 ou do cliente-ausente), K11. */
type ReturnPatch = { statusDevolucao: 'aguardando_confirmacao'; pinDevolucao: string };

/**
 * A corrida da tela: a do servidor, com o código de devolução da resposta enquanto a releitura
 * ainda não o traz. O código do servidor sempre vence o guardado.
 */
function withReturnPatch(ride: any, patch: ReturnPatch | null): any {
  if (!ride || !patch || ride.pinDevolucao) return ride;
  if (ride.statusDevolucao && ride.statusDevolucao !== 'aguardando_confirmacao') return ride;
  return { ...ride, ...patch };
}

export default function CorridaPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const ausente = router.query.etapa === 'ausente';
  const { ride: serverRide, loading, error, reload, cancelInfo, returnConfirmed } = useRide(id);
  const { emit, on } = useSocket();
  const { currentLocation } = useRideLocationRelay(serverRide, emit);
  const now = useNow(1000);
  const [points, setPoints] = useState<{ points: number; totalPoints: number } | null>(null);
  const [problem, setProblem] = useState<null | { initialKey?: string }>(null);
  const [chat, setChat] = useState<RideChatKind | null>(null);
  const [absentComp, setAbsentComp] = useState<number | null>(null);
  const [returnPatch, setReturnPatch] = useState<ReturnPatch | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const firstStage = useRef<RideStage | null>(null);
  const autoNav = useRef(false);
  // Um caminho só de envio do PIN do cliente: a tela e a navegação dividem a guarda (K2).
  const finalizer = useFinalizeRide(serverRide?._id, { onConflict: reload });

  // Outra corrida: nada da anterior vale.
  useEffect(() => {
    firstStage.current = null;
    autoNav.current = false;
    setReturnPatch(null);
    setAbsentComp(null);
    setNavOpen(false);
    setProblem(null);
    setChat(null);
  }, [id]);

  const ride = withReturnPatch(serverRide, returnPatch);
  const stage = rideStage(ride);
  if (ride && firstStage.current === null) firstStage.current = stage;
  const navigable = stage === 'retirar' || stage === 'entregar';

  // Pontos da entrega (evento do servidor ao finalizar): só para a tela de conclusão.
  useEffect(() => on('gamification:points_earned', (d: any) => {
    if (typeof d?.points === 'number') setPoints({ points: d.points, totalPoints: Number(d.totalPoints) || 0 });
  }), [on]);

  // Entrega que já estava concluída ao abrir (push, histórico, link antigo): vai para o detalhe.
  useEffect(() => {
    if (id && firstStage.current === 'concluida') router.replace(MOTOBOY_ROUTES.entrega(id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, stage]);

  // ?nav=1: abre a navegação uma vez, com a corrida em retirar ou entregar. Fora delas, fecha.
  useEffect(() => {
    if (!navigable) { setNavOpen(false); return; }
    if (autoNav.current || router.query.nav !== '1') return;
    autoNav.current = true;
    setNavOpen(true);
  }, [navigable, router.query.nav]);

  const markReturn = (pin: string | null) => {
    if (pin) setReturnPatch({ statusDevolucao: 'aguardando_confirmacao', pinDevolucao: pin });
  };

  const finalizeFromNav = async (pin: string) => {
    const r = await finalizer.finalize(pin);
    if (r.ok) {
      setNavOpen(false);
      reload();
    }
    return r;
  };

  const goCorridas = () => router.push(BACK);
  const store = ride?.storeObj || {};
  const customer = ride?.customerObj || {};
  const storeId = String(store._id ?? ride?.order?.storeId ?? '');
  const customerId = String(customer._id ?? ride?.order?.customerId ?? '');
  const openNav = () => setNavOpen(true);

  const sheets = ride && (
    <>
      {navOpen && navigable && (
        <MotoboyNavMap
          delivery={ride}
          self={currentLocation}
          onClose={() => setNavOpen(false)}
          onFinalize={finalizeFromNav}
          onChat={(kind: 'store' | 'customer') => setChat(kind === 'customer' ? 'motoboy_cliente' : 'loja_motoboy')}
        />
      )}
      {navigable && (
        <ProblemSheet
          open={!!problem}
          onClose={() => setProblem(null)}
          deliveryId={ride._id}
          orderCode={rideCode(ride)}
          stage={stage === 'retirar' ? 'retirar' : 'entregar'}
          initialKey={problem?.initialKey}
          onCustomerAbsent={() => { setProblem(null); router.push(`${MOTOBOY_ROUTES.corrida(ride._id)}?etapa=ausente`); }}
          onDone={(r) => {
            setProblem(null);
            if (r.pending) {
              markReturn(r.pinDevolucao);
              reload();
            } else {
              router.replace(BACK);
            }
          }}
        />
      )}
      <RideChatSheet
        open={!!chat}
        onClose={() => setChat(null)}
        deliveryId={ride._id}
        orderId={String(ride.orderId ?? ride.order?._id ?? '')}
        kind={chat ?? 'loja_motoboy'}
        otherParticipantId={chat === 'motoboy_cliente' ? customerId : storeId}
        otherName={chat === 'motoboy_cliente' ? (customer.name || 'Cliente') : (store.name || 'Loja')}
      />
    </>
  );

  let content: JSX.Element;
  const returnRide = ride?.kind === 'devolucao';
  if (returnConfirmed && returnRide) {
    content = <MotoboyShell title="Devolução concluída" bare><DevolucaoConcluida onNext={goCorridas} /></MotoboyShell>;
  } else if (returnConfirmed) {
    content = <MotoboyShell title="Devolução confirmada" bare><DevolucaoConfirmada onNext={goCorridas} /></MotoboyShell>;
  } else if (!ride && loading) {
    content = (
      <MotoboyShell title="Corrida" back={BACK}>
        <div className={blocks.stack}><Skeleton height={180} radius="var(--radius-lg)" /><Skeleton height={120} /><Skeleton height={140} /></div>
      </MotoboyShell>
    );
  } else if (error === 'gone' || (ride && stage === 'outra')) {
    content = (
      <MotoboyShell title="Corrida" back={BACK}>
        <EmptyState
          icon={<PackageX size={22} aria-hidden="true" />}
          title="Esta corrida não está mais com você"
          description="Ela pode ter sido devolvida, reatribuída ou encerrada."
          action={<Button onClick={goCorridas}>Voltar para Corridas</Button>}
        />
      </MotoboyShell>
    );
  } else if (!ride) {
    content = (
      <MotoboyShell title="Corrida" back={BACK}>
        <EmptyState icon={<PackageX size={22} aria-hidden="true" />} variant="error" title="Não carregamos a corrida" description="Confira sua conexão." onRetry={reload} />
      </MotoboyShell>
    );
  } else if (stage === 'buscar_devolucao') {
    content = (
      <MotoboyShell title="Buscar com o cliente" back={BACK} actions={<span className={`${blocks.tag} ${blocks.tagWarn}`}>Devolução</span>}>
        <DevolucaoBuscarView ride={ride} self={currentLocation} onPicked={reload} onProblem={() => setProblem({})} />
      </MotoboyShell>
    );
  } else if (stage === 'levar_devolucao') {
    content = (
      <MotoboyShell title="Levar à loja" back={BACK} actions={<span className={`${blocks.tag} ${blocks.tagWarn}`}>Devolução</span>}>
        <DevolucaoLevarView ride={ride} self={currentLocation} />
      </MotoboyShell>
    );
  } else if (stage === 'concluida' && returnRide) {
    content = <MotoboyShell title="Devolução concluída" bare><DevolucaoConcluida onNext={goCorridas} /></MotoboyShell>;
  } else if (stage === 'retirar') {
    content = (
      <MotoboyShell title="Retirar na loja" back={BACK} actions={<span className={`${blocks.tag} ${blocks.tagBrand}`}>1 de 2</span>}>
        <RetirarView
          ride={ride}
          now={now}
          self={currentLocation}
          onChat={() => setChat('loja_motoboy')}
          onProblem={() => setProblem({})}
          onReturn={() => setProblem({ initialKey: 'loja_demorando' })}
          onOpenNav={openNav}
        />
      </MotoboyShell>
    );
  } else if (stage === 'entregar' && ausente) {
    content = (
      <MotoboyShell title="Cliente não atende" back={MOTOBOY_ROUTES.corrida(ride._id)} actions={<span className={`${blocks.tag} ${blocks.tagBrand}`}>2 de 2</span>}>
        <ClienteAusenteView
          ride={ride}
          now={now}
          onChat={() => setChat('motoboy_cliente')}
          onClosed={({ compensation, pinDevolucao }) => {
            setAbsentComp(compensation);
            markReturn(pinDevolucao);
            reload();
          }}
          onReload={reload}
        />
      </MotoboyShell>
    );
  } else if (stage === 'entregar') {
    content = (
      <MotoboyShell title="Entregar ao cliente" back={BACK} actions={<span className={`${blocks.tag} ${blocks.tagBrand}`}>2 de 2</span>}>
        <EntregarView
          ride={ride}
          self={currentLocation}
          onChat={() => setChat('motoboy_cliente')}
          onProblem={() => setProblem({})}
          onAbsent={() => router.push(`${MOTOBOY_ROUTES.corrida(ride._id)}?etapa=ausente`)}
          onFinished={reload}
          onReload={reload}
          onOpenNav={openNav}
          finalizer={finalizer}
        />
      </MotoboyShell>
    );
  } else if (stage === 'devolver') {
    const comp = typeof ride.cancellationCompensation === 'number' ? ride.cancellationCompensation : absentComp;
    content = (
      <MotoboyShell title="Devolver o pacote" back={BACK} actions={<span className={`${blocks.tag} ${blocks.tagWarn}`}>Devolução</span>}>
        <DevolverView ride={ride} self={currentLocation} compensation={comp} />
      </MotoboyShell>
    );
  } else if (stage === 'cancelada') {
    content = <MotoboyShell title="Corrida cancelada" bare><CanceladaView ride={ride} cancelInfo={cancelInfo} onNext={goCorridas} /></MotoboyShell>;
  } else {
    // concluida: só chega aqui quem finalizou nesta tela (a concluída antiga já foi redirecionada).
    content = firstStage.current === 'concluida'
      ? <MotoboyShell title="Corrida" back={BACK}><div className={blocks.stack}><Skeleton height={120} /></div></MotoboyShell>
      : <MotoboyShell title="Entrega concluída" bare><ConcluidaView ride={ride} points={points} onNext={goCorridas} /></MotoboyShell>;
  }

  return (
    <ProtectedRoute required_role="motoboy">
      {content}
      {sheets}
    </ProtectedRoute>
  );
}
