import { useRouter } from 'next/router';
import { useEffect, useState, useContext } from 'react';
import { useOrder } from '../../hooks/useSync';
import { CancellationStatusDisplay } from '../../components/order/CancellationStatusDisplay';
import Icon from '../../components/Icon';
import LoadingSkeleton from '../../components/LoadingSkeleton';
import AuthContext from '../../contexts/AuthContext';
import { useSocket } from '../../contexts/SocketContext';
import api from '../../lib/api';
import styles from '../OrderDetail.module.css';

interface PayoutInfo {
  _id: string;
  recipientType: 'store' | 'motoboy';
  recipientId: string;
  amount: number;
  status: string;
  createdAt: string;
  releasedAt?: string;
  paidAt?: string;
  blocked?: boolean;
  blockReason?: string;
  recipient?: { name?: string; id?: string } | null;
}

export default function OrderDetailPage() {
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { order, loading: orderLoading } = useOrder(id);
  const { user } = useContext(AuthContext);
  const { on } = useSocket();
  const [returnInitiated, setReturnInitiated] = useState(false);
  const [payouts, setPayouts] = useState<PayoutInfo[]>([]);
  const [payoutsLoading, setPayoutsLoading] = useState(false);

  const userRole = (user as any)?.activeRole || (user as any)?.role;
  const isAdmin = userRole === 'ceo' || userRole === 'admin';

  // Fetch payouts for this order (CEO only)
  useEffect(() => {
    if (!isAdmin || !id) return;
    const fetchPayouts = async () => {
      try {
        setPayoutsLoading(true);
        const res = await api.get(`/payouts/admin?orderId=${id}&limit=20`);
        setPayouts(res.data.payouts || []);
      } catch (err) {
        console.error('Erro ao buscar payouts:', err);
      } finally {
        setPayoutsLoading(false);
      }
    };
    fetchPayouts();
  }, [isAdmin, id]);

  // Listener: produto sendo devolvido pelo motoboy
  useEffect(() => {
    if (!order) return;
    const unsub = on('order:return_initiated', (data: any) => {
      if (data.orderId?.toString() === order._id?.toString()) {
        setReturnInitiated(true);
      }
    });
    return unsub;
  }, [on, order]);

  if (orderLoading) return (
    <div className={styles.loadingScreen}><LoadingSkeleton variant="detail" /></div>
  );

  if (!order) return (
    <div className={styles.loadingScreen}>
      <p style={{ color: 'rgba(255,255,255,0.6)' }}>Pedido nao encontrado</p>
    </div>
  );

  // --- Helpers ---
  const statusMap: Record<string, string> = {
    criado: 'Criado', pago: 'Pago', aguardando_motoboy: 'Aguardando Motoboy',
    enviado: 'Enviado', entregue: 'Entregue', cancelado: 'Cancelado', rejeitado: 'Rejeitado',
    pending: 'Pendente', assigned: 'Motoboy Atribuido', picked: 'Retirado', delivered: 'Entregue',
    cancelled: 'Cancelado',
  };
  const traduzStatus = (s: string) => statusMap[s?.toLowerCase()] || s || '-';

  const fmt = (d: string | undefined) => {
    if (!d) return '-';
    return new Date(d).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  };

  const fmtMoney = (v: number | undefined) => {
    if (v == null) return 'R$ 0,00';
    return `R$ ${v.toFixed(2)}`;
  };

  const statusColor = (s: string) => {
    switch (s) {
      case 'entregue': case 'delivered': case 'paid': case 'released': return '#22c55e';
      case 'cancelado': case 'cancelled': case 'rejeitado': return '#ef4444';
      case 'pago': case 'assigned': case 'picked': case 'requested': return '#3b82f6';
      case 'pending': case 'criado': case 'aguardando_motoboy': return '#f59e0b';
      default: return '#94a3b8';
    }
  };

  // Delivery from enriched order response
  const delivery = order.delivery;
  const storeName = order.storeObj?.name || order.storeName || '-';
  const storeAddr = order.storeObj?.address || order.storeAddress?.street || '-';
  const customerName = order.customerObj?.name || order.customerName || '-';
  const customerAddress = order.customerAddress || order.customerObj?.mainAddress || order.customerObj?.addresses?.[0];
  const customerAddr = customerAddress
    ? `${customerAddress.street || ''}, ${customerAddress.number || ''}, ${customerAddress.neighborhood || ''}, ${customerAddress.city || ''} - ${customerAddress.state || ''}`
    : '-';

  const storeLat = order.storeObj?.latitude || order.storeAddress?.latitude;
  const storeLng = order.storeObj?.longitude || order.storeAddress?.longitude;
  const customerLat = customerAddress?.latitude;
  const customerLng = customerAddress?.longitude;

  const googleMapsRoute = (storeLat && storeLng && customerLat && customerLng)
    ? `https://www.google.com/maps/dir/?api=1&origin=${storeLat},${storeLng}&destination=${customerLat},${customerLng}`
    : null;

  // Wallet distribution
  const wd = order.walletDistribution;

  // Payout helpers
  const storePayout = payouts.find(p => p.recipientType === 'store');
  const motoboyPayout = payouts.find(p => p.recipientType === 'motoboy');

  const payoutStatusLabel = (s: string) => {
    switch (s) {
      case 'pending': return 'Pendente';
      case 'released': return 'Disponivel';
      case 'requested': return 'Saque solicitado';
      case 'paid': return 'Pago';
      case 'cancelled': return 'Cancelado';
      default: return s;
    }
  };

  return (
    <div className={styles.page}>
      {/* Left panel — full order details */}
      <div className={styles.leftPanel}>
        <div className={styles.pageTitleRow}>
          <h1 className={styles.pageTitle}>Detalhes do Pedido</h1>
          <span className={styles.orderId}>#{order._id?.slice(-8)}</span>
        </div>

        {/* Status + Dates header */}
        <div className={styles.statusHeader}>
          <span className={styles.statusBadgeLg} style={{
            background: `${statusColor(delivery?.status || order.status)}20`,
            borderColor: `${statusColor(delivery?.status || order.status)}50`,
            color: statusColor(delivery?.status || order.status),
          }}>
            {traduzStatus(delivery?.status || order.status)}
          </span>
          <span className={styles.dateCreated}>Criado em {fmt(order.createdAt)}</span>
        </div>

        {/* ─── Informacoes gerais ─── */}
        <div className={styles.infoCard}>
          <div className={styles.infoCardHeader}>
            <h3 className={styles.infoCardTitle}>Informacoes</h3>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Loja</span>
            <span className={styles.infoValue}>{storeName}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Endereco da Loja</span>
            <span className={styles.infoValue}>{storeAddr}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Cliente</span>
            <span className={styles.infoValue}>{customerName}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Endereco Entrega</span>
            <span className={styles.infoValue}>{customerAddr}</span>
          </div>
          {order.deliveryDistance && (
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Distancia</span>
              <span className={styles.infoValue}>{order.deliveryDistance.toFixed(1)} km</span>
            </div>
          )}
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Pagamento</span>
            <span className={styles.infoValue}>{order.paymentMethod || '-'}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Status Pgto</span>
            <span className={styles.infoValue}>{order.paymentStatus || '-'}</span>
          </div>
        </div>

        {/* ─── Produtos ─── */}
        <div className={styles.infoCard}>
          <div className={styles.infoCardHeader}>
            <h3 className={styles.infoCardTitle}>Produtos</h3>
          </div>
          <div style={{ padding: '16px 20px' }}>
            <ul className={styles.productsList}>
              {order.products?.map((p: any, i: number) => (
                <li key={p.productId || i} className={styles.productItem}>
                  <span>{p.productName || p.name || 'Produto'}</span>
                  <span className={styles.productQty}>x{p.quantity}</span>
                  {p.price != null && (
                    <span className={styles.productPrice}>{fmtMoney(p.price * p.quantity)}</span>
                  )}
                </li>
              ))}
            </ul>
          </div>
        </div>

        {/* ─── Resumo Financeiro ─── */}
        <div className={styles.infoCard}>
          <div className={styles.infoCardHeader}>
            <h3 className={styles.infoCardTitle}>Resumo Financeiro</h3>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Subtotal</span>
            <span className={styles.infoValue}>{fmtMoney(order.subtotal)}</span>
          </div>
          <div className={styles.infoRow}>
            <span className={styles.infoLabel}>Taxa de Entrega</span>
            <span className={styles.infoValue}>{fmtMoney(delivery?.fee ?? order.deliveryFee)}</span>
          </div>
          <div className={styles.finTotalRow}>
            <span className={styles.finTotalLabel}>Total</span>
            <span className={styles.finTotalValue}>{fmtMoney(order.totalValue)}</span>
          </div>
          {wd && (
            <>
              <div className={styles.infoCardHeader} style={{ marginTop: 4 }}>
                <h3 className={styles.infoCardTitle}>Distribuicao</h3>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Loja recebe</span>
                <span className={styles.infoValue}>{fmtMoney(wd.storeAmount)}</span>
              </div>
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Comissao App (venda)</span>
                <span className={styles.infoValue}>
                  {fmtMoney(wd.appCommission)} ({wd.commissionPercent}%)
                </span>
              </div>
              {wd.delivery && (
                <>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Motoboy recebe</span>
                    <span className={styles.infoValue}>{fmtMoney(wd.delivery.motoboyAmount)}</span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Comissao App (entrega)</span>
                    <span className={styles.infoValue}>
                      {fmtMoney(wd.delivery.appCommission)} ({wd.delivery.commissionPercent}%)
                    </span>
                  </div>
                  <div className={styles.infoRow}>
                    <span className={styles.infoLabel}>Total Entrega</span>
                    <span className={styles.infoValue}>{fmtMoney(wd.delivery.total)}</span>
                  </div>
                </>
              )}
            </>
          )}
        </div>

        {/* ─── Timeline da Entrega ─── */}
        {delivery && (
          <div className={styles.infoCard}>
            <div className={styles.infoCardHeader}>
              <h3 className={styles.infoCardTitle}>Entrega</h3>
            </div>
            {delivery.motoboyName && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Motoboy</span>
                <span className={styles.infoValue}>{delivery.motoboyName}</span>
              </div>
            )}
            <div className={styles.infoRow}>
              <span className={styles.infoLabel}>Status</span>
              <span className={styles.statusBadge} style={{
                background: `${statusColor(delivery.status)}20`,
                borderColor: `${statusColor(delivery.status)}50`,
                color: statusColor(delivery.status),
              }}>
                {traduzStatus(delivery.status)}
              </span>
            </div>
            <div className={styles.timeline}>
              <TimelineStep label="Pedido Criado" date={fmt(order.createdAt)} active />
              {order.acceptedAt && (
                <TimelineStep label="Aceito pela Loja" date={fmt(order.acceptedAt)} active />
              )}
              <TimelineStep
                label="Motoboy Atribuido"
                date={fmt(delivery.assignedAt || delivery.createdAt)}
                active={['assigned', 'picked', 'delivered'].includes(delivery.status)}
              />
              <TimelineStep
                label="Retirado na Loja"
                date={fmt(delivery.pickedAt)}
                active={['picked', 'delivered'].includes(delivery.status)}
              />
              <TimelineStep
                label="Entregue ao Cliente"
                date={fmt(delivery.deliveredAt)}
                active={delivery.status === 'delivered'}
              />
              {delivery.cancelledAt && (
                <TimelineStep label="Cancelado" date={fmt(delivery.cancelledAt)} active danger />
              )}
            </div>
            {delivery.pin && (
              <div className={styles.pinRow}>
                <span className={styles.pinLabel}>PIN Entrega</span>
                <span className={styles.pinValue}>{delivery.pin}</span>
              </div>
            )}
            {delivery.pinRetirada && (
              <div className={styles.pinRow}>
                <span className={styles.pinLabel}>PIN Retirada</span>
                <span className={styles.pinValue}>{delivery.pinRetirada}</span>
              </div>
            )}
            {delivery.rating && (
              <div className={styles.infoRow}>
                <span className={styles.infoLabel}>Avaliacao</span>
                <span className={styles.infoValue}>{delivery.rating}/5 {delivery.comment ? `— ${delivery.comment}` : ''}</span>
              </div>
            )}
          </div>
        )}

        {/* ─── Fluxo do Dinheiro (CEO only) ─── */}
        {isAdmin && (
          <div className={styles.infoCard}>
            <div className={styles.infoCardHeader}>
              <h3 className={styles.infoCardTitle}>Fluxo do Dinheiro</h3>
            </div>
            {payoutsLoading ? (
              <div style={{ padding: '20px', color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>Carregando payouts...</div>
            ) : payouts.length === 0 ? (
              <div style={{ padding: '20px', color: 'rgba(255,255,255,0.4)', fontSize: 13 }}>Nenhum payout encontrado para este pedido</div>
            ) : (
              <div className={styles.moneyFlow}>
                {/* Origin */}
                <div className={styles.flowSection}>
                  <div className={styles.flowSectionTitle}>Origem</div>
                  <div className={styles.flowCard}>
                    <div className={styles.flowIcon} style={{ background: 'rgba(59,130,246,0.15)', color: '#60a5fa' }}>$</div>
                    <div className={styles.flowInfo}>
                      <div className={styles.flowName}>{customerName}</div>
                      <div className={styles.flowDesc}>Pagou {fmtMoney(order.totalValue)} via {order.paymentMethod || 'carteira'}</div>
                    </div>
                  </div>
                </div>

                <div className={styles.flowArrow}>|</div>

                {/* Store payout */}
                {storePayout && (
                  <div className={styles.flowSection}>
                    <div className={styles.flowSectionTitle}>Repasse da Venda (Loja)</div>
                    <div className={styles.flowCard}>
                      <div className={styles.flowIcon} style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}>L</div>
                      <div className={styles.flowInfo}>
                        <div className={styles.flowName}>{storePayout.recipient?.name || storeName}</div>
                        <div className={styles.flowAmount}>{fmtMoney(storePayout.amount)}</div>
                        <div className={styles.flowStatusRow}>
                          <span className={styles.flowStatusBadge} style={{
                            background: `${statusColor(storePayout.status)}20`,
                            color: statusColor(storePayout.status),
                          }}>
                            {payoutStatusLabel(storePayout.status)}
                          </span>
                          {storePayout.blocked && <span className={styles.flowBlocked}>Bloqueado</span>}
                        </div>
                        {storePayout.releasedAt && <div className={styles.flowDate}>Liberado: {fmt(storePayout.releasedAt)}</div>}
                        {storePayout.paidAt && <div className={styles.flowDate}>Pago: {fmt(storePayout.paidAt)}</div>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Motoboy payout */}
                {motoboyPayout && (
                  <div className={styles.flowSection}>
                    <div className={styles.flowSectionTitle}>Repasse da Entrega (Motoboy)</div>
                    <div className={styles.flowCard}>
                      <div className={styles.flowIcon} style={{ background: 'rgba(251,191,36,0.15)', color: '#fbbf24' }}>M</div>
                      <div className={styles.flowInfo}>
                        <div className={styles.flowName}>{motoboyPayout.recipient?.name || delivery?.motoboyName || 'Motoboy'}</div>
                        <div className={styles.flowAmount}>{fmtMoney(motoboyPayout.amount)}</div>
                        <div className={styles.flowStatusRow}>
                          <span className={styles.flowStatusBadge} style={{
                            background: `${statusColor(motoboyPayout.status)}20`,
                            color: statusColor(motoboyPayout.status),
                          }}>
                            {payoutStatusLabel(motoboyPayout.status)}
                          </span>
                          {motoboyPayout.blocked && <span className={styles.flowBlocked}>Bloqueado</span>}
                        </div>
                        {motoboyPayout.releasedAt && <div className={styles.flowDate}>Liberado: {fmt(motoboyPayout.releasedAt)}</div>}
                        {motoboyPayout.paidAt && <div className={styles.flowDate}>Pago: {fmt(motoboyPayout.paidAt)}</div>}
                      </div>
                    </div>
                  </div>
                )}

                {/* Platform commission */}
                {wd && (
                  <div className={styles.flowSection}>
                    <div className={styles.flowSectionTitle}>Comissao da Plataforma</div>
                    <div className={styles.flowCard}>
                      <div className={styles.flowIcon} style={{ background: 'rgba(139,92,246,0.15)', color: '#a78bfa' }}>P</div>
                      <div className={styles.flowInfo}>
                        <div className={styles.flowName}>DROP</div>
                        <div className={styles.flowAmount}>
                          {fmtMoney((wd.appCommission || 0) + (wd.delivery?.appCommission || 0))}
                        </div>
                        <div className={styles.flowDesc}>
                          Venda: {fmtMoney(wd.appCommission)} ({wd.commissionPercent}%)
                          {wd.delivery ? ` + Entrega: ${fmtMoney(wd.delivery.appCommission)} (${wd.delivery.commissionPercent}%)` : ''}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Map */}
        {googleMapsRoute && (
          <div className={styles.mapSection}>
            <a href={googleMapsRoute} target="_blank" rel="noopener noreferrer" className={styles.mapLink}>
              Ver rota no Google Maps
            </a>
          </div>
        )}

        {/* Banner: produto sendo devolvido */}
        {returnInitiated && order.status !== 'cancelado' && (
          <div className={styles.returnBanner}>
            <Icon name="package" size={16} /> Seu produto esta sendo devolvido a loja. Voce sera reembolsado assim que a devolucao for confirmada.
          </div>
        )}

        {/* Cancellation status */}
        {(order.status === 'cancelado' || order.status === 'rejeitado') && (
          <div className={styles.cancellationBox}>
            <CancellationStatusDisplay orderId={order._id} />
          </div>
        )}

      </div>

    </div>
  );
}

// Timeline step component
function TimelineStep({ label, date, active, danger }: { label: string; date: string; active?: boolean; danger?: boolean }) {
  return (
    <div className={styles.timelineStep}>
      <div
        className={styles.timelineDot}
        style={{
          background: danger ? '#ef4444' : active ? '#22c55e' : 'rgba(255,255,255,0.15)',
          boxShadow: active ? `0 0 8px ${danger ? 'rgba(239,68,68,0.4)' : 'rgba(34,197,94,0.4)'}` : 'none',
        }}
      />
      <div className={styles.timelineContent}>
        <span className={styles.timelineLabel} style={{ color: active ? 'rgba(255,255,255,0.9)' : 'rgba(255,255,255,0.4)' }}>
          {label}
        </span>
        <span className={styles.timelineDate}>{date}</span>
      </div>
    </div>
  );
}
