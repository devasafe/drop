import { useRouter } from 'next/router';
import { useState } from 'react';
import { AlertTriangle, PackageSearch } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import { Skeleton } from '../../components/ui/Skeleton';
import { EmptyState } from '../../components/ui/EmptyState';
import { Button } from '../../components/ui/Button';
import { ICON_STROKE_WIDTH } from '../../components/ui/Icon';
import { useToast } from '../../components/ui/Toast';
import { useOrderTracking } from '../../hooks/useOrderTracking';
import type { OrderTrackerStep } from '../../components/drop/OrderTracker';
import { OrderStatusHero } from '../../components/drop/order/OrderStatusHero';
import { OrderTimeline } from '../../components/drop/order/OrderTimeline';
import { DeliveryPin } from '../../components/drop/order/DeliveryPin';
import { OrderItemsSummary } from '../../components/drop/order/OrderItemsSummary';
import { OrderActions } from '../../components/drop/order/OrderActions';
import { RatingForm } from '../../components/drop/order/RatingForm';
import { PixPaymentSheet } from '../../components/drop/checkout/PixPaymentSheet';
import { CancelOrderModal } from '../../components/order/CancelOrderModal';
import { CancellationStatusDisplay } from '../../components/order/CancellationStatusDisplay';
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

  const [showCancelModal, setShowCancelModal] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [payingPix, setPayingPix] = useState(false);
  const [submittingMotoboyRating, setSubmittingMotoboyRating] = useState(false);
  const [submittingStoreRating, setSubmittingStoreRating] = useState(false);

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

  const order = t.order;
  const delivery = t.delivery;

  const showPixButton =
    !!order &&
    order.paymentMethod === 'pix' &&
    order.paymentStatus !== 'paid' &&
    !!order.asaasPaymentId &&
    !['cancelado', 'rejeitado'].includes(order.status);

  const canCancel = !!order && CANCELABLE_STATUSES.includes(order.status);

  const showMotoboyRating = delivery?.status === 'delivered' && !delivery.rating;
  const showStoreRating = order?.status === 'entregue' && !order.storeRating;

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

            {order.status === 'cancelado' && (
              <section className={styles.section}>
                <CancellationStatusDisplay orderId={order._id} />
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
              onCancel={() => setShowCancelModal(true)}
              onConfirmReceived={handleConfirmReceived}
            />

            {showMotoboyRating && (
              <section className={styles.section}>
                <RatingForm
                  title="Avaliar motoboy"
                  onSubmit={handleMotoboyRating}
                  submitting={submittingMotoboyRating}
                />
              </section>
            )}

            {showStoreRating && (
              <section className={styles.section}>
                <RatingForm
                  title="Avaliar loja"
                  onSubmit={handleStoreRating}
                  submitting={submittingStoreRating}
                />
              </section>
            )}

            <CancelOrderModal
              isOpen={showCancelModal}
              onClose={() => setShowCancelModal(false)}
              orderId={order._id}
              orderStatus={order.status}
              onSuccess={() => {
                setShowCancelModal(false);
                t.refetch();
              }}
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
