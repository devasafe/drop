// frontend/pages/seller/pedido/[id].tsx
// Pedido da loja (DS v2, D1): separar os itens, retirada com PIN, "Pronto para retirada",
// cliente e conversa, linha do tempo com horas reais, resumo, aceite/recusa/cancelamento,
// devolução e estorno direto. A rota antiga seller/order-[id] reexporta esta tela.
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { MessageCircle, CheckCircle2, Bike } from 'lucide-react';
import ProtectedRoute from '../../../components/ProtectedRoute';
import SellerShell from '../../../components/seller/panel/SellerShell';
import { ScreenErrorBoundary, ScreenErrorFallback } from '../../../components/seller/panel/ScreenErrorBoundary';
import { useSellerPanel } from '../../../components/seller/panel/SellerPanelProvider';
import { useOrder } from '../../../hooks/useSync';
import { useAuth } from '../../../contexts/AuthContext';
import api from '../../../lib/api';
import { Button } from '../../../components/ui/Button';
import { Skeleton } from '../../../components/ui/Skeleton';
import { EmptyState } from '../../../components/ui/EmptyState';
import { Checkbox } from '../../../components/ui/Checkbox';
import { OrderTimeline, type TimelineStep } from '../../../components/drop/OrderTimeline';
import { OrderSummary } from '../../../components/drop/OrderSummary';
import { DirectRefundCard } from '../../../components/order/DirectRefundCard';
import { CancellationStatusDisplay } from '../../../components/order/CancellationStatusDisplay';
import { AcceptButton } from '../../../components/seller/order/AcceptButton';
import { AcceptCountdown } from '../../../components/seller/order/AcceptCountdown';
import { RejectSheet } from '../../../components/seller/order/RejectSheet';
import { PickupPinEntry } from '../../../components/seller/order/PickupPinEntry';
import { ReturnConfirm } from '../../../components/seller/order/ReturnConfirm';
import { OrderChatSheet } from '../../../components/seller/order/OrderChatSheet';
import { StageTag } from '../../../components/seller/StageTag';
import { formatMoney } from '../../../lib/money';
import { paymentMethodLabel } from '../../../lib/paymentLabel';
import { isPlan1Order, shortOrderCode } from '../../../lib/customerOrder';
import { SELLER_ROUTES } from '../../../lib/sellerRoutes';
import { hasPendingReturn, isAwaitingAccept, isCancelled, isDelivered, orderStage } from '../../../lib/sellerOrders';
import { apiError, formatHour } from '../../../lib/sellerApi';
import styles from './PedidoLoja.module.css';

/**
 * Cartão ainda não aprovado pelo Asaas (ex.: em análise de risco). O aceite do servidor não
 * confere o pagamento: a tela não oferece aceitar nem recusar até o pagamento cair.
 */
const cardAwaitingPayment = (o: any): boolean =>
  o?.paymentMethod === 'credit_card' && !!o?.asaasPaymentId && o?.paymentStatus !== 'paid';

const deadlinePassed = (deadline: unknown): boolean => {
  const t = typeof deadline === 'string' ? Date.parse(deadline) : NaN;
  return !Number.isNaN(t) && t <= Date.now();
};

/** Passos com a hora real de cada um; cancelado termina num passo de erro. */
function timelineSteps(o: any): TimelineStep[] {
  const t = (v: any) => formatHour(v) ?? undefined;
  const d = o.delivery || {};
  const raw: Array<{ label: string; time?: string; detail?: string; done: boolean }> = [
    { label: 'Pedido recebido', time: t(o.paidAt ?? o.createdAt), detail: paymentMethodLabel(o.paymentMethod), done: true },
    { label: 'Aceito por você', time: t(o.acceptedAt), done: !!o.acceptedAt },
  ];
  if (!isPlan1Order(o)) {
    raw.push({ label: 'Pronto para retirada', time: t(o.readyAt), done: !!o.readyAt || !!d.pickedAt });
    raw.push({ label: 'Retirado pelo motoboy', time: t(d.pickedAt), detail: d.motoboyName, done: !!d.pickedAt || d.status === 'picked' });
  }
  raw.push({ label: 'Entregue', time: t(d.deliveredAt), done: isDelivered(o) });

  if (isCancelled(o)) {
    const done: TimelineStep[] = raw.filter((s) => s.done).map((s) => ({ label: s.label, time: s.time, detail: s.detail, state: 'done' }));
    return [...done, { label: 'Cancelado', time: t(o.cancelledAt), state: 'error' }];
  }
  let current = false;
  return raw.map((s) => {
    if (s.done) return { label: s.label, time: s.time, detail: s.detail, state: 'done' };
    if (!current) { current = true; return { label: s.label, state: 'current' }; }
    return { label: s.label, state: 'upcoming' };
  });
}

