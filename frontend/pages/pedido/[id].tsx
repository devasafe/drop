import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { Map as MapIcon, PackageSearch } from 'lucide-react';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { Alert } from '../../components/ui/Alert';
import { Avatar } from '../../components/ui/Avatar';
import { ICON_STROKE_WIDTH } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import { useOrderTracking } from '../../hooks/useOrderTracking';
import { useCancellation } from '../../hooks/useCancellation';
import { OrderStatusBadge, orderStatusView } from '../../components/drop/OrderStatusBadge';
import { OrderTimeline } from '../../components/drop/OrderTimeline';
import { DeliveryPin } from '../../components/drop/order/DeliveryPin';
import { OrderItemsSummary } from '../../components/drop/order/OrderItemsSummary';
import { OrderActions } from '../../components/drop/order/OrderActions';
import { RatingForm } from '../../components/drop/order/RatingForm';
import { PixPaymentSheet } from '../../components/drop/checkout/PixPaymentSheet';
import { CancelOrderSheet } from '../../components/drop/order/CancelOrderSheet';
import { CancellationStatus, type CancellationInfo } from '../../components/drop/order/CancellationStatus';
import { customerOrderStatus, orderTimelineSteps, shortOrderCode } from '../../lib/customerOrder';
import { ROUTES } from '../../lib/routes';
import styles from './Pedido.module.css';
import dynamic from 'next/dynamic';

// Drop Maps (MapLibre/WebGL) só no client.
const ClienteTrackingMap = dynamic(
  () => import('../../components/map/presets/ClienteTrackingMap').then((m) => m.ClienteTrackingMap),
  { ssr: false }
);

// Status em que o cliente ainda pode pedir cancelamento — mesma regra do
// `CancelOrderModal`, mantida aqui só pra decidir se o botão aparece.
const CANCELABLE_STATUSES = ['criado', 'pago', 'aguardando_motoboy', 'enviado'];

/**
 * Pedido do cliente (DS v2) — orquestração pura: toda a lógica (order/
 * delivery, sockets, PIX sob demanda, avaliações) vive em `useOrderTracking`.
 * O status e a timeline vêm de `lib/customerOrder` (pedido + entrega).
 */
