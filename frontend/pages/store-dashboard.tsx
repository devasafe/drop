import { useEffect, useState, useContext, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
import { RouteThumbnail } from '../components/map/RouteThumbnail';
import { parseCoords } from '../lib/geo';
import AuthContext from '../contexts/AuthContext';
import { connectSocket, getSocket } from '../lib/socket';
import ProtectedRoute from '../components/ProtectedRoute';
import Icon from '../components/Icon';
import LoadingSkeleton from '../components/LoadingSkeleton';
import { useCancellation } from '../hooks/useCancellation';
import { useSocketListener } from '../hooks/useAutoRefetch';
import ChatConversationList from '../components/ChatConversationList';
import ChatConversationDetail from '../components/ChatConversationDetail';
import StoreBannerUpload from '../components/StoreBannerUpload';
import OperatingHoursEditor from '../components/OperatingHoursEditor';
import styles from './StoreDashboard.module.css';
import OnboardingResumeBanner from '../components/OnboardingResumeBanner';
import OverviewTab from '../components/seller/OverviewTab';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Chip } from '../components/ui/Chip';
import { EmptyState } from '../components/ui/EmptyState';
import { Sheet } from '../components/ui/Sheet';
import { Section } from '../components/ui/Section';
import { List, Row } from '../components/ui/List';
import { Card } from '../components/ui/Card';
import Modal from '../components/common/Modal';

