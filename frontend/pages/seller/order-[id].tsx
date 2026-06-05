import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import { useOrder } from '../../hooks/useSync';
import { useSocket } from '../../contexts/SocketContext';
import { OrderActionsCard } from '../../components/order/OrderActionsCard';
import { CancellationStatusDisplay } from '../../components/order/CancellationStatusDisplay';
import styles from './SellerOrder.module.css';

interface ReturnRequest {
  deliveryId: string;
  orderId: string;
  motoboyId: string;
  message: string;
  pinRequired: boolean;
  returnedAt: string;
}

export default function SellerOrderDetailPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { order, loading: orderLoading } = useOrder(id);
  const { on, emit, isConnected } = useSocket();

  // Delivery vem populado diretamente na resposta do getOrder (order.delivery)
  // Isso evita uma chamada extra de API e garante dados imediatos
  const [delivery, setDelivery] = useState<any>(null);
  const [pinInput, setPinInput] = useState('');
  const [msg, setMsg] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [returnRequest, setReturnRequest] = useState<ReturnRequest | null>(null);
  const [returnPin, setReturnPin] = useState('');
  const [returnLoading, setReturnLoading] = useState(false);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnSuccess, setReturnSuccess] = useState(false);

  // ── Inicializar delivery a partir do order.delivery (já populado pela API) ──
  useEffect(() => {
    if (order?.delivery) {
      setDelivery(order.delivery);
    }
  }, [order?.delivery]);

  // ── Entrar na sala store:{storeId} para receber eventos em tempo real ──
  useEffect(() => {
    if (!order?.storeId || !isConnected) return;
    emit('join', { room: `store:${order.storeId}`, storeId: order.storeId });
  }, [order?.storeId, emit, isConnected]);

  // ── Listener: motoboy solicita devolução ────────────────────
  useEffect(() => {
    const unsub = on('delivery:return_requested', (data: ReturnRequest) => {
      if (order && data.orderId?.toString() === order._id?.toString()) {
        setReturnRequest(data);
      }
    });
    return unsub;
  }, [on, order]);

  // ── Listener: atualização de delivery em tempo real ─────────
  useEffect(() => {
    const unsub = on('delivery:updated', (data: any) => {
      if (delivery && data._id?.toString() === delivery._id?.toString()) {
        setDelivery(data);
      }
    });
    return unsub;
  }, [on, delivery]);

  // ── Se delivery já está aguardando confirmação ao carregar ───
  useEffect(() => {
    if (delivery?.statusDevolucao === 'aguardando_confirmacao' && !returnRequest) {
      setReturnRequest({
        deliveryId: delivery._id,
        orderId: order?._id || '',
        motoboyId: '',
        message: 'O motoboy solicitou devolução do produto',
        pinRequired: true,
        returnedAt: new Date().toISOString(),
      });
    }
  }, [delivery?.statusDevolucao]);

  const liberarEntrega = async () => {
    if (!delivery) return;
    try {
      await api.post(`/deliveries/${delivery._id}/liberar`, { pin: pinInput });
      setMsg('Entrega liberada!');
    } catch (e: any) {
      setMsg(e?.response?.data?.error || 'Erro ao liberar entrega');
    }
  };

  const confirmarDevolucao = async () => {
    if (!delivery || !returnPin) return;
    setReturnLoading(true);
    setReturnError(null);
    try {
      await api.post(`/deliveries/${delivery._id}/confirm-return`, { pinDevolucao: returnPin });
      setReturnSuccess(true);
      setReturnRequest(null);
    } catch (e: any) {
      setReturnError(e?.response?.data?.error || 'Erro ao confirmar devolução');
    } finally {
      setReturnLoading(false);
    }
  };

  if (orderLoading) return <div className={styles.loadingState}><LoadingSkeleton variant="detail" /></div>;
  if (!order) return <div className={styles.notFoundState}>Pedido não encontrado</div>;

  const statusClass =
    order.status === 'criado'
      ? styles.metaStatusNew
      : order.status === 'pago'
      ? styles.metaStatusPaid
      : styles.metaStatusCancelled;

  const showReturnCard = returnRequest || delivery?.statusDevolucao === 'aguardando_confirmacao';

  return (
    <ProtectedRoute required_role="lojista">
      <div className={styles.page}>
        <div className={styles.container}>
          {/* Header */}
          <div className={styles.header}>
            <div className={styles.headerTop}>
              <h1 className={styles.pageTitle}>Detalhes do Pedido</h1>
              <button
                onClick={() => router.back()}
                className={styles.btnBack}
              >
                ← Voltar
              </button>
            </div>
            <div className={styles.headerMeta}>
              <div>
                <div className={styles.metaLabel}>ID do Pedido</div>
                <div className={styles.metaId}>{order._id}</div>
              </div>
              <div>
                <div className={styles.metaLabel}>Status</div>
                <div className={`${styles.metaStatus} ${statusClass}`}>
                  {order.status === 'criado' ? 'Novo Pedido' : order.status === 'pago' ? 'Aceito' : 'Cancelado'}
                </div>
              </div>
            </div>
          </div>

          <div className={styles.mainLayout}>
            {/* Main Content */}
            <div className={styles.mainColumn}>
              {/* AÇÕES: ACEITAR/REJEITAR PEDIDO */}
              {order.status === 'criado' && (
                <div className={styles.actionWrapper}>
                  <OrderActionsCard
                    orderId={order._id}
                    orderStatus={order.status}
                    onStatusChange={(newStatus) => {
                      setRefreshKey(k => k + 1);
                      setTimeout(() => router.replace(router.asPath), 500);
                    }}
                  />
                </div>
              )}

              {/* CARD: CONFIRMAR DEVOLUÇÃO DO MOTOBOY */}
              {showReturnCard && !returnSuccess && (
                <div className={styles.returnCard}>
                  <div className={styles.returnCardIcon}>[Pacote]</div>
                  <h3 className={styles.returnCardTitle}>Devolução Solicitada</h3>
                  <p className={styles.returnCardMsg}>
                    O motoboy está retornando o produto à sua loja. Quando ele chegar com o PIN, confirme o recebimento para liberar o próximo passo.
                  </p>
                  <div className={styles.pinInputGroup}>
                    <input
                      type="text"
                      inputMode="numeric"
                      value={returnPin}
                      onChange={e => setReturnPin(e.target.value)}
                      maxLength={6}
                      placeholder="PIN de devolução"
                      className={styles.pinInput}
                      disabled={returnLoading}
                    />
                    <button
                      onClick={confirmarDevolucao}
                      disabled={returnLoading || !returnPin}
                      className={`${styles.btnAction} ${styles.btnLiberar}`}
                    >
                      {returnLoading ? 'Confirmando...' : <><Icon name="check-circle" size={14} /> Confirmar Devolução</>}
                    </button>
                  </div>
                  {returnError && <div className={styles.returnError}>{returnError}</div>}
                </div>
              )}

              {returnSuccess && (
                <div className={styles.returnSuccess}>
                  Devolução confirmada com sucesso.
                </div>
              )}

              {/* STATUS DE CANCELAMENTO */}
              {(order.status === 'cancelado' || order.status === 'rejeitado') && (
                <div className={styles.actionWrapper}>
                  <CancellationStatusDisplay orderId={order._id} />
                </div>
              )}

              {/* PRODUTOS */}
              <div className={styles.infoCard}>
                <div className={styles.infoCardHeader}>
                  <p className={styles.infoCardTitle}><Icon name="package" size={14} /> Itens do Pedido</p>
                </div>
                <div style={{ padding: '16px 20px' }}>
                  {order.products && order.products.length > 0 ? (
                    <div className={styles.productsGrid}>
                      {order.products.map((p: any, idx: number) => (
                        <div key={p.productId || idx} className={styles.productItem}>
                          <div>
                            <div className={styles.productName}>{p.name || p.productName || 'Produto'}</div>
                            <div className={styles.productId}>ID: {p.productId || 'N/A'}</div>
                          </div>
                          <div className={styles.productQty}>×{p.quantity}</div>
                          <div className={styles.productTotal}>
                            R$ {(p.price * p.quantity).toFixed(2)}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.emptyProducts}>Nenhum item</div>
                  )}
                </div>
              </div>

              {/* TOTAIS */}
              <div className={styles.totalsCard}>
                <div className={styles.totalsGrid}>
                  <div className={styles.totalsRow}>
                    <span className={styles.totalsLabel}>Subtotal:</span>
                    <span className={styles.totalsValue}>
                      R$ {(order.subtotal || (order.products || []).reduce((sum: any, p: any) => sum + (p.price * p.quantity), 0)).toFixed(2)}
                    </span>
                  </div>
                  <div className={styles.totalsRow}>
                    <span className={styles.totalsLabel}>Taxa de Entrega:</span>
                    <span className={styles.totalsValue}>R$ {(order.deliveryFee || 0).toFixed(2)}</span>
                  </div>
                  <div className={styles.totalsRow}>
                    <span>Total:</span>
                    <span>R$ {(order.totalValue || 0).toFixed(2)}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sidebar */}
            <div className={styles.sidebar}>
              {/* INFO DO CLIENTE */}
              <div className={styles.infoCard}>
                <div className={styles.infoCardHeader}>
                  <p className={styles.infoCardTitle}><Icon name="user" size={14} /> Cliente</p>
                </div>
                <div className={styles.infoRow}>
                  <span className={styles.infoLabel}>Nome</span>
                  <span className={styles.infoValue}>{order.customerName || 'Cliente'}</span>
                </div>
                {order.customerId && (
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>ID</span>
                    <span className={styles.infoValueMono}>{order.customerId}</span>
                  </div>
                )}
              </div>

              {/* PIN DE ENTREGA */}
              {delivery && delivery.pin && (
                <div className={styles.pinCard}>
                  <h3 className={styles.pinCardTitle}><Icon name="lock" size={14} /> PIN de Entrega</h3>
                  <div className={styles.pinDisplay}>{delivery.pin}</div>
                  <div className={styles.pinHint}>
                    Compartilhe este código com o cliente para garantir a entrega.
                  </div>
                  <div className={styles.pinInputGroup}>
                    <input
                      value={pinInput}
                      onChange={e => setPinInput(e.target.value)}
                      maxLength={5}
                      placeholder="Digite o PIN"
                      className={styles.pinInput}
                    />
                    <button
                      onClick={liberarEntrega}
                      className={`${styles.btnAction} ${styles.btnLiberar}`}
                    >
                      <Icon name="check-circle" size={14} /> Liberar Entrega
                    </button>
                  </div>
                  {msg && <div className={styles.pinMsg}><Icon name="check-circle" size={14} /> {msg}</div>}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
