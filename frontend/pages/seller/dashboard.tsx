// frontend/pages/seller/dashboard.tsx
// Agora (DS v2, D1): o que a loja precisa resolver agora. Pedidos novos com o prazo do
// servidor (ao vencer, o pedido é CANCELADO com reembolso), aceite em dois toques,
// pedidos em andamento, switch Aberta/Fechada, números de hoje e avisos.
import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ChevronRight, Sparkles, X } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import SellerShell from '../../components/seller/panel/SellerShell';
import { useSellerPanel } from '../../components/seller/panel/SellerPanelProvider';
import { Switch } from '../../components/ui/Switch';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { Skeleton } from '../../components/ui/Skeleton';
import { AcceptButton } from '../../components/seller/order/AcceptButton';
import { AcceptCountdown } from '../../components/seller/order/AcceptCountdown';
import { RejectSheet } from '../../components/seller/order/RejectSheet';
import { SaasPausedCard } from '../../components/seller/agora/SaasPausedCard';
import { AdminPausedBanner } from '../../components/seller/loja/AdminPausedBanner';
import { NotificationBell, StoreAvatar } from '../../components/seller/agora/AgoraTop';
import { AgoraAnalise, analiseTag } from '../../components/seller/agora/AgoraAnalise';
import { loadStoreOnboarding, type StoreOnboarding } from '../../lib/storeOnboarding';
import blocks from '../../components/panel/PanelBlocks.module.css';
import { StageTag } from '../../components/seller/StageTag';
import { useSaasConfig } from '../../hooks/useSaasConfig';
import { useMyStore } from '../../hooks/useMyStore';
import { useOnline } from '../../hooks/useOnline';
import api from '../../lib/api';
import { storeAnalytics, type StoreOverview } from '../../lib/analyticsApi';
import { openStatus } from '../../lib/storeHours';
import { formatMoney } from '../../lib/money';
import { paymentMethodLabel } from '../../lib/paymentLabel';
import { shortOrderCode } from '../../lib/customerOrder';
import { SELLER_ROUTES } from '../../lib/sellerRoutes';
import { hasPendingReturn, isAwaitingAccept, isCancelled, itemsSummary, orderStage, sortOngoing, isLowStock } from '../../lib/sellerOrders';
import { apiError, formatHour, todayISO } from '../../lib/sellerApi';
import { adminPauseOf, adminPausedText, storeAdminPausedError } from '../../lib/storeAdminPause';
import styles from './Agora.module.css';

const HINT_KEY = 'drop.loja.dicaPrimeiroPedido';
/** Espera máxima pela lista nova depois de uma recarga (se nada mudar, vale a lista atual). */
const RELOAD_WAIT_MS = 2000;

const sameId = (a: unknown, b: unknown) => String(a) === String(b);

/**
 * Cadastro da loja (tela 13). Fail closed: enquanto confere, e quando a leitura falha ou alguma
 * etapa não carregou, a tela nunca diz "Recebendo pedidos".
 */
type Approval =
  | { status: 'loading' }
  | { status: 'approved'; data: StoreOnboarding }
  | { status: 'pending'; data: StoreOnboarding }
  | { status: 'unknown'; data?: StoreOnboarding };

/**
 * Cartão ainda não aprovado pelo Asaas (ex.: em análise de risco). O GET /stores/dashboard
 * só esconde PIX pendente e o aceite do servidor não confere o pagamento: a tela não oferece
 * aceitar nem recusar até o pagamento cair.
 */
const cardAwaitingPayment = (o: any): boolean =>
  o?.paymentMethod === 'credit_card' && !!o?.asaasPaymentId && o?.paymentStatus !== 'paid';

const deadlinePassed = (o: any): boolean => {
  const t = o?.acceptDeadline ? Date.parse(o.acceptDeadline) : NaN;
  return !Number.isNaN(t) && t <= Date.now();
};

function Delta({ value }: { value?: number }) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0) return <em className={styles.deltaFlat}>igual a ontem</em>;
  const up = value > 0;
  const n = Math.abs(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 });
  return <em className={up ? styles.deltaUp : styles.deltaDown}>{`${up ? '↑' : '↓'} ${n}% vs. ontem`}</em>;
}

interface NewOrderCardProps {
  order: any;
  onReject: () => void;
  onAccepted: () => void;
  onAlready: () => Promise<boolean>;
  onExpire: () => void;
}