type RejectMode = 'recusar' | 'cancelar';

/**
 * Exceção no render da tela (pedido antigo com dado faltando, formato inesperado) não deixa a
 * página em branco: mostra o erro do DS v2 dentro da casca, e "Tentar de novo" remonta a tela
 * (o pedido é lido de novo). Erros dos blocos filhos já param no limite do SellerShell.
 */
export default function SellerPedidoPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const title = id ? `Pedido #${shortOrderCode(id)}` : 'Pedido';
  return (
    <ScreenErrorBoundary
      resetKey={id}
      renderFallback={(retry) => (
        <ProtectedRoute required_role="lojista">
          <SellerShell title={title} back={SELLER_ROUTES.pedidos()}>
            <div className={styles.page}>
              <ScreenErrorFallback onRetry={retry} />
            </div>
          </SellerShell>
        </ProtectedRoute>
      )}
    >
      <SellerPedidoScreen id={id} />
    </ScreenErrorBoundary>
  );
}

function SellerPedidoScreen({ id }: { id: string | undefined }) {
  const { order: base, loading, setOrder } = useOrder(id) as { order: any; loading: boolean; setOrder?: (o: any) => void };
  const panel = useSellerPanel();
  const { user } = useAuth() || ({} as any);
  const [picked, setPicked] = useState<Record<number, boolean>>({});
  // A sheet guarda o pedido de quando abriu e o mantém até o onClose (a confirmação mostra o valor devolvido).
  const [rejecting, setRejecting] = useState<{ order: any; mode: RejectMode } | null>(null);
  const [rejectDone, setRejectDone] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [readyBusy, setReadyBusy] = useState(false);
  const [readyError, setReadyError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [expired, setExpired] = useState(false);

  // O painel (socket) tem a entrega e o prazo mais novos; o pedido completo vem do useOrder.
  const live = id ? (panel?.orders || []).find((o: any) => String(o._id) === id) : undefined;
  const order = base
    ? {
        ...base,
        ...(live
          ? {
              status: live.status ?? base.status,
              acceptDeadline: live.acceptDeadline ?? base.acceptDeadline,
              acceptedAt: live.acceptedAt ?? base.acceptedAt,
              readyAt: live.readyAt ?? base.readyAt,
              delivery: live.delivery ?? base.delivery,
            }
          : {}),
      }
    : null;

  /** Recarrega o painel e o pedido; devolve o pedido novo (null se a recarga falhou). */
  const reload = async (): Promise<any | null> => {
    await Promise.resolve(panel?.refresh?.()).catch(() => undefined);
    if (!id) return null;
    try {
      const r = await api.get(`/orders/${id}`);
      if (r?.data) {
        setOrder?.(r.data);
        return r.data;
      }
    } catch { /* o socket corrige depois */ }
    return null;
  };

  // O pedido mudou de estado por outro caminho com a sheet aberta (antes da confirmação): fecha a sheet.
  const status = order?.status;
  const motoboyId = order?.delivery?.motoboyId;
  useEffect(() => {
    if (!rejecting || rejectDone) return;
    if (status !== rejecting.order.status || (rejecting.mode === 'cancelar' && motoboyId)) setRejecting(null);
  }, [status, motoboyId, rejecting, rejectDone]);

  // Devolução pedida pelo motoboy: o backend só emite delivery:return_requested, que entra em
  // panel.returnRequests sem mexer no pedido. Recarrega o pedido (PIN e estado vêm do servidor),
  // uma vez por entrega. A chave é só o deliveryId: o returnedAt das devoluções lidas do
  // /stores/dashboard muda a cada carga e geraria um loop de recarga. A chave sai quando a
  // entrada some do painel (dismissReturn após confirmar): uma 2ª devolução da mesma entrega
  // (reassign → outro motoboy → nova devolução) recarrega de novo. A recarga do dashboard
  // repõe a mesma entrada sem que ela suma antes, então não há loop.
  const seenReturns = useRef<Set<string>>(new Set());
  const reloadRef = useRef(reload);
  reloadRef.current = reload;
  const pendingReturnRef = useRef(false);
  pendingReturnRef.current = !!order && hasPendingReturn(order);
  const returnRequests = panel?.returnRequests;
  useEffect(() => {
    if (!id) return;
    const present = new Set(
      (returnRequests || []).filter((r) => String(r?.orderId) === id && r?.deliveryId).map((r) => String(r.deliveryId)),
    );
    seenReturns.current.forEach((k) => { if (!present.has(k)) seenReturns.current.delete(k); });
    let fresh = false;
    for (const key of Array.from(present)) {
      if (seenReturns.current.has(key)) continue;
      seenReturns.current.add(key);
      fresh = true;
    }
    if (fresh && !pendingReturnRef.current) reloadRef.current();
  }, [returnRequests, id]);

  const deadline = order?.acceptDeadline;
  useEffect(() => { setExpired(deadlinePassed(deadline)); }, [deadline]);

  const title = id ? `Pedido #${shortOrderCode(id)}` : 'Pedido';

  if (loading) {
    return (
      <ProtectedRoute required_role="lojista">
        <SellerShell title={title} back={SELLER_ROUTES.pedidos()}>
          <div className={styles.page} role="status" aria-label="Carregando">
            <Skeleton height={120} />
            <Skeleton height={160} />
          </div>
        </SellerShell>
      </ProtectedRoute>
    );
  }

  if (!order) {
    return (
      <ProtectedRoute required_role="lojista">
        <SellerShell title={title} back={SELLER_ROUTES.pedidos()}>
          <div className={styles.page}>
            <EmptyState
              icon={<Bike size={28} />}
              title="Pedido não encontrado"
              description="Ele pode ser de outra loja ou o link está errado."
              action={<Link href={SELLER_ROUTES.pedidos()} className={styles.link}>Ver pedidos</Link>}
            />
          </div>
        </SellerShell>
      </ProtectedRoute>
    );
  }

  const stage = orderStage(order);
  const awaiting = isAwaitingAccept(order);
  const cancelled = isCancelled(order);
  const delivered = isDelivered(order);
  const plan1 = isPlan1Order(order);
  const awaitingCard = cardAwaitingPayment(order);
  const d = order.delivery || null;
  const products: any[] = Array.isArray(order.products) ? order.products : [];
  const picking = !!order.acceptedAt && !cancelled && !delivered && d?.status !== 'picked';
  const pickedCount = products.filter((_, i) => picked[i]).length;
  const canReady = !cancelled && !awaiting && !plan1 && !!order.acceptedAt && !order.readyAt && !delivered && d?.status !== 'picked';
  const canCancel = !cancelled && ['pago', 'aguardando_motoboy'].includes(order.status) && !d?.motoboyId;
  const itemsTotal = products.reduce((s, p) => s + (Number(p.price) || 0) * (Number(p.quantity) || 0), 0);
  const storeAmount = order.walletDistribution?.storeAmount;
  const customerId = order.customerId || order.customerObj?._id;
  const km = Number(order.deliveryDistance);

  const openReject = (mode: RejectMode) => {
    setRejectDone(false);
    setRejecting({ order, mode });
  };

  // C12: o otimista vem antes da recarga.
  const onAccepted = () => {
    setNotice('Pedido aceito. Separe os itens.');
    panel?.patchOrder?.(String(order._id), { status: 'pago' });
    reload();
  };

  // Qualquer erro no aceite recarrega; true = ainda espera aceite (vale a mensagem do servidor).
  const onAcceptError = async (): Promise<boolean | void> => {
    const fresh = await reload();
    if (!fresh) return undefined;
    if (isAwaitingAccept(fresh)) return true;
    // O botão some quando o pedido recarregado não espera mais aceite: o aviso fica na página.
    setNotice(isCancelled(fresh) ? 'Este pedido foi cancelado.' : 'Este pedido já foi aceito.');
    return false;
  };

  const onRejected = () => {
    setRejectDone(true);
    panel?.removeOrder?.(String(order._id));
    reload();
  };

  const markReady = async () => {
    setReadyBusy(true);
    setReadyError(null);
    try {
      await api.post(`/orders/${order._id}/ready`);
      await reload();
    } catch (err) {
      setReadyError(apiError(err).message || 'Não deu para avisar agora. Tente de novo.');
    } finally {
      setReadyBusy(false);
    }
  };

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell title={title} back={SELLER_ROUTES.pedidos()} actions={<StageTag label={stage.label} tone={stage.tone} />}>
        <div className={styles.page}>
          {notice && <p role="status" className={styles.notice}>{notice}</p>}
          <div className={styles.grid}>
            <div className={styles.col}>
              {awaiting && (
                <section className={styles.block} aria-label="Pedido novo">
                  <div className={styles.blockHead}>
                    <h2 className={styles.blockTitle}>Pedido novo</h2>
                    <AcceptCountdown deadline={order.acceptDeadline} onExpire={() => { setExpired(true); reload(); }} />
                  </div>
                  {expired ? null : awaitingCard ? (
                    <p className={styles.meta}>Aguardando a aprovação do cartão</p>
                  ) : (
                    <>
                      <p className={styles.meta}>Aceite para começar a separar. Se o prazo acabar, o pedido é cancelado e o cliente recebe o dinheiro de volta.</p>
                      <div className={styles.actions}>
                        <Button variant="secondary" onClick={() => openReject('recusar')}>Recusar</Button>
                        <AcceptButton
                          orderId={order._id}
                          distance={order.deliveryDistance || 0}
                          onAccepted={onAccepted}
                          onAlreadyHandled={onAcceptError}
                        />
                      </div>
                    </>
                  )}
                </section>
              )}

              {cancelled && <CancellationStatusDisplay orderId={order._id} />}
              {order.directRefund && <DirectRefundCard orderId={order._id} refund={order.directRefund} onChange={() => { reload(); }} />}

              {hasPendingReturn(order) && d?._id && (
                <section className={styles.block} aria-label="Devolução pedida">
                  <h2 className={styles.blockTitle}>Devolução pedida</h2>
                  <p className={styles.meta}>O motoboy está voltando com o produto. Quando ele chegar, confira o produto e digite o PIN que ele mostrar.</p>
                  <ReturnConfirm deliveryId={String(d._id)} onDone={() => { setNotice('Devolução confirmada.'); panel?.dismissReturn?.(String(d._id)); reload(); }} />
                </section>
              )}

              <section className={styles.block} aria-label="Itens">
                <div className={styles.blockHead}>
                  <h2 className={styles.blockTitle}>{picking ? 'Separe os itens' : 'Itens'}</h2>
                  {picking && products.length > 0 && <span className={styles.meta}>{`${pickedCount} de ${products.length}`}</span>}
                </div>
                {products.length === 0 ? (
                  <p className={styles.meta}>Nenhum item.</p>
                ) : picking ? (
                  products.map((p, i) => (
                    <Checkbox
                      key={`${p.productId || i}-${i}`}
                      label={`${p.quantity}× ${p.productName || p.name || 'Produto'}`}
                      checked={!!picked[i]}
                      onChange={(v) => setPicked((s) => ({ ...s, [i]: v }))}
                    />
                  ))
                ) : (
                  <ul className={styles.items}>
                    {products.map((p, i) => (
                      <li key={`${p.productId || i}-${i}`} className={styles.item}>
                        <span>{`${p.quantity}× ${p.productName || p.name || 'Produto'}`}</span>
                        <span className={styles.price}>{formatMoney((Number(p.price) || 0) * (Number(p.quantity) || 0))}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {!plan1 && !cancelled && !awaiting && (
                <section className={styles.block} aria-label="Retirada do motoboy">
                  <h2 className={styles.blockTitle}>Retirada do motoboy</h2>
                  {d?.status === 'assigned' && d?._id ? (
                    <>
                      <p className={styles.strong}>{d.motoboyName || 'Motoboy'}</p>
                      <PickupPinEntry deliveryId={String(d._id)} onValidated={() => { setNotice('Retirada confirmada.'); reload(); }} />
                    </>
                  ) : d?.status === 'picked' || d?.pickedAt || delivered ? (
                    <p className={styles.ok}>
                      <CheckCircle2 size={18} aria-hidden="true" />
                      {`Retirado${d?.motoboyName ? ` por ${d.motoboyName}` : ''}${d?.pickedAt ? ` às ${formatHour(d.pickedAt)}` : ''}`}
                    </p>
                  ) : (
                    <p className={styles.meta}>Procurando motoboy. Avisamos quando alguém aceitar a corrida.</p>
                  )}
                  {order.readyAt && !d?.pickedAt && d?.status !== 'picked' && (
                    <p className={styles.meta}>{`Pronto para retirada desde ${formatHour(order.readyAt)}`}</p>
                  )}
                </section>
              )}
            </div>

            <div className={styles.col}>
              <section className={styles.block} aria-label="Cliente">
                <div className={styles.blockHead}>
                  <h2 className={styles.blockTitle}>Cliente</h2>
                  {customerId && (
                    <Button variant="tertiary" size="sm" leftIcon={<MessageCircle size={16} aria-hidden="true" />} onClick={() => setChatOpen(true)}>
                      Mensagem
                    </Button>
                  )}
                </div>
                <p className={styles.strong}>{order.customerName || 'Cliente'}</p>
                {(typeof order.customerAddress === 'string' || (Number.isFinite(km) && km > 0)) && (
                  <p className={styles.meta}>
                    {[typeof order.customerAddress === 'string' ? order.customerAddress : null, Number.isFinite(km) && km > 0 ? `${km.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} km` : null].filter(Boolean).join(' · ')}
                  </p>
                )}
              </section>

              <section className={styles.block} aria-label="Andamento">
                <h2 className={styles.blockTitle}>Andamento</h2>
                <OrderTimeline steps={timelineSteps(order)} />
              </section>

              <section className={styles.block} aria-label="Resumo">
                <OrderSummary
                  lines={[
                    { label: `Itens (${products.reduce((s, p) => s + (Number(p.quantity) || 0), 0)})`, value: itemsTotal },
                    { label: 'Entrega (vai para o motoboy)', value: Number(order.deliveryFee) || 0 },
                  ]}
                  total={Number(order.totalValue) || 0}
                  totalLabel="Total pago pelo cliente"
                />
                {typeof storeAmount === 'number' && (
                  <div className={styles.receive}>
                    <span>Você recebe</span>
                    <b>{formatMoney(storeAmount)}</b>
                  </div>
                )}
              </section>
            </div>
          </div>

          {(canReady || canCancel || readyError) && (
            <div className={styles.bar}>
              {canReady && (
                <>
                  <Button onClick={markReady} loading={readyBusy}>Pronto para retirada</Button>
                  <small className={styles.meta}>Se já houver motoboy a caminho, ele é avisado na hora.</small>
                </>
              )}
              {readyError && <p role="alert" className={styles.error}>{readyError}</p>}
              {canCancel && (
                <Button variant="tertiary" size="sm" onClick={() => openReject('cancelar')}>Cancelar pedido</Button>
              )}
            </div>
          )}
        </div>

        <RejectSheet
          order={rejecting?.order ?? null}
          mode={rejecting?.mode || 'recusar'}
          onClose={() => { setRejecting(null); setRejectDone(false); }}
          onRejected={onRejected}
          onAlreadyHandled={() => { reload(); }}
        />
        {customerId && (
          <OrderChatSheet open={chatOpen} onClose={() => setChatOpen(false)} order={order} currentUserId={String(user?._id ?? user?.id ?? '')} />
        )}
      </SellerShell>
    </ProtectedRoute>
  );
}
