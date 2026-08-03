import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { AlertTriangle, PackageSearch } from 'lucide-react';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { ICON_STROKE_WIDTH } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import { useOrderTracking } from '../../hooks/useOrderTracking';
import { useCancellation } from '../../hooks/useCancellation';
import type { OrderTrackerStep } from '../../components/drop/OrderTracker';
import { OrderStatusHero } from '../../components/drop/order/OrderStatusHero';
import { OrderTimeline } from '../../components/drop/order/OrderTimeline';
import { DeliveryPin } from '../../components/drop/order/DeliveryPin';
import { MotoboyMap } from '../../components/drop/order/MotoboyMap';
import { OrderItemsSummary } from '../../components/drop/order/OrderItemsSummary';
import { OrderActions } from '../../components/drop/order/OrderActions';
import { RatingForm } from '../../components/drop/order/RatingForm';
import { PixPaymentSheet } from '../../components/drop/checkout/PixPaymentSheet';
import { CancelOrderSheet } from '../../components/drop/order/CancelOrderSheet';
import { CancellationStatus, type CancellationInfo } from '../../components/drop/order/CancellationStatus';
import styles from './StoreOrderStatus.module.css';

// Status em que o cliente ainda pode pedir cancelamento — mesma regra do
// `CancelOrderModal`, mantida aqui só pra decidir se o botão aparece.
const CANCELABLE_STATUSES = ['criado', 'pago', 'enviado'];

/** Rótulo curto do passo atual (mesmo fallback que `OrderTracker` usa
 * quando `statusLabel` não é informado), pra `OrderStatusHero` e
 * `OrderTimeline` mostrarem o mesmo rótulo. */
function currentStepLabel(steps: OrderTrackerStep[]): string {
  const done = steps.filter((s) => s.done);
  return done.length > 0 ? done[done.length - 1].label : 'Em andamento';
}

/**
 * Acompanhamento de pedido — orquestração pura: toda a lógica (order/
 * delivery, sockets, PIX sob demanda, avaliações) vive em `useOrderTracking`.
 * Esta página só decide QUAL estado mostrar (carregando / não encontrado /
 * conteúdo) e conecta os componentes do DS aos dados e callbacks do hook.
 */
export default function StoreOrderStatus() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { showToast } = useToast();
  const t = useOrderTracking(id);
  const { cancelOrder, getCancellationHistory } = useCancellation();

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

  // Coords de loja/cliente vêm pré-calculadas por `GET /deliveries/:id`
  // (`deliveryController.getDelivery`): `pickupLat/Lng` (loja, com fallback
  // pro `storeObj`) e `deliveryLat/Lng` (cliente, com fallback pro endereço
  // padrão) — mesma fonte usada pela tela do motoboy. Só existem quando a
  // entrega já carregou, daí o `delivery?.`.
  const storeCoords =
    delivery?.pickupLat != null && delivery?.pickupLng != null
      ? { lat: Number(delivery.pickupLat), lng: Number(delivery.pickupLng) }
      : undefined;
  const customerCoords =
    delivery?.deliveryLat != null && delivery?.deliveryLng != null
      ? { lat: Number(delivery.deliveryLat), lng: Number(delivery.deliveryLng) }
      : undefined;

  return (
    <ProtectedRoute required_role="cliente">
      <div className={styles.page}>
        {t.loading ? (
          <div className={styles.container}>
            <div className={styles.loadingWrap}>
              <Skeleton height={140} radius="var(--r-lg)" />
              <Skeleton height={120} radius="var(--r-lg)" />
              <Skeleton height={200} radius="var(--r-lg)" />
            </div>
          </div>
        ) : !order ? (
          <div className={styles.emptyWrap}>
            <EmptyState
              icon={<PackageSearch size={22} strokeWidth={ICON_STROKE_WIDTH} />}
              title="Pedido não encontrado"
              description="Verifique o link ou volte para seus pedidos."
              action={<Button onClick={() => router.push('/')}>Voltar para o início</Button>}
            />
          </div>
        ) : (
          <div className={styles.container}>
            <div className={styles.header}>
              <h1 className={styles.title}>Acompanhar pedido</h1>
              <p className={styles.orderId}>Pedido #{order._id}</p>
            </div>

            <section className={styles.section}>
              <OrderStatusHero
                statusLabel={currentStepLabel(t.steps)}
                statusTone={t.statusTone}
                message={t.statusLabel}
              />
              <OrderTimeline
                orderId={order._id}
                storeName={order.storeName || 'Loja'}
                progress={t.progress}
                steps={t.steps}
              />
            </section>

            {t.showMap && (
              <section className={styles.section}>
                <MotoboyMap
                  motoboy={t.motoboyPos ?? undefined}
                  store={storeCoords}
                  customer={customerCoords}
                  height={280}
                />
              </section>
            )}

            {showPixButton && (
              <section className={styles.section}>
                <div className={styles.pixBanner}>
                  <AlertTriangle size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
                  <p className={styles.pixHint}>
                    Pagamento pendente. Seu pedido só é confirmado após o pagamento PIX.
                  </p>
                  <Button loading={payingPix} onClick={handleOpenPix}>
                    Pagar com PIX
                  </Button>
                </div>
              </section>
            )}

            {t.showPin && delivery?.pin && (
              <section className={styles.section}>
                <DeliveryPin pin={delivery.pin} />
              </section>
            )}

            {order.status === 'cancelado' && cancellation && (
              <section className={styles.section}>
                <CancellationStatus cancellation={cancellation} />
              </section>
            )}

            <section className={styles.section}>
              <OrderItemsSummary
                items={(order.products || []).map((p: any) => ({
                  name: p.productName,
                  quantity: p.quantity,
                  price: p.price,
                }))}
                subtotal={order.subtotal ?? 0}
                deliveryFee={order.deliveryFee ?? 0}
                discount={0}
                total={order.totalValue ?? 0}
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
              <section className={styles.section}>
                <RatingForm
                  title="Avaliar motoboy"
                  onSubmit={handleMotoboyRating}
                  submitting={submittingMotoboyRating}
                  submitted={!!delivery?.rating}
                />
              </section>
            )}

            {showStoreRating && (
              <section className={styles.section}>
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
                <section key={pid} className={styles.section}>
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
          </div>
        )}

        {/* Sheet de pagamento PIX: overlay que precisa aparecer sobre QUALQUER
            estado — inclusive carregando/não encontrado. Fica fora do guard de
            estado de propósito (lição do checkout: um EmptyState mascarando o
            ramo "com conteúdo" esconderia o sheet). */}
        {t.pixData && (
          <PixPaymentSheet
            pix={t.pixData}
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