function NewOrderCard({ order, onReject, onAccepted, onAlready, onExpire }: NewOrderCardProps) {
  const [expired, setExpired] = useState(() => deadlinePassed(order));
  const km = Number(order.deliveryDistance);
  const dist = Number.isFinite(km) && km > 0 ? `${km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : null;
  const pay = `${paymentMethodLabel(order.paymentMethod)}${Number(order.installmentCount) > 1 ? ` ${order.installmentCount}x` : ''}`;
  const awaitingCard = cardAwaitingPayment(order);
  return (
    <article className={styles.newCard} data-testid={`novo-${order._id}`}>
      <div className={styles.cardHead}>
        <Link href={SELLER_ROUTES.pedido(order._id)} className={styles.cardTitle}>
          {`#${shortOrderCode(order._id)} · ${formatMoney(Number(order.totalValue) || 0)}`}
        </Link>
        <AcceptCountdown deadline={order.acceptDeadline} onExpire={() => { setExpired(true); onExpire(); }} />
      </div>
      <p className={styles.cardItems}>{itemsSummary(order)}</p>
      <p className={styles.cardMeta}>{[order.customerName, dist, pay].filter(Boolean).join(' · ')}</p>
      {expired ? null : awaitingCard ? (
        <p className={styles.cardWait}>Aguardando a aprovação do cartão</p>
      ) : (
        <div className={styles.cardActions}>
          <Button variant="secondary" size="sm" onClick={onReject}>Recusar</Button>
          <AcceptButton size="sm" orderId={order._id} distance={order.deliveryDistance || 0} onAccepted={onAccepted} onAlreadyHandled={onAlready} />
        </div>
      )}
    </article>
  );
}