function DetalhesPedidoModal({ order, onClose, token }: { order: any, onClose: () => void, token?: string }) {
  const router = useRouter();
  const { user } = useContext(AuthContext);
  const [changingPayment, setChangingPayment] = useState(false);
  const [selectedPaymentStatus, setSelectedPaymentStatus] = useState(order?.paymentStatus || 'pending');
  const [showChat, setShowChat] = useState(false);
  const [chatConvId, setChatConvId] = useState<string | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  const customerId = order?.customerId || order?.customerObj?._id;

  // Abre (ou cria) a conversa loja↔cliente deste pedido e exibe o chat real.
  // Antes o chat não abria porque nenhuma conversa era criada/obtida no backend.
  const handleToggleChat = async () => {
    if (showChat) { setShowChat(false); return; }
    if (chatConvId) { setShowChat(true); return; }
    if (!customerId) { alert('Comprador não identificado neste pedido.'); return; }
    try {
      setChatLoading(true);
      const res = await api.post('/chat/conversations', {
        type: 'loja_cliente',
        otherParticipantId: customerId,
        orderId: order._id,
      });
      const convId = res.data?._id || res.data?.conversationId;
      if (!convId) throw new Error('Conversa não retornada pelo servidor');
      setChatConvId(convId);
      setShowChat(true);
    } catch (err: any) {
      alert('Erro ao abrir chat: ' + (err.response?.data?.error || err.message));
    } finally {
      setChatLoading(false);
    }
  };

  if (!order) return null;

  const handleClickName = (id: string, type: 'customer' | 'store' | 'motoboy') => {
    if (type === 'customer') {
      router.push(`/user/${id}`);
    } else if (type === 'store') {
      router.push(`/store/${id}`);
    } else if (type === 'motoboy') {
      router.push(`/motoboy/${id}`);
    }
    onClose();
  };

  const handleUpdatePaymentStatus = async () => {
    try {
      setChangingPayment(true);
      await api.put('/orders/payment-status/update', {
        orderId: order._id,
        paymentStatus: selectedPaymentStatus
      });
      // Atualizar o objeto order localmente
      order.paymentStatus = selectedPaymentStatus;
      setChangingPayment(false);
      alert('Status de pagamento alterado com sucesso!');
    } catch (err: any) {
      setChangingPayment(false);
      alert('Erro ao alterar status: ' + (err.response?.data?.error || err.message));
    }
  };

  // Tom semântico do status (não mais hex por status — mapeado a tokens de cor).
  const getStatusTone = (status: string) => {
    const toneMap: Record<string, string> = {
      entregue: styles.statusSuccess,
      delivered: styles.statusSuccess,
      enviado: styles.statusWarning,
      shipped: styles.statusWarning,
      pago: styles.statusInfo,
      paid: styles.statusInfo,
      criado: styles.statusNeutral,
      created: styles.statusNeutral,
      cancelado: styles.statusDanger,
      cancelled: styles.statusDanger,
      rejeitado: styles.statusDanger,
      aguardando_motoboy: styles.statusWarning,
      assigned: styles.statusInfo,
      picked: styles.statusInfo,
    };
    return toneMap[status] || styles.statusNeutral;
  };

  const statusLabel =
    order.status === 'entregue' || order.status === 'delivered' ? '✓ Entregue' :
    order.status === 'enviado' || order.status === 'shipped' ? 'Enviado' :
    order.status === 'pago' || order.status === 'paid' ? 'Pago' :
    order.status === 'criado' || order.status === 'created' ? 'Criado' :
    order.status === 'cancelado' || order.status === 'cancelled' ? 'Cancelado' :
    order.status === 'rejeitado' ? 'Rejeitado' :
    order.status === 'aguardando_motoboy' ? 'Aguardando' :
    order.status === 'assigned' ? 'Atribuído' :
    order.status === 'picked' ? 'Retirado' : order.status;

  return (
    <Modal
      isOpen
      onClose={onClose}
      title={`Pedido #${order._id.slice(0, 8).toUpperCase()}`}
      size="lg"
    >
      <div className={styles.modalContent}>
        {/* STATUS + DATA */}
        <div className={styles.statusRow}>
          <span className={`${styles.statusPill} ${getStatusTone(order.status)}`}>{statusLabel}</span>
          <span className={styles.statusDate}>
            {order.createdAt && new Date(order.createdAt).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
          </span>
        </div>

        <div className={styles.divider} />

        {/* Comprador, Loja, Motoboy, Método */}
        <div className={styles.infoRows}>
          <div className={styles.infoRow}>
            <span className={styles.infoRowLabel}><Icon name="user" size={12} /> Comprador</span>
            <div className={styles.infoRowValue}>
              <button
                onClick={() => handleClickName(order.customerId || order.customerObj?._id, 'customer')}
                className={styles.linkValue}
              >
                {order.customerName || 'Cliente'}
              </button>
              <span className={styles.infoValueSub}>{(order.customerId || order.customerObj?._id || '').toString().slice(0, 8)}...</span>
            </div>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.infoRowLabel}><Icon name="store" size={12} /> Loja</span>
            <div className={styles.infoRowValue}>
              <button
                onClick={() => handleClickName(order.storeId || order.storeObj?._id, 'store')}
                className={styles.linkValue}
              >
                {order.storeName || 'Loja'}
              </button>
              <span className={styles.infoValueSub}>{(order.storeId || order.storeObj?._id || '').toString().slice(0, 8)}...</span>
            </div>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.infoRowLabel}><Icon name="motorcycle" size={12} /> Motoboy</span>
            <div className={styles.infoRowValue}>
              {order.delivery?.motoboyName ? (
                <button
                  onClick={() => handleClickName(typeof order.delivery.motoboyId === 'object' ? order.delivery.motoboyId._id : order.delivery.motoboyId, 'motoboy')}
                  className={styles.linkValue}
                >
                  {order.delivery.motoboyName}
                </button>
              ) : (
                <span className={styles.infoValueText}>Aguardando</span>
              )}
              {order.delivery?.motoboyId && (
                <span className={styles.infoValueSub}>
                  {(typeof order.delivery.motoboyId === 'object' ? order.delivery.motoboyId._id : order.delivery.motoboyId).toString().slice(0, 8)}...
                </span>
              )}
            </div>
          </div>

          <div className={styles.infoRow}>
            <span className={styles.infoRowLabel}><Icon name="credit-card" size={12} /> Pagamento</span>
            <div className={styles.infoRowValue}>
              <span className={styles.infoValueText}>
                {order.paymentMethod === 'credit_card' ? 'Cartão' :
                 order.paymentMethod === 'debit_card' ? 'Débito' :
                 order.paymentMethod === 'pix' ? 'PIX' :
                 order.paymentMethod === 'money' ? 'Dinheiro' :
                 order.paymentMethod || '---'}
              </span>
              <span className={styles.infoValueSub}>
                Status: {order.paymentStatus === 'paid' ? '✓ Pago' : order.paymentStatus === 'pending' ? 'Pendente' : order.paymentStatus || '---'}
              </span>
            </div>
          </div>
        </div>

        {/* PRODUTOS */}
        {order.products && order.products.length > 0 && (
          <>
            <div className={styles.divider} />
            <div>
              <div className={styles.sectionTitle}><Icon name="package" size={12} /> Itens do Pedido ({order.products.length})</div>
              <div className={styles.productsList}>
                {order.products.map((item: any, idx: number) => (
                  <div key={idx} className={styles.productRow}>
                    <div>
                      <span className={styles.productQty}>{item.quantity}x</span>{' '}
                      <span>{item.productName || 'Produto'}</span>
                    </div>
                    <div className={styles.productTotal}>R$ {(item.price * item.quantity).toFixed(2)}</div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}

        <div className={styles.divider} />

        {/* DETALHES FINANCEIROS */}
        <div className={styles.financialRows}>
          <div className={styles.financialRow}>
            <span className={styles.financialLabel}><Icon name="wallet" size={12} /> Você recebe <span className={styles.financialHint}>(produto − taxa)</span></span>
            <span className={`${styles.financialValue} ${styles.financialSuccess}`}>
              R$ {(order.walletDistribution?.storeAmount || (((order.totalValue || 0) - (order.deliveryFee || 0)) * 0.9)).toFixed(2)}
            </span>
          </div>
          <div className={styles.financialRow}>
            <span className={styles.financialLabel}><Icon name="building" size={12} /> Taxa app <span className={styles.financialHint}>(comissão)</span></span>
            <span className={`${styles.financialValue} ${styles.financialBrand}`}>
              R$ {(order.walletDistribution?.appCommission || (((order.totalValue || 0) - (order.deliveryFee || 0)) * 0.1)).toFixed(2)}
            </span>
          </div>
          <div className={styles.financialRow}>
            <span className={styles.financialLabel}><Icon name="package" size={12} /> Subtotal <span className={styles.financialHint}>(produtos)</span></span>
            <span className={`${styles.financialValue} ${styles.financialMuted}`}>
              R$ {((order.totalValue || 0) - (order.deliveryFee || 0)).toFixed(2)}
            </span>
          </div>
          <div className={styles.financialRow}>
            <span className={styles.financialLabel}><Icon name="truck" size={12} /> Entrega <span className={styles.financialHint}>(taxa)</span></span>
            <span className={`${styles.financialValue} ${styles.financialWarning}`}>
              R$ {(order.deliveryFee || 0).toFixed(2)}
            </span>
          </div>
          <div className={styles.financialRow}>
            <span className={styles.financialLabel}><Icon name="credit-card" size={12} /> Total <span className={styles.financialHint}>(cliente)</span></span>
            <span className={`${styles.financialValue} ${styles.financialInfo}`}>
              R$ {order.totalValue?.toFixed(2) || '0.00'}
            </span>
          </div>
        </div>

        {/* STATUS DE PAGAMENTO - LOJISTA PODE ALTERAR */}
        {user?.activeRole === 'lojista' && (
          <div className={styles.paymentStatusSection}>
            <div className={styles.sectionTitle}>
              <Icon name="credit-card" size={12} /> Status de Pagamento (Temporário)
            </div>
            <div className={styles.paymentStatusRow}>
              <Select
                value={selectedPaymentStatus}
                onChange={setSelectedPaymentStatus}
                options={[
                  { value: 'pending', label: 'Pendente' },
                  { value: 'paid', label: '✓ Pago' },
                  { value: 'failed', label: 'Falhou' },
                  { value: 'refunded', label: 'Reembolsado' },
                ]}
              />
              <Button onClick={handleUpdatePaymentStatus} loading={changingPayment}>
                Atualizar
              </Button>
            </div>
            <div className={styles.paymentStatusNote}>
              Status atual: <strong>{selectedPaymentStatus === 'paid' ? '✓ Pago' : selectedPaymentStatus === 'pending' ? 'Pendente' : selectedPaymentStatus}</strong>
            </div>
          </div>
        )}

        {/* SEÇÃO DE CHAT */}
        {showChat && chatConvId ? (
          <>
            <div className={styles.divider} />
            <div className={styles.chatBox}>
              <div className={styles.sectionTitle}><Icon name="chat" size={12} /> Chat com Cliente</div>
              <div className={styles.chatFrame}>
                <ChatConversationDetail
                  conversationId={chatConvId}
                  currentUserId={user?._id}
                  otherParticipantId={customerId}
                  otherParticipantName={order.customerName || 'Cliente'}
                  onBack={() => setShowChat(false)}
                />
              </div>
            </div>
          </>
        ) : null}

        <div className={styles.divider} />

        {/* BOTÕES DE AÇÃO */}
        <div className={styles.actionBtns}>
          <Button
            variant={showChat ? 'ghost' : 'primary'}
            leftIcon={<Icon name={showChat ? 'x-circle' : 'chat'} size={14} />}
            onClick={handleToggleChat}
            loading={chatLoading}
          >
            {showChat ? 'Fechar Chat' : 'Abrir Chat'}
          </Button>

          <Button variant="ghost" onClick={onClose}>
            Fechar
          </Button>
        </div>
      </div>
    </Modal>
  );
}


export default function StoreDashboard() {
  const router = useRouter();
  const { user, token } = useContext(AuthContext);
  const [store, setStore] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  // Deep-link da AppSidebar (?tab=orders) — sincroniza a aba ativa com a querystring.
  useEffect(() => {
    // Espera a query hidratar (evita flash na carga direta de ?tab=X). Sem tab na
    // URL = volta pra 'overview' — senão a view ficava travada na última aba ao
    // clicar em "Visão geral" (URL muda, mas o conteúdo não acompanhava).
    if (!router.isReady) return;
    const t = router.query.tab;
    setActiveTab(typeof t === 'string' ? t : 'overview');
  }, [router.isReady, router.query.tab]);

  const [pinInputs, setPinInputs] = useState<{[id:string]:string}>({});
  const [pinStatuses, setPinStatuses] = useState<{[id:string]:string}>({});
  const pollingRef = useRef<any>(null);
  const [showNotif, setShowNotif] = useState(false);
  const [newOrderIds, setNewOrderIds] = useState<string[]>([]);
  const [detalhesPedido, setDetalhesPedido] = useState<any>(null);
  const [rejectModalOrderId, setRejectModalOrderId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState<string>('store_closed');
  const [rejectCustomReason, setRejectCustomReason] = useState<string>('');
  const [rejectLoading, setRejectLoading] = useState(false);

  // ✅ FIX #6: Estados para devolução com PIN
  const [returnRequests, setReturnRequests] = useState<any[]>([]);
  const [returnPinInputs, setReturnPinInputs] = useState<{[deliveryId: string]: string}>({});

  // 🆕 Estados para Chat Pré-Compra
  const [selectedConversationId, setSelectedConversationId] = useState<string | null>(null);
  const [selectedConversation, setSelectedConversation] = useState<any>(null);
  const [chatFilter, setChatFilter] = useState<'all' | 'product' | 'user'>('all');

  // 🔍 Estados para filtros de histórico
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterCustomer, setFilterCustomer] = useState<string>('');
  const [filterDateFrom, setFilterDateFrom] = useState<string>('');
  const [filterDateTo, setFilterDateTo] = useState<string>('');
  const [filterMinValue, setFilterMinValue] = useState<string>('');
  const [filterMaxValue, setFilterMaxValue] = useState<string>('');
  const [filterCategory, setFilterCategory] = useState<string>('');
  const [filterProductName, setFilterProductName] = useState<string>('');
  const [storeCategories, setStoreCategories] = useState<string[]>([]);
  const [historyLimit, setHistoryLimit] = useState(10);
  // Painel de filtros do histórico recolhido por padrão (Task 6 — DS flat)
  const [filtersOpen, setFiltersOpen] = useState(false);


  const { acceptOrder, rejectOrder } = useCancellation();

  // 🔄 Auto-refetch quando socket events chegam
  const handleOrderUpdate = useCallback(async () => {
    try {
      const res = await api.get('/stores/dashboard');
      setOrders(res.data.orders || []);
    } catch (err) {
      console.error('Erro ao refetch orders:', err);
    }
  }, []);

  // Refetch completo após mudanças de status
  const handleOrderStatusRefetch = useCallback(async () => {
    try {
      const r = await api.get('/stores/dashboard');
      setOrders(r.data.orders || []);
      setHistoryOrders(r.data.history || []);
    } catch (e: any) {
      console.error('[SOCKET] Erro ao refetch após status change:', e?.message);
    }
  }, []);

  const handleNewOrder = useCallback(async () => {
    try {
      const r = await api.get('/stores/dashboard');
      const incoming = r.data.orders || [];
      setOrders(incoming);
      if (incoming.length > 0) {
        const newest = incoming[0];
        setShowNotif(true);
        setNewOrderIds(prev => [...prev, newest._id]);
      }
    } catch (e: any) {
      console.error('[SOCKET] Erro ao atualizar pedidos:', e?.message);
    }
  }, []);

  // Escutar tanto 'new_order' (room-specific) quanto 'order:created' (broadcast global)
  useSocketListener('new_order', handleNewOrder);
  useSocketListener('order:created', handleNewOrder);

  useSocketListener('motoboy:assigned_to_order', useCallback(async (data: any) => {
    try {
      console.log('🏍️ [SOCKET] Motoboy atribuído:', data);
      const r = await api.get('/stores/dashboard');
      setOrders(r.data.orders || []);
    } catch (e: any) {
      console.error('[SOCKET] ❌ Erro motoboy:assigned_to_order:', e?.message);
    }
  }, []));

  useSocketListener('order_update', handleOrderStatusRefetch);
  useSocketListener('order:updated', handleOrderStatusRefetch);
  useSocketListener('order:status_changed', handleOrderStatusRefetch);
  useSocketListener('order:picked_up', handleOrderStatusRefetch);
  useSocketListener('order:rejected_by_store', handleOrderStatusRefetch);
  useSocketListener('delivery:completed', handleOrderStatusRefetch);
  useSocketListener('delivery:cancelled', handleOrderStatusRefetch);
  useSocketListener('delivery:assigned', handleOrderStatusRefetch);

  useSocketListener('order:accepted_confirmation', useCallback((data: any) => {
    if (!data?.orderId) return;
    setOrders(prev => prev.map(o =>
      o._id === data.orderId ? { ...o, status: data.status || 'aguardando_motoboy' } : o
    ));
  }, []));

  useSocketListener('order:cancelled', useCallback((data: any) => {
    const orderId = data?.orderId;
    if (!orderId) return;
    setOrders(prev => {
      const cancelled = prev.find(o => o._id === orderId || o._id === orderId?.toString());
      if (cancelled) {
        setHistoryOrders(h => (h.some(o => o._id === cancelled._id) ? h : [{ ...cancelled, status: 'cancelado' }, ...h]));
      }
      return prev.filter(o => o._id !== orderId && o._id !== orderId?.toString());
    });
    setReturnRequests(prev => prev.filter(r => r.orderId !== orderId && r.orderId !== orderId?.toString()));
  }, []));

  useSocketListener('delivery:return_requested', useCallback((data: any) => {
    console.log('🚚 [SOCKET] Devolução solicitada:', data);
    if (data?.deliveryId && data?.orderId) {
      setReturnRequests(prev => {
        const exists = prev.some(r => r.deliveryId === data.deliveryId);
        if (exists) return prev.map(r => r.deliveryId === data.deliveryId ? data : r);
        return [data, ...prev];
      });
      router.push('/seller/dashboard?tab=returns');
    } else {
      console.error('[SOCKET] ❌ Data inválida - faltam deliveryId ou orderId', data);
    }
  }, []));

  function getStatusBadgeInfo(status: string) {
    // Cada status mapeia para uma classe modificadora do badge (tokens
    // semânticos), no lugar da cor hex fixa — mesma granularidade de antes,
    // só a expressão visual muda (Task 6 — DS flat).
    const statusMap: any = {
      pago: { label: 'Pago', className: styles.statusInfo },
      criado: { label: 'Criado', className: styles.statusNeutral },
      aguardando_motoboy: { label: 'Aguardando Motoboy', className: styles.statusWarn },
      entregue: { label: '✓ Entregue', className: styles.statusSuccess },
      delivered: { label: '✓ Entregue', className: styles.statusSuccess },
      cancelado: { label: 'Cancelado', className: styles.statusDanger },
      cancelled: { label: 'Cancelado', className: styles.statusDanger },
      rejeitado: { label: 'Rejeitado', className: styles.statusDanger },
    };
    return statusMap[status] || { label: status.toUpperCase(), className: styles.statusNeutral };
  }

  // 🔍 Conta quantos dos 8 filtros de histórico estão ativos (mesma condição
  // usada para exibir "Limpar Filtros"; também alimenta o indicador "N ativos"
  // do painel recolhido — Task 6, apresentação apenas).
  const getActiveFilterCount = () => {
    return [
      filterStatus, filterCustomer, filterDateFrom, filterDateTo,
      filterMinValue, filterMaxValue, filterCategory, filterProductName,
    ].filter(Boolean).length;
  };

  // Volta a exibir 10 ao mudar qualquer filtro do histórico
  useEffect(() => { setHistoryLimit(10); }, [filterStatus, filterCustomer, filterDateFrom, filterDateTo, filterMinValue, filterMaxValue, filterCategory, filterProductName]);

  // 🔍 Função para filtrar histórico de pedidos
  const getFilteredHistoryOrders = () => {
    return historyOrders.filter(order => {
      // Filtro por status
      if (filterStatus && order.status !== filterStatus) {
        return false;
      }

      // Filtro por cliente (busca parcial)
      if (filterCustomer && !order.customerName?.toLowerCase().includes(filterCustomer.toLowerCase())) {
        return false;
      }

      // Filtro por data (intervalo)
      if (filterDateFrom || filterDateTo) {
        const orderDate = new Date(order.createdAt);
        if (filterDateFrom) {
          const fromDate = new Date(filterDateFrom);
          if (orderDate < fromDate) return false;
        }
        if (filterDateTo) {
          const toDate = new Date(filterDateTo);
          toDate.setHours(23, 59, 59, 999); // Incluir todo o dia
          if (orderDate > toDate) return false;
        }
      }

      // Filtro por valor recebido (you receive)
      if (filterMinValue || filterMaxValue) {
        const storeAmount = order.walletDistribution?.storeAmount ||
          (((order.totalValue || 0) - (order.deliveryFee || 0)) * 0.9);

        if (filterMinValue && storeAmount < parseFloat(filterMinValue)) {
          return false;
        }
        if (filterMaxValue && storeAmount > parseFloat(filterMaxValue)) {
          return false;
        }
      }

      // Filtro por categoria de produtos
      if (filterCategory) {
        const hasCategory = order.products?.some((product: any) =>
          product.category?.toLowerCase() === filterCategory.toLowerCase()
        );
        if (!hasCategory) return false;
      }

      // Filtro por nome de produto
      if (filterProductName) {
        const hasProduct = order.products?.some((product: any) =>
          product.productName?.toLowerCase().includes(filterProductName.toLowerCase())
        );
        if (!hasProduct) return false;
      }

      return true;
    });
  };

  const handleAcceptOrder = async (orderId: string) => {
    if (window.confirm('Tem certeza que deseja aceitar este pedido?')) {
      const order = orders.find(o => o._id === orderId);
      const distance = order?.deliveryDistance || 0;

      const result = await acceptOrder(orderId, distance);
      if (result.success) {
        // [Plan1] Se requiresDelivery === false: status fica 'pago' (sem motoboy)
        // [Plan2/3] Se requiresDelivery !== false: status vai para 'aguardando_motoboy'
        const isPlan1 = result.data?.requiresDelivery === false;
        setOrders(prev => prev.map(o =>
          o._id === orderId
            ? { ...o, status: isPlan1 ? 'pago' : 'aguardando_motoboy' }
            : o
        ));
      } else {
        alert(`Erro: ${result.error}`);
      }
    }
  };

  const handleRejectOrder = async () => {
    if (!rejectModalOrderId) return;

    let reason = '';
    const REJECTION_REASONS = [
      { code: 'store_closed', label: 'Loja fechada', description: 'Loja está fechada no momento' },
      { code: 'store_busy', label: 'Loja muito ocupada', description: 'Muitos pedidos para processar' },
      { code: 'not_available', label: 'Itens indisponíveis', description: 'Item fora de estoque' },
      { code: 'payment_issue', label: 'Problema de pagamento', description: 'Problema com o pagamento' },
      { code: 'other', label: 'Outro motivo', description: 'Especifique abaixo' },
    ];

    if (rejectReason === 'other') {
      reason = rejectCustomReason;
    } else {
      const selectedOption = REJECTION_REASONS.find(r => r.code === rejectReason);
      reason = selectedOption ? selectedOption.description : rejectReason;
    }

    if (!reason.trim()) {
      alert('Por favor, especifique um motivo');
      return;
    }

    setRejectLoading(true);
    const result = await rejectOrder(rejectModalOrderId, reason, rejectReason);
    setRejectLoading(false);

    if (result.success) {
      setOrders(prev => prev.filter(o => o._id !== rejectModalOrderId));
      setRejectModalOrderId(null);
      setRejectReason('store_closed');
      setRejectCustomReason('');
    } else {
      alert(`Erro ao rejeitar: ${result.error}`);
    }
  };

  const [storeId, setStoreId] = useState<string|null>(null);

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const r = await api.get('/stores/dashboard');
      setStore(r.data.store);
      const loadedOrders = r.data.orders || [];
      setOrders(loadedOrders);
      setHistoryOrders(r.data.history || []);
      setStoreCategories(r.data.categories || []);
      // Inicializar devoluções pendentes a partir dos pedidos já carregados
      const pendingReturns = loadedOrders
        .filter((o: any) => o.delivery?.statusDevolucao === 'aguardando_confirmacao')
        .map((o: any) => {
          const rawMotoboy = o.delivery.motoboyId;
          const motoboyId = o.delivery.motoboyName
            || (rawMotoboy && typeof rawMotoboy === 'object' ? rawMotoboy.name || rawMotoboy._id?.toString() : rawMotoboy)
            || '';
          return {
            deliveryId: typeof o.delivery._id === 'string' ? o.delivery._id : o.delivery._id?.toString(),
            orderId: o._id,
            motoboyId,
            message: 'Motoboy solicitou devolução do produto',
            pinRequired: true,
            returnedAt: o.delivery.updatedAt || new Date().toISOString(),
          };
        });
      if (pendingReturns.length > 0) {
        setReturnRequests(pendingReturns);
        router.replace('/seller/dashboard?tab=returns');
      }
      if (r.data.store && r.data.store._id) {
        setStoreId(r.data.store._id);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user) {
      fetchDashboard();
    }
    // eslint-disable-next-line
  }, [user]);

  // Join socket room — lean, apenas gerencia a sala
  useEffect(() => {
    if (!user || !storeId) return;
    const socket = connectSocket();
    if (!socket.connected) socket.connect();
    const doJoin = () => socket.emit('join', { room: `store:${storeId}`, storeId });
    doJoin();
    socket.on('connect', doJoin);
    return () => { socket.off('connect', doJoin); };
    // eslint-disable-next-line
  }, [user, storeId]);

  const handlePinInput = (orderId: string, value: string) => {
    setPinInputs(prev => ({ ...prev, [orderId]: value }));
  };

  // ✅ FIX #6: Confirmar devolução com PIN
  const handleConfirmReturn = async (returnRequest: any) => {
    const pinInput = returnPinInputs[returnRequest.deliveryId] || '';

    if (!pinInput.trim()) {
      alert('Por favor, insira o PIN de devolução');
      return;
    }

    if (pinInput.length !== 6) {
      alert('O PIN deve ter exatamente 6 dígitos');
      return;
    }

    try {
      const res = await api.post(`/deliveries/${returnRequest.deliveryId}/confirm-return`, {
        pinDevolucao: pinInput
      });

      console.log('✅ Devolução confirmada:', res.data);

      // Remover da lista de devoluções pendentes
      setReturnRequests(prev => prev.filter(r => r.deliveryId !== returnRequest.deliveryId));

      // Limpar input
      setReturnPinInputs(prev => {
        const updated = { ...prev };
        delete updated[returnRequest.deliveryId];
        return updated;
      });

      // Voltar para pedidos automaticamente
      router.push('/seller/dashboard?tab=orders');
    } catch (err: any) {
      const errorMsg = err.response?.data?.error || 'Erro ao confirmar devolução';
      console.error('❌ Erro:', errorMsg);

      if (errorMsg.includes('PIN') || errorMsg.includes('inválido')) {
        alert('PIN Inválido!\n\nVerifique se o PIN está correto e tente novamente.');
      } else {
        alert(`Erro: ${errorMsg}`);
      }
    }
  };

  const handlePinValidate = async (order: any) => {
    setPinStatuses(prev => ({ ...prev, [order._id]: '' }));
    try {
      await api.post(`/deliveries/${order.delivery._id}/validar-pin-retirada`, { pinRetirada: pinInputs[order._id] });
      setPinStatuses(prev => ({ ...prev, [order._id]: 'PIN validado com sucesso!' }));
      fetchDashboard();
    } catch (e: any) {
      setPinStatuses(prev => ({ ...prev, [order._id]: e?.response?.data?.error || 'Erro ao validar PIN' }));
    }
  };

  const handleToggleOpen = async (nextIsOpen: boolean) => {
    if (!store?._id) return;
    try {
      await api.put(`/stores/${store._id}/operating-hours`, { isOpen: nextIsOpen });
      fetchDashboard();
    } catch (e) {
      console.error('[overview] toggle open falhou:', e);
    }
  };

  if (loading) return (
    <div className={styles.loadingScreen}>
      <LoadingSkeleton variant="dashboard" />
    </div>
  );

  return (
    <ProtectedRoute required_role="lojista">
      <div className={styles.dashLayout}>

        {/* ═══ MAIN CONTENT ═══ */}
        <main className={styles.mainContent}>
          {/* Notificação */}
          {showNotif && newOrderIds.length > 0 && (
            <div className={styles.notifBanner}>
              <span><Icon name="bell" size={14} /> Novo pedido recebido!</span>
              <button onClick={() => setShowNotif(false)} className={styles.notifClose} aria-label="Fechar notificação">×</button>
            </div>
          )}

          <div className={styles.tabContent}>
            <OnboardingResumeBanner />

          {/* Visão geral */}
          {activeTab === 'overview' && (
            <OverviewTab
              store={store}
              orders={orders}
              history={historyOrders}
              metrics={{
                ongoing: orders.length,
                delivered: historyOrders.filter((o: any) => o.status === 'entregue' || o.status === 'delivered').length,
                totalSales: orders.length + historyOrders.length,
                revenue: 0, // não usado nos tiles (faturamento é calculado por "hoje" no componente)
              }}
              returnRequests={returnRequests}
              onGoToTab={(tab) => router.push(tab === 'overview' ? '/seller/dashboard' : `/seller/dashboard?tab=${tab}`)}
              onToggleOpen={handleToggleOpen}
              onQuickAction={(href) => router.push(href)}
            />
          )}

          {/* Configurações */}
          {activeTab === 'config' && (
            <div className={styles.configWrap}>
              {store?.plan === 3 && (
                <section className={styles.configSection}>
                  <h2 className={styles.configSectionTitle}>Banner da loja</h2>
                  <StoreBannerUpload
                    currentFeaturedBanner={store?.featuredBannerUrl}
                    currentCoverBanner={store?.coverBannerUrl}
                    onUploaded={fetchDashboard}
                  />
                </section>
              )}
              {store?._id && (
                <section className={styles.configSection}>
                  <h2 className={styles.configSectionTitle}>Horário de funcionamento</h2>
                  <OperatingHoursEditor
                    storeId={store._id}
                    initialHours={store.operatingHours}
                    initialIsOpen={store.isOpen !== false}
                    onSaved={fetchDashboard}
                  />
                </section>
              )}
            </div>
          )}

          {/* Pedidos em Andamento */}
          {activeTab === 'orders' && (
            <Section title="Pedidos em Andamento">
              {orders.length === 0 ? (
                <EmptyState
                  icon={<Icon name="gift" size={24} />}
                  title="Nenhum pedido em andamento"
                />
              ) : (
                <List>
                  {orders.map(order => (
                    <Row
                      key={order._id}
                      accent={newOrderIds.includes(order._id)}
                    >
                      <div className={styles.orderCardTop}>
                        <div className={styles.orderCardLeft}>
                          <div className={styles.orderCardId}>ID: {order._id}</div>
                          <div className={styles.orderCardCustomer}><Icon name="user" size={12} /> {order.customerName || 'Cliente'}</div>
                        </div>
                        <div className={styles.orderCardBadges}>
                          {newOrderIds.includes(order._id) && (
                            <span className={styles.badgeNew}>NOVO</span>
                          )}
                          <span className={styles.badgeStatus}>
                            {(() => {
                              const statusMap: Record<string, string> = {
                                criado: 'Criado',
                                created: 'Criado',
                                pago: 'Pago',
                                paid: 'Pago',
                                aguardando_motoboy: 'Aguardando Motoboy',
                                enviado: 'Enviado',
                                shipped: 'Enviado',
                                assigned: 'Motoboy',
                                picked: 'Retirado'
                              };
                              return statusMap[order.status] || order.status;
                            })()}
                          </span>
                        </div>
                      </div>

                      <div className={styles.orderCardMeta}>
                        {(!order.deliveryFee || order.deliveryFee === 0) ? null : (
                          <div>
                            <span className={styles.orderMetaKey}>Motoboy:</span>{' '}
                            {order.delivery?.motoboyName || 'Aguardando'}
                          </div>
                        )}
                        <div>
                          <span className={styles.orderMetaKey}>Total:</span>{' '}
                          R$ {
                            typeof order.totalValue === 'number' && order.totalValue > 0
                              ? order.totalValue.toFixed(2)
                              : order.totalValue?.toFixed(2) || '0.00'
                          }
                          {order.totalValue === 0 && (
                            <span className={styles.orderMetaWarn}>
                              <Icon name="alert-triangle" size={12} /> (Sem informações)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Produtos do Pedido — achatado, com divisória por item */}
                      {order.products && order.products.length > 0 && (
                        <div className={styles.orderProducts}>
                          <div className={styles.orderProductsTitle}><Icon name="package" size={12} /> Itens do Pedido:</div>
                          <div className={styles.orderProductsGrid}>
                            {order.products.map((product: any, idx: number) => (
                              <div
                                key={idx}
                                className={styles.orderProductItem}
                              >
                                <div>
                                  <span className={styles.orderProductQty}>{product.quantity}x</span>{' '}
                                  {product.productName || 'Produto'}
                                </div>
                                <div className={styles.orderProductPrice}>
                                  R$ {(product.price * product.quantity).toFixed(2)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* [Plano 1] Endereço do cliente para entrega — achatado, divisória no topo */}
                      {(!order.deliveryFee || order.deliveryFee === 0) && order.customerAddress && (
                        <div className={styles.plan1AddressBox}>
                          <div className={styles.plan1AddressTitle}><Icon name="map-pin" size={12} /> Endereço de Entrega:</div>
                          <div className={styles.plan1AddressText}>{order.customerAddress}</div>
                        </div>
                      )}

                      {order.delivery && order.delivery.status === 'assigned' && (
                        <div className={styles.pinRow}>
                          <Input
                            value={pinInputs[order._id] || ''}
                            onChange={value => handlePinInput(order._id, value)}
                            placeholder="PIN"
                            className={styles.pinInputWrap}
                          />
                          <Button
                            variant="ghost"
                            size="sm"
                            className={styles.btnPinValidate}
                            onClick={() => handlePinValidate(order)}
                            disabled={!pinInputs[order._id]}
                          >
                            Validar PIN
                          </Button>
                        </div>
                      )}
                      {pinStatuses[order._id] && (
                        <div
                          className={`${styles.pinStatus} ${pinStatuses[order._id].includes('sucesso') ? styles.pinStatusOk : styles.pinStatusErr}`}
                        >
                          {pinStatuses[order._id]}
                        </div>
                      )}

                      {/* Rota loja→cliente no card de aceitar (thumbnail estático) */}
                      {order.status === 'criado' && (
                        <div style={{ marginBottom: 'var(--space-3)' }}>
                          <RouteThumbnail
                            store={parseCoords(order.storeLatitude, order.storeLongitude)}
                            customer={parseCoords(order.customerLatitude, order.customerLongitude)}
                            polyline={order.routePolyline}
                            height={140}
                          />
                        </div>
                      )}

                      {/* Botões condicionais baseados no status do pedido */}
                      {order.status === 'criado' ? (
                        // Pedido ainda não aceito — mostrar Aceitar / Rejeitar / Detalhes
                        <div className={styles.orderActions3}>
                          <Button
                            variant="primary"
                            size="sm"
                            className={styles.btnAccept}
                            leftIcon={<Icon name="check" size={12} />}
                            onClick={() => handleAcceptOrder(order._id)}
                          >
                            Aceitar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={styles.btnReject}
                            leftIcon={<Icon name="x" size={12} />}
                            onClick={() => setRejectModalOrderId(order._id)}
                          >
                            Rejeitar
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={styles.btnDetails}
                            leftIcon={<Icon name="clipboard" size={12} />}
                            onClick={() => setDetalhesPedido(order)}
                          >
                            Detalhes
                          </Button>
                        </div>
                      ) : !order.delivery && order.status === 'pago' && (!order.deliveryFee || order.deliveryFee === 0) ? (
                        // [Plano 1] Aceito — aguardando cliente confirmar recebimento
                        <div className={styles.plan1ActionsWrap}>
                          <div className={styles.plan1WaitingLabel}>
                            <Icon name="clock" size={12} /> Aguardando cliente confirmar recebimento
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={styles.btnDetails}
                            leftIcon={<Icon name="clipboard" size={12} />}
                            onClick={() => setDetalhesPedido(order)}
                          >
                            Detalhes
                          </Button>
                        </div>
                      ) : (
                        // [Plano 2/3] Pedido aceito com delivery — mostrar Detalhes e Cancelar
                        <div className={styles.orderActions2}>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={styles.btnDetails}
                            leftIcon={<Icon name="clipboard" size={12} />}
                            onClick={() => setDetalhesPedido(order)}
                          >
                            Detalhes
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={styles.btnReject}
                            onClick={() => setRejectModalOrderId(order._id)}
                          >
                            Cancelar Pedido
                          </Button>
                        </div>
                      )}

                    </Row>
                  ))}
                </List>
              )}
            </Section>
          )}

          {/* Histórico */}
          {activeTab === 'history' && (
            <Section title="Histórico de Pedidos">

              {/* 🔍 SEÇÃO DE FILTROS — recolhível, colapsada por padrão (Task 6) */}
              <div className={styles.filtersPanel}>
                <div className={styles.filtersPanelHeader}>
                  <button
                    type="button"
                    className={styles.filtersToggle}
                    onClick={() => setFiltersOpen((open) => !open)}
                    aria-expanded={filtersOpen}
                  >
                    <Icon name="filter" size={14} /> Filtros
                    <Icon
                      name="chevron-down"
                      size={16}
                      className={filtersOpen ? styles.filtersChevronOpen : styles.filtersChevron}
                    />
                  </button>
                  {!filtersOpen && getActiveFilterCount() > 0 && (
                    <Chip
                      icon={<Icon name="filter" size={12} />}
                      label={`${getActiveFilterCount()} ativos`}
                      active
                    />
                  )}
                </div>

                {filtersOpen && (
                  <div className={styles.filtersBody}>
                    <div className={styles.filtersGrid}>
                      {/* Filtro por Status */}
                      <div className={styles.filterField}>
                        <label className={styles.filterLabel}><Icon name="filter" size={12} /> Status</label>
                        <Select
                          value={filterStatus}
                          onChange={setFilterStatus}
                          options={[
                            { value: '', label: 'Todos os Status' },
                            { value: 'entregue', label: '✓ Entregue' },
                            { value: 'pago', label: 'Pago' },
                            { value: 'criado', label: 'Criado' },
                            { value: 'aguardando_motoboy', label: 'Aguardando Motoboy' },
                            { value: 'cancelado', label: 'Cancelado' },
                            { value: 'rejeitado', label: 'Rejeitado' },
                          ]}
                        />
                      </div>

                      {/* Filtro por Cliente */}
                      <div className={styles.filterField}>
                        <label className={styles.filterLabel}><Icon name="user" size={12} /> Nome do Cliente</label>
                        <Input
                          type="text"
                          placeholder="Digite o nome..."
                          value={filterCustomer}
                          onChange={setFilterCustomer}
                        />
                      </div>

                      {/* Filtro por Data - De */}
                      <div className={styles.filterField}>
                        <label className={styles.filterLabel}><Icon name="calendar" size={12} /> Data De</label>
                        <Input
                          type="date"
                          value={filterDateFrom}
                          onChange={setFilterDateFrom}
                        />
                      </div>

                      {/* Filtro por Data - Até */}
                      <div className={styles.filterField}>
                        <label className={styles.filterLabel}><Icon name="calendar" size={12} /> Data Até</label>
                        <Input
                          type="date"
                          value={filterDateTo}
                          onChange={setFilterDateTo}
                        />
                      </div>

                      {/* Filtro por Valor Mínimo */}
                      <div className={styles.filterField}>
                        <label className={styles.filterLabel}><Icon name="wallet" size={12} /> Valor Mínimo (R$)</label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          step="0.01"
                          value={filterMinValue}
                          onChange={setFilterMinValue}
                        />
                      </div>

                      {/* Filtro por Valor Máximo */}
                      <div className={styles.filterField}>
                        <label className={styles.filterLabel}><Icon name="wallet" size={12} /> Valor Máximo (R$)</label>
                        <Input
                          type="number"
                          placeholder="0.00"
                          step="0.01"
                          value={filterMaxValue}
                          onChange={setFilterMaxValue}
                        />
                      </div>

                      {/* Filtro por Categoria de Produtos */}
                      <div className={styles.filterField}>
                        <label className={styles.filterLabel}><Icon name="tag" size={12} /> Categoria de Produto</label>
                        <Select
                          value={filterCategory}
                          onChange={setFilterCategory}
                          options={[
                            { value: '', label: 'Todas as Categorias' },
                            ...storeCategories.map((cat) => ({ value: cat, label: cat })),
                          ]}
                        />
                      </div>

                      {/* Filtro por Nome de Produto */}
                      <div className={styles.filterField}>
                        <label className={styles.filterLabel}><Icon name="package" size={12} /> Nome do Produto</label>
                        <Input
                          type="text"
                          placeholder="Digite o nome..."
                          value={filterProductName}
                          onChange={setFilterProductName}
                        />
                      </div>
                    </div>

                    {getActiveFilterCount() > 0 && (
                      <div className={styles.filtersFooter}>
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<Icon name="x" size={12} />}
                          onClick={() => {
                            setFilterStatus('');
                            setFilterCustomer('');
                            setFilterDateFrom('');
                            setFilterDateTo('');
                            setFilterMinValue('');
                            setFilterMaxValue('');
                            setFilterCategory('');
                            setFilterProductName('');
                          }}
                        >
                          Limpar Filtros
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Contador de resultados filtrados */}
              <div className={styles.resultsCount}>
                <Icon name="chart-bar" size={12} /> {getFilteredHistoryOrders().length} de {historyOrders.length} pedidos
              </div>

              {getFilteredHistoryOrders().length === 0 && historyOrders.length > 0 ? (
                <EmptyState
                  icon={<Icon name="search" size={24} />}
                  title="Nenhum pedido encontrado"
                  description="Tente ajustar os filtros"
                />
              ) : historyOrders.length === 0 ? (
                <EmptyState
                  icon={<Icon name="clipboard" size={24} />}
                  title="Nenhum pedido no histórico"
                />
              ) : (
                <>
                <List>
                  {[...getFilteredHistoryOrders()]
                    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                    .slice(0, historyLimit)
                    .map(order => (
                    <Row key={order._id}>
                      {/* TOPO: Info básica + Status + Total */}
                      <div className={styles.historyRowTop}>
                        <div>
                          <div className={styles.historyRowTopLabel}>CLIENTE</div>
                          <div className={styles.historyRowCustomer}><Icon name="user" size={12} /> {order.customerName || 'Cliente'}</div>
                          <div className={styles.historyRowId}>ID: {order._id.slice(0, 8)}...</div>
                        </div>
                        <div className={styles.historyRowStatusCenter}>
                          <div className={`${styles.historyRowStatusBadge} ${getStatusBadgeInfo(order.status).className}`}>
                            {getStatusBadgeInfo(order.status).label}
                          </div>
                          <div className={styles.historyRowDate}>
                            {order.createdAt && new Date(order.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </div>
                        </div>
                        <div className={styles.historyRowAmountRight}>
                          <div className={styles.historyRowAmountLabel}>VOCÊ RECEBE</div>
                          <div className={styles.historyRowAmount}>
                            R$ {(order.walletDistribution?.storeAmount ||
                              (((order.totalValue || 0) - (order.deliveryFee || 0)) * 0.9)).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* Detalhamento financeiro + itens ficam no modal "Mais Detalhes"
                          (DetalhesPedidoModal) — a linha do histórico é só o resumo. */}

                      {/* BOTÃO */}
                      <div className={styles.historyRowFooter}>
                        <Button
                          variant="ghost"
                          size="sm"
                          leftIcon={<Icon name="clipboard" size={12} />}
                          onClick={() => setDetalhesPedido(order)}
                        >
                          Mais Detalhes
                        </Button>
                      </div>
                    </Row>
                  ))}
                </List>
                {getFilteredHistoryOrders().length > historyLimit && (
                  <div className={styles.historyLoadMoreWrap}>
                    <Button
                      variant="ghost"
                      size="sm"
                      leftIcon={<Icon name="clipboard" size={12} />}
                      onClick={() => setHistoryLimit(n => n + 10)}
                    >
                      Ver mais ({getFilteredHistoryOrders().length - historyLimit} restantes)
                    </Button>
                  </div>
                )}
                </>
              )}
            </Section>
          )}

          {/* ✅ FIX #6: Tab de Devoluções Pendentes — lista achatada no DS (Task 8) */}
          {activeTab === 'returns' && (
            <Section title={<><Icon name="package" size={16} /> Devoluções Pendentes</>}>
              {returnRequests.length === 0 ? (
                <EmptyState
                  icon={<Icon name="check-circle" size={24} />}
                  title="Nenhuma devolução pendente"
                  description="Todas as devoluções foram processadas"
                />
              ) : (
                <>
                <div className={styles.returnInstructions}>
                  <div className={styles.returnInstructionsTitle}><Icon name="clipboard" size={12} /> Como confirmar uma devolução</div>
                  <ul className={styles.returnInstructionsList}>
                    <li>O motoboy retorna com o produto</li>
                    <li>Confirme o recebimento do produto</li>
                    <li>Insira o PIN fornecido e clique em confirmar</li>
                  </ul>
                </div>
                <List>
                  {returnRequests.map((request) => (
                    <Row key={request.deliveryId}>
                      <div className={styles.returnRowTop}>
                        <div>
                          <div className={styles.returnRowTitle}><Icon name="truck" size={14} /> Devolução Solicitada</div>
                          <div className={styles.returnRowMeta}>
                            Pedido: {request.orderId?.slice(-8) || 'N/A'}
                          </div>
                          <div className={styles.returnRowMeta}>
                            Motoboy: {request.motoboyId || 'ID'}
                          </div>
                        </div>
                        <span className={styles.returnStatusPill}>
                          <Icon name="clock" size={12} /> Aguardando Confirmação
                        </span>
                      </div>

                      <div className={styles.returnPinSection}>
                        <label className={styles.returnPinLabel} htmlFor={`return-pin-${request.deliveryId}`}>
                          <Icon name="lock" size={12} /> PIN de Devolução (6 dígitos)
                        </label>
                        <div className={styles.returnPinWrapper}>
                          <input
                            id={`return-pin-${request.deliveryId}`}
                            type="text"
                            placeholder="______"
                            maxLength={6}
                            inputMode="numeric"
                            value={returnPinInputs[request.deliveryId] || ''}
                            onChange={(e) => {
                              // ✅ Apenas números
                              const value = e.target.value.replace(/[^0-9]/g, '');
                              setReturnPinInputs(prev => ({ ...prev, [request.deliveryId]: value }));
                            }}
                            className={styles.returnPinInput}
                          />
                          {returnPinInputs[request.deliveryId] && (
                            <div className={styles.returnPinIndicator}>
                              {returnPinInputs[request.deliveryId].length === 6 ? <Icon name="check-circle" size={14} /> : <Icon name="clock" size={14} />}
                            </div>
                          )}
                        </div>
                        <p className={styles.returnPinCount}>
                          {returnPinInputs[request.deliveryId]?.length || 0}/6 dígitos
                        </p>
                      </div>

                      <Button
                        variant="primary"
                        className={styles.btnConfirmReturn}
                        leftIcon={<Icon name="check" size={14} />}
                        onClick={() => handleConfirmReturn(request)}
                        disabled={!returnPinInputs[request.deliveryId] || returnPinInputs[request.deliveryId].length !== 6}
                      >
                        Confirmar Devolução
                      </Button>
                    </Row>
                  ))}
                </List>
                </>
              )}
            </Section>
          )}

          {/* 🆕 ABA: CHAT PRÉ-COMPRA */}
          {activeTab === 'chat' && (
            <div className={styles.chatTabGrid}>
              {/* LISTA DE CONVERSAS */}
              <Card className={styles.chatListCard}>
                <ChatConversationList
                  filter={chatFilter as 'all' | 'product' | 'user'}
                  onSelectConversation={setSelectedConversationId}
                  selectedConversationId={selectedConversationId || undefined}
                  storeId={user?._id}
                />
              </Card>

              {/* DETALHE DA CONVERSA */}
              <Card className={styles.chatDetailCard}>
                {selectedConversationId ? (
                  <ChatConversationDetail
                    conversationId={selectedConversationId}
                    onBack={() => setSelectedConversationId(null)}
                    currentUserId={user?._id}
                  />
                ) : (
                  <div className={styles.chatEmpty}>
                    <div className={styles.chatEmptyInner}>
                      <div className={styles.chatEmptyIcon}><Icon name="chat" size={32} /></div>
                      <div className={styles.chatEmptyTitle}>Selecione uma conversa</div>
                      <div className={styles.chatEmptyDesc}>Clique em uma conversa acima para visualizar a mensagem</div>
                    </div>
                  </div>
                )}
              </Card>
            </div>
          )}

          </div>{/* /tabContent */}
        </main>{/* /mainContent */}

        {detalhesPedido && <DetalhesPedidoModal order={detalhesPedido} onClose={() => setDetalhesPedido(null)} token={token} />}

        {/* Modal de Rejeição */}
        <Sheet
          open={!!rejectModalOrderId}
          onClose={() => setRejectModalOrderId(null)}
          title="Rejeitar Pedido"
        >
          <div className={styles.rejectWrap}>
            <span className={styles.rejectLabel}>Motivo da Rejeição</span>
            <div className={styles.rejectReasons} role="radiogroup" aria-label="Motivo da rejeição">
              {[
                { code: 'store_closed', label: 'Loja fechada' },
                { code: 'store_busy', label: 'Loja muito ocupada' },
                { code: 'not_available', label: 'Itens indisponíveis' },
                { code: 'payment_issue', label: 'Problema de pagamento' },
                { code: 'other', label: 'Outro motivo' },
              ].map(option => (
                <button
                  key={option.code}
                  type="button"
                  role="radio"
                  aria-checked={rejectReason === option.code}
                  className={[styles.rejectReason, rejectReason === option.code && styles.rejectReasonActive].filter(Boolean).join(' ')}
                  onClick={() => setRejectReason(option.code)}
                >
                  {option.label}
                </button>
              ))}
            </div>

            {rejectReason === 'other' && (
              <textarea
                value={rejectCustomReason}
                onChange={e => setRejectCustomReason(e.target.value)}
                placeholder="Descreva o motivo..."
                className={styles.rejectTextarea}
                rows={3}
              />
            )}

            <div className={styles.rejectActions}>
              <Button
                variant="ghost"
                onClick={() => setRejectModalOrderId(null)}
                disabled={rejectLoading}
              >
                Cancelar
              </Button>
              <Button
                variant="primary"
                className={styles.rejectConfirm}
                onClick={handleRejectOrder}
                loading={rejectLoading}
              >
                Rejeitar Pedido
              </Button>
            </div>
          </div>
        </Sheet>
      </div>
    </ProtectedRoute>
  );
}