export default function PedidoPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { showToast } = useToast();
  const t = useOrderTracking(id);
  const { cancelOrder, getCancellationHistory } = useCancellation();
  const [mapOpen, setMapOpen] = useState(false);

  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [cancellationRecord, setCancellationRecord] = useState<{
    cancelledBy: CancellationInfo['cancelledBy'];
    reasonCode: string;
    reason: string;
    refundAmount?: number;
    refundStatus?: CancellationInfo['refundStatus'];
    createdAt: string;
    cancellationFee?: number;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [payingPix, setPayingPix] = useState(false);
  const [submittingMotoboyRating, setSubmittingMotoboyRating] = useState(false);
  const [submittingStoreRating, setSubmittingStoreRating] = useState(false);
  const [reviewedProducts, setReviewedProducts] = useState<Record<string, boolean>>({});
  const [submittingProduct, setSubmittingProduct] = useState<string | null>(null);

  // Hidrata quais produtos deste pedido o cliente JÁ avaliou. Sem isto, após um
  // F5 o estado local zerava e os formulários de avaliação de produto reapareciam
  // como se nada tivesse sido enviado (motoboy/loja não sofrem: vêm do backend
  // no order/delivery). O backend faz upsert, então reavaliar não duplica — isto
  // é só pra a UI refletir o que já foi feito.
  const delivered = t.order?.status === 'entregue' || t.delivery?.status === 'delivered';
  useEffect(() => {
    if (!id || !delivered) return;
    let cancelled = false;
    api.get<{ reviewedProductIds: string[] }>(`/orders/${id}/my-product-reviews`)
      .then((res) => {
        if (cancelled) return;
        const map: Record<string, boolean> = {};
        for (const pid of res.data?.reviewedProductIds || []) map[pid] = true;
        setReviewedProducts((prev) => ({ ...prev, ...map }));
      })
      .catch(() => { /* melhor esforço — se falhar, o form aparece e o upsert protege contra duplicidade */ });
    return () => { cancelled = true; };
  }, [id, delivered]);

  const handleConfirmReceived = async () => {
    if (confirming) return;
    setConfirming(true);
    const r = await t.confirmReceived();
    if (!r.ok && r.error) showToast(r.error, 'error');
    setConfirming(false);
  };

  const handleOpenPix = async () => {
    if (payingPix) return;
    setPayingPix(true);
    const r = await t.openPix();
    if (!r.ok && r.error) showToast(r.error, 'error');
    setPayingPix(false);
  };

  const handleMotoboyRating = async (rating: number, comment: string) => {
    setSubmittingMotoboyRating(true);
    const r = await t.submitMotoboyRating(rating, comment);
    if (!r.ok && r.error) showToast(r.error, 'error');
    setSubmittingMotoboyRating(false);
  };

  const handleStoreRating = async (rating: number, comment: string) => {
    setSubmittingStoreRating(true);
    const r = await t.submitStoreRating(rating, comment);
    if (!r.ok && r.error) showToast(r.error, 'error');
    setSubmittingStoreRating(false);
  };

  const handleProductRating = (productId: string) => async (rating: number, comment: string) => {
    const orderId = t.order?._id;
    if (!orderId) return;
    setSubmittingProduct(productId);
    try {
      await api.post(`/products/${productId}/reviews`, { rating, comment, orderId });
      setReviewedProducts((prev) => ({ ...prev, [productId]: true }));
      showToast('Avaliação enviada!', 'success');
    } catch (e: any) {
      showToast(e?.response?.data?.error || 'Erro ao avaliar produto', 'error');
    } finally {
      setSubmittingProduct(null);
    }
  };

  const handleCancelConfirm = async ({ reason, reasonCode }: { reason: string; reasonCode: string }) => {
    if (!t.order?._id || cancelling) return;
    setCancelling(true);
    const r = await cancelOrder(t.order._id, reason, reasonCode);
    if (!r.success) {
      showToast(r.error || 'Erro ao cancelar pedido', 'error');
    } else {
      setCancelOpen(false);
      t.refetch();
    }
    setCancelling(false);
  };

  const order = t.order;
  const delivery = t.delivery;

  // Busca o registro do cancelamento (motivo, reembolso, taxa) só quando o
  // pedido está cancelado — não há preview nem campo embutido em `order`.
  // `GET /orders/:id/cancellations` devolve o `Cancellation` cru do Prisma
  // (mesmos nomes de campo do model); `lateCancellationFee` é a taxa
  // (Decimal→string no JSON) e mapeamos pra `cancellationFee` do DS.
  useEffect(() => {
    if (order?.status !== 'cancelado' || !order?._id) {
      setCancellationRecord(null);
      return;
    }
    const orderId = order._id;
    let cancelled = false;
    getCancellationHistory(orderId).then((r) => {
      if (cancelled || !r.success || !r.data?.length) return;
      const latest = r.data[0];
      setCancellationRecord({
        cancelledBy: latest.cancelledBy,
        reasonCode: latest.reasonCode,
        reason: latest.reason,
        refundAmount: latest.refundAmount != null ? Number(latest.refundAmount) : undefined,
        refundStatus: latest.refundStatus,
        createdAt: latest.createdAt,
        cancellationFee: latest.lateCancellationFee != null ? Number(latest.lateCancellationFee) : undefined,
      });
    });
    return () => {
      cancelled = true;
    };
  }, [order?.status, order?._id, getCancellationHistory]);

  // O PIN de devolução NÃO mora no cancelamento — é campo do `Delivery`
  // (`delivery.pinDevolucao`, fluxo motoboy → loja), então é combinado aqui
  // com o registro buscado acima em vez de fixado no momento do fetch (a
  // entrega pode terminar de carregar depois do histórico).
  const cancellation: CancellationInfo | null = cancellationRecord
    ? { ...cancellationRecord, pinDevolucao: delivery?.pinDevolucao || undefined }
    : null;

  const showPixButton =
    !!order &&
    order.paymentMethod === 'pix' &&
    order.paymentStatus !== 'paid' &&
    !!order.asaasPaymentId &&
    !['cancelado', 'rejeitado'].includes(order.status);

  const canCancel = !!order && CANCELABLE_STATUSES.includes(order.status);

  // Mostra a section pelo estado que HABILITA avaliar (não por "ainda não
  // avaliado") — o `RatingForm` decide sozinho form vs. confirmação via
  // `submitted`. Assim o envio não faz a confirmação sumir sem feedback.
  const showMotoboyRating = delivery?.status === 'delivered';
  const showStoreRating = delivery?.status === 'delivered' || order?.status === 'entregue';

  const status = order ? customerOrderStatus(order, delivery) : 'awaiting_store';
  const steps = order ? orderTimelineSteps(order, delivery) : [];
  const view = orderStatusView(status);
  const tripMin = order && status === 'out_for_delivery' && Number(order.deliveryDuration) > 0 ? Math.round(Number(order.deliveryDuration) / 60) : null;
  const mb = delivery?.motoboyObj;

  return (
    <ProtectedRoute required_role="cliente">
      <div className={styles.shell}>
        {t.loading ? (
          <div className={styles.page}>
            <div className={styles.loadingWrap}>
              <Skeleton height={140} radius="var(--radius-lg)" />
              <Skeleton height={120} radius="var(--radius-lg)" />
              <Skeleton height={200} radius="var(--radius-lg)" />
            </div>
          </div>
        ) : !order ? (
          <div className={styles.emptyWrap}>
            <EmptyState
              icon={<PackageSearch size={22} strokeWidth={ICON_STROKE_WIDTH} />}
              title="Pedido não encontrado"
              description="Verifique o link ou volte para seus pedidos."
              action={<Button onClick={() => router.push(ROUTES.pedidos)}>Ver meus pedidos</Button>}
            />
          </div>
        ) : (
          <main className={styles.page}>
            <header className={styles.header}>
              <h1 className={styles.title}>Pedido #{shortOrderCode(order._id)}</h1>
              <p className={styles.meta}>{order.storeName || 'Loja'}</p>
            </header>

            <section className={styles.status}>
              <span aria-hidden="true"><OrderStatusBadge status={status} /></span>
              <p className={styles.statusBig} aria-live="polite">{view.label}</p>
              {tripMin && <p className={styles.statusSub}>{`Trajeto de cerca de ${tripMin} min`}</p>}
              {status === 'problem' && (
                <Alert tone="error" title="Tivemos um problema na entrega" action={{ label: 'Falar com suporte', onClick: () => router.push('/suporte') }}>
                  Já estamos olhando o seu pedido.
                </Alert>
              )}
            </section>

            {mb && (
              <section className={styles.courier}>
                <Avatar name={mb.name} src={mb.photo} />
                <div>
                  <p className={styles.courierName}>{mb.name}</p>
                  <p className={styles.meta}>
                    {[mb.rating ? `★ ${String(mb.rating).replace('.', ',')}` : null, mb.plate ? `moto ${mb.plate}` : null].filter(Boolean).join(' · ')}
                  </p>
                </div>
              </section>
            )}

            {t.showPin && delivery?.pin && !['cancelado', 'rejeitado', 'entregue'].includes(order.status) && status !== 'delivered' && (
              <section className={styles.block} aria-label="Código de entrega">
                <p className={styles.blockLabel}>Código de entrega</p>
                <DeliveryPin pin={delivery.pin} />
              </section>
            )}

            {order.deliveryId && !['cancelado', 'rejeitado'].includes(order.status) && (
              <Button variant="secondary" leftIcon={<MapIcon size={18} strokeWidth={ICON_STROKE_WIDTH} />} onClick={() => setMapOpen(true)}>
                Acompanhar no mapa
              </Button>
            )}
            {mapOpen && <ClienteTrackingMap order={order} onClose={() => setMapOpen(false)} />}

            {showPixButton && (
              <Alert tone="warning" title="Pagamento pendente" action={{ label: 'Pagar com Pix', onClick: handleOpenPix }}>
                Seu pedido só vai para a loja depois do Pix.
              </Alert>
            )}

            <section className={styles.block}>
              <OrderTimeline steps={steps} />
            </section>

            {order.status === 'cancelado' && cancellation && (
              <section className={styles.block}>
                <CancellationStatus cancellation={cancellation} />
              </section>
            )}

            <section className={styles.block}>
              <OrderItemsSummary
                items={(order.products || []).map((p: any) => ({
                  name: p.productName,
                  quantity: p.quantity,
                  price: p.price,
                }))}
                subtotal={order.subtotal ?? 0}
                deliveryFee={order.deliveryFee ?? 0}
                // Cupom/desconto não é campo próprio do Order; é derivado do que
                // sobrou entre (subtotal + entrega) e o total do pedido.
                discount={Math.max(0, Math.round(((Number(order.subtotal) || 0) + (Number(order.deliveryFee) || 0) - (Number(order.totalValue) || 0)) * 100) / 100)}
                total={order.totalValue ?? 0}
                paymentMethod={order.paymentMethod}
                installmentCount={order.installmentCount}
                walletApplied={order.walletApplied ? Number(order.walletApplied) : 0}
                cardChargedTotal={order.cardChargedTotal ? Number(order.cardChargedTotal) : undefined}
                installmentValue={order.installmentValue ? Number(order.installmentValue) : undefined}
              />
            </section>

            <OrderActions
              canCancel={canCancel}
              canConfirmReceived={t.canConfirmReceived}
              confirming={confirming}
              onCancel={() => setCancelOpen(true)}
              onConfirmReceived={handleConfirmReceived}
            />

            {showMotoboyRating && (
              <section className={styles.block}>
                <RatingForm
                  title="Avaliar motoboy"
                  onSubmit={handleMotoboyRating}
                  submitting={submittingMotoboyRating}
                  submitted={!!delivery?.rating}
                />
              </section>
            )}

            {showStoreRating && (
              <section className={styles.block}>
                <RatingForm
                  title="Avaliar loja"
                  onSubmit={handleStoreRating}
                  submitting={submittingStoreRating}
                  submitted={!!order?.storeRating}
                />
              </section>
            )}

            {showStoreRating && (order.products || []).map((p: any) => {
              const pid = p.productId || p.product?._id || p.product?.id;
              if (!pid) return null;
              return (
                <section key={pid} className={styles.block}>
                  <RatingForm
                    title={`Avaliar: ${p.productName || 'Produto'}`}
                    onSubmit={handleProductRating(pid)}
                    submitting={submittingProduct === pid}
                    submitted={!!reviewedProducts[pid]}
                  />
                </section>
              );
            })}

            <CancelOrderSheet
              open={cancelOpen}
              onClose={() => setCancelOpen(false)}
              onConfirm={handleCancelConfirm}
              submitting={cancelling}
            />
          </main>
        )}

        {/* Sheet de pagamento PIX: overlay que precisa aparecer sobre QUALQUER
            estado — inclusive carregando/não encontrado. Fica fora do guard de
            estado de propósito (lição do checkout: um EmptyState mascarando o
            ramo "com conteúdo" esconderia o sheet). */}
        {t.pixData && (
          <PixPaymentSheet
            pix={t.pixData}
            paymentProvider={order.paymentProvider}
            recipientName={order.storeName}
            onPaid={() => {
              t.closePix();
              t.refetch();
            }}
            onClose={t.closePix}
          />
        )}
      </div>
    </ProtectedRoute>
  );
}