export default function AgoraPage() {
  const router = useRouter();
  const panel = useSellerPanel();
  const { store, orders, refresh, newOrderCount } = panel;
  const { settlementMode, loading: modeLoading } = useSaasConfig();
  const { products } = useMyStore();
  const online = useOnline();
  // D3b-2b (ruling 8): o cartão diz se a mensalidade bloqueia (pausada, ou cancelada depois do período).
  const [saasBlocked, setSaasBlocked] = useState(false);
  const [rejecting, setRejecting] = useState<any | null>(null);
  const [rejectDone, setRejectDone] = useState(false);
  const [toggling, setToggling] = useState(false);
  const [toggleError, setToggleError] = useState<string | null>(null);
  const [kpi, setKpi] = useState<StoreOverview | null>(null);
  /** Hora da leitura dos números de hoje ("Hoje · até HH:MM"). */
  const [kpiAt, setKpiAt] = useState<Date | null>(null);
  const [hintClosed, setHintClosed] = useState(true);
  const [notice, setNotice] = useState<string | null>(null);
  const [approval, setApproval] = useState<Approval>({ status: 'loading' });

  // Só a última leitura vale ("Tentar de novo" e o efeito podem se cruzar) e nada muda depois de desmontar.
  const approvalReq = useRef(0);
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  // V12: o cadastro usa a leitura de /stores/dashboard que o painel já fez (espera ele carregar).
  // Painel com erro ou fora do painel: o cadastro lê sozinho, como antes.
  const inPanel = panel?.inPanel === true;
  const panelWaiting = inPanel && !!panel.loading;
  const panelDashRef = useRef<{ store: any | null; products: any[] } | undefined>(undefined);
  panelDashRef.current = inPanel && !panel.loading && !panel.error
    ? { store: panel.store ?? null, products: Array.isArray(panel.products) ? panel.products : [] }
    : undefined;
  const checkApproval = useCallback(() => {
    if (modeLoading || panelWaiting) return;
    const req = ++approvalReq.current;
    const current = () => mountedRef.current && req === approvalReq.current;
    setApproval({ status: 'loading' });
    const dash = panelDashRef.current;
    (dash === undefined ? loadStoreOnboarding(settlementMode) : loadStoreOnboarding(settlementMode, dash))
      .then((d) => {
        if (!current()) return;
        if (d.approved) setApproval({ status: 'approved', data: d });
        else if (d.steps.some((st) => st.state === 'unknown')) setApproval({ status: 'unknown', data: d });
        else setApproval({ status: 'pending', data: d });
      })
      .catch(() => { if (current()) setApproval({ status: 'unknown' }); });
  }, [modeLoading, settlementMode, panelWaiting]);
  useEffect(() => { checkApproval(); }, [checkApproval]);
  // Decisão do controlador: a tela de cadastro só substitui o Agora quando a loja NÃO está
  // verificada. Verificada com etapa pendente (ex.: sem chave Pix) segue o Agora normal, com um
  // aviso discreto; verificada e cadastro sem conferir ('unknown'): Agora normal, sem aviso.
  // Fonte da verificação: o painel; se ele ainda não tem a loja (1º render, falha), a loja lida pelo cadastro.
  const onbStore = approval.status !== 'loading' ? approval.data?.store : undefined;
  const isVerifiedRaw: unknown = store?.isVerified ?? onbStore?.isVerified;
  const verifiedKnown = typeof isVerifiedRaw === 'boolean';
  const verified = isVerifiedRaw === true;
  // Nenhuma das duas fontes respondeu ainda: não decide (mostra o carregamento no lugar do switch).
  const deciding = !verifiedKnown && approval.status === 'loading';
  const onbPending = approval.status === 'pending' ? approval.data : null;
  const pending = verified ? null : onbPending;
  const missing = verified ? onbPending : null;
  const canSayReceiving = verified || approval.status === 'approved';
  // Sem confirmação de verificação e cadastro sem conferir: fail closed (os pedidos continuam na tela).
  const failClosed = !verified && approval.status === 'unknown';

  const list = Array.isArray(orders) ? orders : [];
  const novos = sortOngoing(list.filter(isAwaitingAccept));
  // Primeiro pedido (V13): o /stores/dashboard traz todos os pedidos da loja (em andamento + histórico).
  // Sem histórico e sem nenhum pedido já aceito, o pedido novo é o primeiro. Sem o histórico, não supõe.
  const firstOrder = Array.isArray(panel?.history) && panel.history.length === 0
    && novos.length > 0 && list.every(isAwaitingAccept);
  const andamento = sortOngoing(list.filter((o) => !isAwaitingAccept(o)));
  // Devolução pendente: vem do aviso em tempo real e do próprio pedido (sem contar duas vezes).
  const pendingReturns = new Set<string>([
    ...(Array.isArray(panel.returnRequests) ? panel.returnRequests : []).map((r) => String(r.orderId)),
    ...list.filter(hasPendingReturn).map((o) => String(o._id)),
  ]).size;

  // Lista mais recente + quem espera a próxima recarga (para o "Já aceito" do AcceptButton).
  const ordersRef = useRef<any[]>(list);
  const waiters = useRef<Array<() => void>>([]);
  useEffect(() => {
    ordersRef.current = Array.isArray(orders) ? orders : [];
    const w = waiters.current;
    waiters.current = [];
    w.forEach((f) => f());
  }, [orders]);

  useEffect(() => {
    try { setHintClosed(window.localStorage.getItem(HINT_KEY) === '1'); } catch { setHintClosed(false); }
  }, []);

  useEffect(() => {
    let off = false;
    const d = todayISO();
    storeAnalytics.overview('custom', { from: d, to: d })
      .then((v) => { if (!off) { setKpi(v); setKpiAt(new Date()); } })
      .catch(() => { /* números do dia são opcionais */ });
    return () => { off = true; };
  }, []);

  // Os pedidos novos estão na tela: o destaque do painel não reacende ao voltar à aba.
  const hasNovos = novos.length > 0;
  const clearNewOrders = panel.clearNewOrders;
  useEffect(() => {
    if (hasNovos && newOrderCount > 0) clearNewOrders?.();
  }, [hasNovos, newOrderCount, clearNewOrders]);

  // Sheet aberta e o pedido mudou por outro caminho (aceito, cancelado pelo job): fecha.
  // Depois da recusa feita, a sheet fica com a confirmação até o lojista fechar.
  useEffect(() => {
    if (!rejecting || rejectDone) return;
    const cur = (Array.isArray(orders) ? orders : []).find((o) => sameId(o._id, rejecting._id));
    if (!cur || !isAwaitingAccept(cur)) setRejecting(null);
  }, [orders, rejecting, rejectDone]);

  const reloadAndCheck = useCallback(async (orderId: string): Promise<boolean> => {
    const changed = new Promise<void>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null;
      const done = () => { if (timer) clearTimeout(timer); resolve(); };
      waiters.current.push(done);
      timer = setTimeout(done, RELOAD_WAIT_MS);
    });
    await refresh();
    await changed;
    const cur = ordersRef.current.find((o) => sameId(o._id, orderId));
    const still = !!cur && isAwaitingAccept(cur) && !deadlinePassed(cur);
    // O card sai de "Novos" com a recarga (e leva junto o aviso do botão): avisa aqui também.
    if (!still) {
      const code = shortOrderCode(orderId);
      setNotice(cur && !isAwaitingAccept(cur) && !isCancelled(cur)
        ? `Já aceito: o pedido #${code} está em andamento.`
        : `O pedido #${code} não espera mais aceite.`);
    }
    return still;
  }, [refresh]);

  const closeHint = () => {
    setHintClosed(true);
    try { window.localStorage.setItem(HINT_KEY, '1'); } catch { /* sem armazenamento: só some agora */ }
  };

  const lowStock = (products || []).filter((p: any) => p?.isActive !== false && isLowStock(p));
  // D3b-2a: pausada pelo DROP = fechada, e só o DROP reabre (o servidor recusa com 409 STORE_ADMIN_PAUSED).
  const adminPause = adminPauseOf(store);
  const blocked = saasBlocked || adminPause !== null;
  const hours: ReturnType<typeof openStatus> = store ? openStatus(store) : { open: false, closesAt: null, opensAt: null };
  const pausedUntil = store?.pausedUntil && Date.parse(store.pausedUntil) > Date.now() ? store.pausedUntil : null;
  // Aberta de verdade = a regra do cliente (openStatus). A pausa tem o próprio aviso: com ela,
  // a chave segue o interruptor manual, como antes.
  const isOpen = !blocked && (pausedUntil ? store?.isOpen !== false : hours.open);
  // Interruptor ligado, sem pausa, mas fora do horário cadastrado.
  const closedByHours = !isOpen && !blocked && !pausedUntil && store?.isOpen !== false;

  const toggleOpen = async (next: boolean) => {
    if (!store?._id) return;
    setToggling(true);
    setToggleError(null);
    try {
      await api.put(`/stores/${store._id}/operating-hours`, { isOpen: next });
      await refresh();
    } catch (err) {
      const byDrop = storeAdminPausedError(err);
      if (byDrop) {
        // O DROP pausou depois da leitura: mostra o motivo e relê (a faixa aparece).
        setToggleError(adminPausedText(byDrop.reason));
        void refresh();
      } else {
        setToggleError(apiError(err).message || 'Não deu para mudar agora. Tente de novo.');
      }
    } finally {
      setToggling(false);
    }
  };

  const resume = async () => {
    if (!store?._id) return;
    try {
      await api.delete(`/stores/${store._id}/pause`);
      await refresh();
    } catch (err) {
      const byDrop = storeAdminPausedError(err);
      if (byDrop) {
        setToggleError(adminPausedText(byDrop.reason));
        void refresh();
      } else {
        setToggleError(apiError(err).message || 'Não deu para voltar agora. Tente de novo.');
      }
    }
  };

  // C12: o otimista vem antes da recarga.
  const onAccepted = (o: any) => {
    const id = String(o._id);
    setNotice(`Pedido #${shortOrderCode(id)} aceito. Separe os itens.`);
    panel.patchOrder?.(id, { status: 'pago' });
    refresh();
  };

  const openReject = (o: any) => {
    setRejectDone(false);
    setRejecting(o);
  };

  // A sheet mantém o pedido até o onClose (a confirmação mostra o valor devolvido).
  const onRejected = () => {
    if (!rejecting) return;
    setRejectDone(true);
    panel.removeOrder?.(String(rejecting._id));
    refresh();
  };

  const switchDescription = adminPause
    ? adminPausedText(adminPause.reason)
    : saasBlocked
    ? 'Abre sozinha quando o pagamento cair'
    : isOpen
      ? hours.overrideUntil
        ? `Aberta fora do horário até ${hours.overrideUntil}`
        : hours.closesAt ? `Fecha às ${hours.closesAt}` : canSayReceiving ? 'Recebendo pedidos' : undefined
      : closedByHours
        ? hours.opensAt ? `Fechada pelo horário. Abre às ${hours.opensAt}` : 'Fechada pelo horário'
        : 'Clientes não veem seus produtos';

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell
        title={store?.name || 'Agora'}
        lead={store ? <StoreAvatar name={store.name} logoUrl={store.logoUrl} /> : undefined}
        actions={(
          <>
            {pending && <span className={[blocks.tag, blocks.tagWarn].join(' ')}>{analiseTag(pending)}</span>}
            <NotificationBell />
          </>
        )}
      >
        <div className={styles.page}>
          {!online && (
            <Alert tone="warning" title="Sem conexão">Pedidos novos aparecem quando a internet voltar.</Alert>
          )}
          {pendingReturns > 0 && (
            <Alert
              tone="warning"
              title={pendingReturns === 1 ? '1 devolução esperando resposta' : `${pendingReturns} devoluções esperando resposta`}
              action={{ label: 'Ver devoluções', onClick: () => router.push(SELLER_ROUTES.pedidos('devolucoes')) }}
            >
              O motoboy volta com o produto. Confirme com o PIN quando ele chegar.
            </Alert>
          )}
          <div className={styles.grid}>
            {/* 1º bloco no celular (protótipo); no computador fica no topo da coluna lateral. */}
            <div className={styles.open}>
              {adminPause && <AdminPausedBanner reason={adminPause.reason} onSupport={() => router.push(SELLER_ROUTES.ajuda)} />}
              {settlementMode === 'direto' && store?._id && <SaasPausedCard storeId={String(store._id)} onStatus={(_status, blocked) => setSaasBlocked(blocked)} />}
              {failClosed && (
                <Alert tone="warning" title="Não conseguimos conferir o seu cadastro" action={{ label: 'Tentar de novo', onClick: checkApproval }}>
                  Por isso não dá para confirmar agora se a loja recebe pedidos. Tente de novo em instantes.
                </Alert>
              )}
              {missing && (
                <Alert tone="info" title={missing.current ? `Falta ${missing.current.label}` : 'Cadastro em análise'} action={{ label: 'Continuar', onClick: () => router.push('/seller/abrir') }}>
                  Termine essa etapa em Abrir a loja.
                </Alert>
              )}
              {deciding && (
                <div role="status" aria-label="Conferindo sua loja">
                  <Skeleton height={64} radius="var(--radius-lg)" />
                </div>
              )}
              {!pending && !deciding && (
                <>
                  <div className={styles.block}>
                    <Switch
                      label={isOpen ? 'Loja aberta' : 'Loja fechada'}
                      description={switchDescription}
                      checked={isOpen}
                      disabled={toggling || blocked || !store?._id}
                      onChange={toggleOpen}
                    />
                    {toggleError && <p role="alert" className={styles.error}>{toggleError}</p>}
                  </div>

                  {pausedUntil && !adminPause && (
                    <Alert tone="info" title={`Pausada até ${formatHour(pausedUntil)}`} action={{ label: 'Voltar agora', onClick: resume }}>
                      Clientes não conseguem comprar enquanto a pausa durar.
                    </Alert>
                  )}
                  {!isOpen && !blocked && (
                    <Alert
                      tone="warning"
                      title={closedByHours ? 'Fechada pelo horário' : 'Você está fechada'}
                      action={{ label: 'Abrir agora', onClick: () => toggleOpen(true) }}
                    >
                      {closedByHours
                        ? 'Clientes não conseguem comprar agora. Se abrir, a loja volta a seguir o horário sozinha depois.'
                        : 'Clientes não veem seus produtos.'}
                    </Alert>
                  )}
                </>
              )}
            </div>
            <div className={styles.main}>
              {pending && <AgoraAnalise data={pending} onGo={(p) => router.push(p)} />}
              {notice && <p role="status" className={styles.notice}>{notice}</p>}

              {!hintClosed && !pending && firstOrder && (
                <div className={styles.hint}>
                  <Sparkles size={20} aria-hidden="true" className={styles.hintIcon} />
                  <p className={styles.hintText}>
                    <b>Primeiro pedido? É só aceitar.</b> Depois de aceito, separe os itens e peça o PIN ao motoboy. A gente avisa cada passo.
                  </p>
                  <button type="button" className={styles.hintClose} onClick={closeHint} aria-label="Fechar dica">
                    <X size={18} aria-hidden="true" />
                  </button>
                </div>
              )}

              {(!pending || novos.length > 0) && (
                <section aria-labelledby="agora-novos" className={styles.section}>
                  <div className={styles.sectionHead}>
                    <h2 id="agora-novos" className={styles.sectionTitle}>
                      Novos pedidos {novos.length > 0 && <span className={styles.count}>{novos.length}</span>}
                    </h2>
                    <Link href={SELLER_ROUTES.pedidos('novos')} className={styles.link}>Ver todos</Link>
                  </div>
                  {novos.length === 0 ? (
                    <div className={styles.empty}>
                      <p className={styles.emptyTitle}>Nenhum pedido novo.</p>
                      {isOpen && canSayReceiving && <p className={styles.emptyText}>{hours.closesAt ? `Loja aberta até ${hours.closesAt}.` : 'Sua loja está aberta.'}</p>}
                    </div>
                  ) : (
                    novos.map((o) => (
                      <NewOrderCard
                        key={o._id}
                        order={o}
                        onReject={() => openReject(o)}
                        onAccepted={() => onAccepted(o)}
                        onAlready={() => reloadAndCheck(String(o._id))}
                        onExpire={() => { refresh(); }}
                      />
                    ))
                  )}
                </section>
              )}

              {andamento.length > 0 && (
                <section aria-labelledby="agora-andamento" className={styles.section}>
                  <div className={styles.sectionHead}>
                    <h2 id="agora-andamento" className={styles.sectionTitle}>
                      Em andamento <span className={styles.countMuted}>{andamento.length}</span>
                    </h2>
                  </div>
                  <ul className={styles.rows}>
                    {andamento.map((o) => {
                      const st = orderStage(o);
                      const detail = o.delivery?.motoboyName
                        ? `${o.delivery.motoboyName}${o.acceptedAt ? ` · aceito às ${formatHour(o.acceptedAt)}` : ''}`
                        : itemsSummary(o);
                      return (
                        <li key={o._id}>
                          <Link href={SELLER_ROUTES.pedido(o._id)} className={styles.row}>
                            <span className={styles.rowText}>
                              <b>{`#${shortOrderCode(o._id)}`}</b>
                              <span className={styles.rowSub}>{detail}</span>
                            </span>
                            <StageTag label={st.label} tone={st.tone} />
                            <ChevronRight size={18} aria-hidden="true" className={styles.chev} />
                          </Link>
                        </li>
                      );
                    })}
                  </ul>
                  {saasBlocked && <p className={styles.emptyText}>Pedidos pagos antes da pausa seguem até o fim.</p>}
                </section>
              )}
            </div>

            <aside className={styles.side}>
              {!pending && (
                <section aria-labelledby="agora-hoje" className={styles.section}>
                  <div className={styles.sectionHead}>
                    <h2 id="agora-hoje" className={styles.sectionTitle}>Hoje</h2>
                    {kpi && kpiAt && <span className={styles.countMuted}>{`até ${formatHour(kpiAt)}`}</span>}
                  </div>
                  <div className={styles.kpis}>
                    <div className={styles.kpi}>
                      <small>Vendas</small>
                      <b>{kpi ? formatMoney(kpi.current.revenue) : '—'}</b>
                      {kpi && <Delta value={kpi.delta.revenue} />}
                    </div>
                    <div className={styles.kpi}>
                      <small>Pedidos</small>
                      <b>{kpi ? String(kpi.current.orders) : '—'}</b>
                      {kpi && <Delta value={kpi.delta.orders} />}
                    </div>
                    <div className={styles.kpi}>
                      <small>Ticket</small>
                      <b>{kpi ? formatMoney(kpi.current.avgTicket) : '—'}</b>
                      {kpi && <Delta value={kpi.delta.avgTicket} />}
                    </div>
                  </div>
                </section>
              )}

              {lowStock.length > 0 && (
                <Alert
                  tone="warning"
                  title={lowStock.length === 1 ? '1 produto com estoque baixo' : `${lowStock.length} produtos com estoque baixo`}
                  action={{ label: 'Repor estoque', onClick: () => router.push(SELLER_ROUTES.estoque) }}
                >
                  {`${lowStock.slice(0, 2).map((p: any) => `${p.name} (${Number(p.quantity) || 0} un.)`).join(', ')}${lowStock.length > 2 ? ` e mais ${lowStock.length - 2}` : ''}.`}
                </Alert>
              )}

              {saasBlocked && (
                <Alert tone="info" title="Nada foi apagado">
                  Produtos, pedidos e avaliações estão guardados. Você pode editar o catálogo enquanto isso.
                </Alert>
              )}
            </aside>
          </div>
        </div>
        <RejectSheet
          order={rejecting}
          onClose={() => { setRejecting(null); setRejectDone(false); }}
          onRejected={onRejected}
          onAlreadyHandled={() => { refresh(); }}
        />
      </SellerShell>
    </ProtectedRoute>
  );
}
