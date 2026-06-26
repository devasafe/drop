import { useEffect, useState, useContext, useRef, useCallback } from 'react';
import { useRouter } from 'next/router';
import api from '../lib/api';
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

  const getStatusColor = (status: string) => {
    const colorMap: Record<string, string> = {
      entregue: '#28a745',
      delivered: '#28a745',
      enviado: '#ff9800',
      shipped: '#ff9800',
      pago: '#007bff',
      paid: '#007bff',
      criado: '#6c757d',
      created: '#6c757d',
      cancelado: '#dc3545',
      cancelled: '#dc3545',
      rejeitado: '#dc3545',
      aguardando_motoboy: '#ffc107',
      assigned: '#17a2b8',
      picked: '#17a2b8'
    };
    return colorMap[status] || '#6c757d';
  };

  return (
    <div className={styles.modal}>
      <div className={styles.modalDialog}>
        {/* Botão Fechar */}
        <button onClick={onClose} className={styles.modalClose}>×</button>

        {/* HEADER com Status */}
        <div
          className={styles.modalHeader}
          style={{ background: `linear-gradient(135deg, ${getStatusColor(order.status)}20 0%, ${getStatusColor(order.status)}10 100%)` }}
        >
          <div className={styles.modalHeaderLeft}>
            <h2 className={styles.modalOrderTitle}><Icon name="clipboard" size={16} /> Pedido #{order._id.slice(0, 8).toUpperCase()}</h2>
            <div className={styles.modalDate}>
              {order.createdAt && new Date(order.createdAt).toLocaleDateString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'})}
            </div>
          </div>
          <span
            className={styles.modalStatusBadge}
            style={{ backgroundColor: getStatusColor(order.status) }}
          >
            {order.status === 'entregue' || order.status === 'delivered' ? '✓ Entregue' :
             order.status === 'enviado' || order.status === 'shipped' ? 'Enviado' :
             order.status === 'pago' || order.status === 'paid' ? 'Pago' :
             order.status === 'criado' || order.status === 'created' ? 'Criado' :
             order.status === 'cancelado' || order.status === 'cancelled' ? 'Cancelado' :
             order.status === 'rejeitado' ? 'Rejeitado' :
             order.status === 'aguardando_motoboy' ? 'Aguardando' :
             order.status === 'assigned' ? 'Atribuído' :
             order.status === 'picked' ? 'Retirado' : order.status}
          </span>
        </div>

        <div className={styles.modalBody}>
          {/* GRID: Comprador, Loja, Motoboy, Método */}
          <div className={styles.infoGrid2}>
            <div className={styles.infoCell}>
              <div className={styles.infoCellLabel}><Icon name="user" size={12} /> Comprador</div>
              <button
                onClick={() => handleClickName(order.customerId || order.customerObj?._id, 'customer')}
                className={styles.btnLink}
              >
                {order.customerName || 'Cliente'}
              </button>
              <div className={styles.infoCellSub}>{(order.customerId || order.customerObj?._id || '').toString().slice(0, 8)}...</div>
            </div>

            <div className={styles.infoCell}>
              <div className={styles.infoCellLabel}><Icon name="store" size={12} /> Loja</div>
              <button
                onClick={() => handleClickName(order.storeId || order.storeObj?._id, 'store')}
                className={styles.btnLink}
              >
                {order.storeName || 'Loja'}
              </button>
              <div className={styles.infoCellSub}>{(order.storeId || order.storeObj?._id || '').toString().slice(0, 8)}...</div>
            </div>

            <div className={styles.infoCell}>
              <div className={styles.infoCellLabel}><Icon name="motorcycle" size={12} /> Motoboy</div>
              {order.delivery?.motoboyName ? (
                <button
                  onClick={() => handleClickName(typeof order.delivery.motoboyId === 'object' ? order.delivery.motoboyId._id : order.delivery.motoboyId, 'motoboy')}
                  className={styles.btnLink}
                >
                  {order.delivery.motoboyName}
                </button>
              ) : (
                <div className={styles.infoCellValue}>Aguardando</div>
              )}
              {order.delivery?.motoboyId && (
                <div className={styles.infoCellSub}>
                  {(typeof order.delivery.motoboyId === 'object' ? order.delivery.motoboyId._id : order.delivery.motoboyId).toString().slice(0, 8)}...
                </div>
              )}
            </div>

            <div className={styles.infoCell}>
              <div className={styles.infoCellLabel}><Icon name="credit-card" size={12} /> Pagamento</div>
              <div className={styles.infoCellValue}>
                {order.paymentMethod === 'credit_card' ? 'Cartão' :
                 order.paymentMethod === 'debit_card' ? 'Débito' :
                 order.paymentMethod === 'pix' ? 'PIX' :
                 order.paymentMethod === 'money' ? 'Dinheiro' :
                 order.paymentMethod || '---'}
              </div>
              <div className={styles.infoCellSub}>
                Status: {order.paymentStatus === 'paid' ? '✓ Pago' : order.paymentStatus === 'pending' ? 'Pendente' : order.paymentStatus || '---'}
              </div>
            </div>
          </div>

          {/* PRODUTOS */}
          {order.products && order.products.length > 0 && (
            <div className={styles.productsList}>
              <div className={styles.productsListTitle}><Icon name="package" size={12} /> Itens do Pedido ({order.products.length}):</div>
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
          )}

          {/* DETALHES DE PAGAMENTO - 5 Colunas */}
          <div className={styles.financialGrid5}>
            <div className={styles.financialCell}>
              <div className={styles.financialLabel}><Icon name="wallet" size={14} /> VOCÊ RECEBE</div>
              <div className={styles.financialValue} style={{ color: '#10b981' }}>
                R$ {(order.walletDistribution?.storeAmount || (((order.totalValue || 0) - (order.deliveryFee || 0)) * 0.9)).toFixed(2)}
              </div>
              <div className={styles.financialSub}>(produto - taxa)</div>
            </div>
            <div className={styles.financialCell}>
              <div className={styles.financialLabel}><Icon name="building" size={14} /> TAXA APP</div>
              <div className={styles.financialValue} style={{ color: '#fc5a8d' }}>
                R$ {(order.walletDistribution?.appCommission || (((order.totalValue || 0) - (order.deliveryFee || 0)) * 0.1)).toFixed(2)}
              </div>
              <div className={styles.financialSub}>(comissão)</div>
            </div>
            <div className={styles.financialCell}>
              <div className={styles.financialLabel}><Icon name="package" size={14} /> SUBTOTAL</div>
              <div className={styles.financialValue} style={{ color: 'var(--drop-text-muted)' }}>
                R$ {((order.totalValue || 0) - (order.deliveryFee || 0)).toFixed(2)}
              </div>
              <div className={styles.financialSub}>(produtos)</div>
            </div>
            <div className={styles.financialCell}>
              <div className={styles.financialLabel}><Icon name="truck" size={14} /> ENTREGA</div>
              <div className={styles.financialValue} style={{ color: 'var(--drop-warning)' }}>
                R$ {(order.deliveryFee || 0).toFixed(2)}
              </div>
              <div className={styles.financialSub}>(taxa)</div>
            </div>
            <div className={styles.financialCell}>
              <div className={styles.financialLabel}><Icon name="credit-card" size={14} /> TOTAL</div>
              <div className={styles.financialValue} style={{ color: '#60A5FA' }}>
                R$ {order.totalValue?.toFixed(2) || '0.00'}
              </div>
              <div className={styles.financialSub}>(cliente)</div>
            </div>
          </div>

          {/* STATUS DE PAGAMENTO - LOJISTA PODE ALTERAR */}
          {user?.activeRole === 'lojista' && (
            <div className={styles.paymentStatusSection}>
              <div className={styles.paymentStatusTitle}>
                <Icon name="credit-card" size={14} /> Status de Pagamento (Temporário)
              </div>
              <div className={styles.paymentStatusRow}>
                <select
                  value={selectedPaymentStatus}
                  onChange={(e) => setSelectedPaymentStatus(e.target.value)}
                  className={styles.select}
                >
                  <option value="pending">Pendente</option>
                  <option value="paid">✓ Pago</option>
                  <option value="failed">Falhou</option>
                  <option value="refunded">Reembolsado</option>
                </select>
                <button
                  onClick={handleUpdatePaymentStatus}
                  disabled={changingPayment}
                  className={styles.btnSave}
                >
                  {changingPayment ? 'Atualizando...' : '✓ Atualizar'}
                </button>
              </div>
              <div className={styles.paymentStatusNote}>
                Status atual: <strong>{selectedPaymentStatus === 'paid' ? '✓ Pago' : selectedPaymentStatus === 'pending' ? 'Pendente' : selectedPaymentStatus}</strong>
              </div>
            </div>
          )}

          {/* SEÇÃO DE CHAT */}
          {showChat && chatConvId ? (
            <div className={styles.chatBox}>
              <div className={styles.chatBoxTitle}><Icon name="chat" size={14} /> Chat com Cliente</div>
              <div style={{ height: 420 }}>
                <ChatConversationDetail
                  conversationId={chatConvId}
                  currentUserId={user?._id}
                  otherParticipantId={customerId}
                  otherParticipantName={order.customerName || 'Cliente'}
                  onBack={() => setShowChat(false)}
                />
              </div>
            </div>
          ) : null}

          {/* BOTÕES DE AÇÃO */}
          <div className={styles.actionBtns}>
            <button
              onClick={handleToggleChat}
              disabled={chatLoading}
              className={`${styles.btnToggleChat} ${showChat ? styles.btnToggleChatClose : styles.btnToggleChatOpen}`}
            >
              {chatLoading ? 'Abrindo...' : showChat ? <><Icon name="x-circle" /> Fechar Chat</> : <><Icon name="chat" /> Abrir Chat</>}
            </button>

            {/* BOTÃO FECHAR */}
            <button
              onClick={onClose}
              className={styles.btnCloseModal}
            >
              ✕ Fechar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}


export default function StoreDashboard() {
  const router = useRouter();
  const { user, token } = useContext(AuthContext);
  const [store, setStore] = useState<any>(null);
  const [orders, setOrders] = useState<any[]>([]);
  const [historyOrders, setHistoryOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('orders');
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [pinInputs, setPinInputs] = useState<{[id:string]:string}>({});
  const [pinStatuses, setPinStatuses] = useState<{[id:string]:string}>({});
  const pollingRef = useRef<any>(null);
  const [showNotif, setShowNotif] = useState(false);
  const [newOrderIds, setNewOrderIds] = useState<string[]>([]);
  const [notifColor, setNotifColor] = useState<string>('#ff9800');
  const [orderColors, setOrderColors] = useState<{[id:string]:string}>({});
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
        const color = getRandomColor();
        setNotifColor(color);
        setOrderColors(prev => ({ ...prev, [newest._id]: color }));
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
      setActiveTab('returns');
    } else {
      console.error('[SOCKET] ❌ Data inválida - faltam deliveryId ou orderId', data);
    }
  }, []));

  function getRandomColor() {
    const colors = ['#ff9800', '#2196f3', '#4caf50', '#e91e63', '#9c27b0', '#f44336', '#00bcd4', '#8bc34a', '#ffc107', '#ff5722'];
    return colors[Math.floor(Math.random() * colors.length)];
  }

  function getStatusBadgeInfo(status: string) {
    const statusMap: any = {
      pago: { label: 'Pago', color: '#007bff', bg: '#007bff' },
      criado: { label: 'Criado', color: '#6c757d', bg: '#6c757d' },
      aguardando_motoboy: { label: 'Aguardando Motoboy', color: '#ffc107', bg: '#ffc107' },
      entregue: { label: '✓ Entregue', color: '#28a745', bg: '#28a745' },
      delivered: { label: '✓ Entregue', color: '#28a745', bg: '#28a745' },
      cancelado: { label: 'Cancelado', color: '#dc3545', bg: '#dc3545' },
      cancelled: { label: 'Cancelado', color: '#dc3545', bg: '#dc3545' },
      rejeitado: { label: 'Rejeitado', color: '#fd7e14', bg: '#fd7e14' },
    };
    return statusMap[status] || { label: status.toUpperCase(), color: '#6c757d', bg: '#6c757d' };
  }

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
        setActiveTab('returns');
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
      setActiveTab('orders');
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

  if (loading) return (
    <div className={styles.loadingScreen}>
      <LoadingSkeleton variant="dashboard" />
    </div>
  );

  return (
    <ProtectedRoute required_role="lojista">
      <div className={styles.dashLayout}>

        {/* ═══ SIDEBAR ═══ */}
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarOpen : ''}`}>
          <div className={styles.sidebarHeader}>
            <div className={styles.sidebarLogoRow}>
              <div className={styles.sidebarLogoIcon}><Icon name="package" size={16} /></div>
              <span className={styles.sidebarLogo}>DROP SELLER</span>
            </div>
            <p className={styles.sidebarSubtitle}>Partner Dashboard</p>
          </div>

          {store && (
            <div className={styles.sidebarStoreInfo}>
              <div className={styles.sidebarStoreName}>{store.name}</div>
              {store.plan && (
                <span className={styles.sidebarPlanBadge}>
                  Plano {store.plan === 3 ? 'Premium' : store.plan === 2 ? 'Pro' : 'Basic'}
                </span>
              )}
            </div>
          )}

          <nav className={styles.sidebarNav}>
            {[
              { id: 'metrics', label: 'Configurações', icon: 'settings' as const },
              { id: 'orders', label: `Pedidos (${orders.length})`, icon: 'package' as const },
              { id: 'history', label: `Histórico (${historyOrders.length})`, icon: 'clipboard' as const },
              { id: 'returns', label: `Devoluções (${returnRequests.length})`, icon: 'truck' as const },
              { id: 'chat', label: 'Chat', icon: 'chat' as const },
            ].map(tab => (
              <button
                key={tab.id}
                onClick={() => { setActiveTab(tab.id); setSidebarOpen(false); }}
                className={`${styles.sidebarNavItem} ${activeTab === tab.id ? styles.sidebarNavItemActive : ''}`}
              >
                <Icon name={tab.icon} size={16} />
                <span>{tab.label}</span>
              </button>
            ))}

            <div className={styles.sidebarNavLabel}>Gerenciar</div>
            {[
              { href: '/seller/products', label: 'Meus Produtos', icon: 'package' as const },
              { href: '/seller/analytics', label: 'Analytics', icon: 'chart-up' as const },
              { href: '/seller/coupons', label: 'Meus Cupons', icon: 'tag' as const },
              { href: '/editar-conta', label: 'Editar meus dados', icon: 'settings' as const },
            ].map(link => (
              <button
                key={link.href}
                onClick={() => { setSidebarOpen(false); router.push(link.href); }}
                className={styles.sidebarNavItem}
              >
                <Icon name={link.icon} size={16} />
                <span>{link.label}</span>
              </button>
            ))}
          </nav>

          {store && (
            <div className={styles.sidebarActions}>
              <button
                onClick={() => router.push('/seller/select-plan')}
                className={`${styles.btnStoreAction} ${styles.btnStoreActionSuccess}`}
              >
                <Icon name="clipboard" size={14} /> Escolher Plano
              </button>
              <button
                onClick={() => router.push('/seller/wallet')}
                className={`${styles.btnStoreAction} ${styles.btnStoreActionWarning}`}
              >
                <Icon name="wallet" size={14} /> Carteira
              </button>
            </div>
          )}
        </aside>

        {sidebarOpen && <div className={styles.sidebarOverlay} onClick={() => setSidebarOpen(false)} />}

        {/* ═══ MAIN CONTENT ═══ */}
        <main className={styles.mainContent}>
          {/* Top Bar */}
          <div className={styles.topBar}>
            <button className={styles.hamburgerBtn} onClick={() => setSidebarOpen(!sidebarOpen)}>
              <Icon name="menu" size={20} />
            </button>
            <div className={styles.topBarTitle}>
              <h1 className={styles.pageTitle}>Painel do Lojista</h1>
            </div>
            <div className={styles.topBarActions}>
              <button className={styles.topBarIcon} onClick={() => setActiveTab('orders')}>
                <Icon name="bell" size={18} />
                {orders.length > 0 && <span className={styles.topBarBadge}>{orders.length}</span>}
              </button>
              <div className={styles.topBarProfile}>
                <div className={styles.profileAvatar}>{store?.name?.charAt(0)?.toUpperCase() || 'L'}</div>
                <span className={styles.profileName}>{store?.name || 'Loja'}</span>
              </div>
            </div>
          </div>

          {/* Notificação */}
          {showNotif && newOrderIds.length > 0 && (
            <div
              className={styles.notifBanner}
              style={{ backgroundColor: notifColor }}
            >
              <span><Icon name="bell" size={14} /> Novo pedido recebido!</span>
              <button onClick={() => setShowNotif(false)} className={styles.notifClose}>×</button>
            </div>
          )}

          <div className={styles.tabContent}>
            <OnboardingResumeBanner />

          {/* Configurações */}
          {activeTab === 'metrics' && (
            <div>
              {store?.plan === 3 && (
                <StoreBannerUpload
                  currentFeaturedBanner={store?.featuredBannerUrl}
                  currentCoverBanner={store?.coverBannerUrl}
                  onUploaded={fetchDashboard}
                />
              )}
              {store?._id && (
                <OperatingHoursEditor
                  storeId={store._id}
                  initialHours={store.operatingHours}
                  initialIsOpen={store.isOpen !== false}
                  onSaved={fetchDashboard}
                />
              )}
            </div>
          )}

          {/* Pedidos em Andamento */}
          {activeTab === 'orders' && (
            <div>
              <h2 className={styles.ordersTitle}>Pedidos em Andamento</h2>
              {orders.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateIcon}><Icon name="gift" size={32} /></div>
                  <div className={styles.emptyStateText}>Nenhum pedido em andamento</div>
                </div>
              ) : (
                <div className={styles.ordersList}>
                  {orders.map(order => (
                    <div
                      key={order._id}
                      className={styles.orderCard}
                      style={{
                        border: newOrderIds.includes(order._id)
                          ? `2px solid ${orderColors[order._id] || '#ff9800'}`
                          : undefined,
                        background: newOrderIds.includes(order._id)
                          ? (orderColors[order._id] ? orderColors[order._id] + '10' : 'rgba(255,152,0,0.06)')
                          : undefined
                      }}
                    >
                      <div className={styles.orderCardTop}>
                        <div className={styles.orderCardLeft}>
                          <div className={styles.orderCardId}>ID: {order._id}</div>
                          <div className={styles.orderCardCustomer}><Icon name="user" size={12} /> {order.customerName || 'Cliente'}</div>
                        </div>
                        <div className={styles.orderCardBadges}>
                          {newOrderIds.includes(order._id) && (
                            <span
                              className={styles.badgeNew}
                              style={{ backgroundColor: orderColors[order._id] || '#ff9800' }}
                            >
                              NOVO
                            </span>
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

                      {/* Produtos do Pedido */}
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

                      {/* [Plano 1] Endereço do cliente para entrega */}
                      {(!order.deliveryFee || order.deliveryFee === 0) && order.customerAddress && (
                        <div className={styles.plan1AddressBox}>
                          <div className={styles.plan1AddressTitle}><Icon name="map-pin" /> Endereço de Entrega:</div>
                          <div className={styles.plan1AddressText}>{order.customerAddress}</div>
                        </div>
                      )}

                      {order.delivery && order.delivery.status === 'assigned' && (
                        <div className={styles.pinRow}>
                          <input
                            type="text"
                            placeholder="PIN"
                            value={pinInputs[order._id] || ''}
                            onChange={e => handlePinInput(order._id, e.target.value)}
                            className={styles.pinInput}
                          />
                          <button
                            onClick={() => handlePinValidate(order)}
                            disabled={!pinInputs[order._id]}
                            className={styles.btnPinValidate}
                          >
                            Validar PIN
                          </button>
                        </div>
                      )}
                      {pinStatuses[order._id] && (
                        <div
                          className={`${styles.pinStatus} ${pinStatuses[order._id].includes('sucesso') ? styles.pinStatusOk : styles.pinStatusErr}`}
                        >
                          {pinStatuses[order._id]}
                        </div>
                      )}

                      {/* Botões condicionais baseados no status do pedido */}
                      {order.status === 'criado' ? (
                        // Pedido ainda não aceito — mostrar Aceitar / Rejeitar / Detalhes
                        <div className={styles.orderActions3}>
                          <button onClick={() => handleAcceptOrder(order._id)} className={styles.btnAccept}>
                            <Icon name="check" size={12} /> Aceitar
                          </button>
                          <button onClick={() => setRejectModalOrderId(order._id)} className={styles.btnReject}>
                            ✕ Rejeitar
                          </button>
                          <button onClick={() => setDetalhesPedido(order)} className={styles.btnDetails}>
                            <Icon name="clipboard" size={12} /> Detalhes
                          </button>
                        </div>
                      ) : !order.delivery && order.status === 'pago' && (!order.deliveryFee || order.deliveryFee === 0) ? (
                        // [Plano 1] Aceito — aguardando cliente confirmar recebimento
                        <div className={styles.plan1ActionsWrap}>
                          <div className={styles.plan1WaitingLabel}>
                            <Icon name="clock" size={12} /> Aguardando cliente confirmar recebimento
                          </div>
                          <button onClick={() => setDetalhesPedido(order)} className={styles.btnDetails} style={{ marginTop: 8 }}>
                            <Icon name="clipboard" size={12} /> Detalhes
                          </button>
                        </div>
                      ) : (
                        // [Plano 2/3] Pedido aceito com delivery — mostrar Detalhes e Cancelar
                        <div className={styles.orderActions2}>
                          <button onClick={() => setDetalhesPedido(order)} className={styles.btnDetails}>
                            <Icon name="clipboard" size={12} /> Detalhes
                          </button>
                          <button onClick={() => setRejectModalOrderId(order._id)} className={styles.btnReject}>
                            Cancelar Pedido
                          </button>
                        </div>
                      )}

                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Histórico */}
          {activeTab === 'history' && (
            <div>
              <h2 className={styles.historyTitle}>Histórico de Pedidos</h2>

              {/* 🔍 SEÇÃO DE FILTROS */}
              <div className={styles.filtersPanel}>
                <div className={styles.filtersPanelHeader}>
                  <Icon name="search" size={14} /> Filtros de Pesquisa
                  {(filterStatus || filterCustomer || filterDateFrom || filterDateTo || filterMinValue || filterMaxValue || filterCategory || filterProductName) && (
                    <button
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
                      className={styles.btnClearFilters}
                    >
                      ✕ Limpar Filtros
                    </button>
                  )}
                </div>

                <div className={styles.filtersGrid}>
                  {/* Filtro por Status */}
                  <div className={styles.filterField}>
                    <label className={styles.filterLabel}><Icon name="filter" size={12} /> Status</label>
                    <select
                      value={filterStatus}
                      onChange={(e) => setFilterStatus(e.target.value)}
                      className={styles.filterInput}
                    >
                      <option value="">Todos os Status</option>
                      <option value="entregue">✓ Entregue</option>
                      <option value="pago">Pago</option>
                      <option value="criado">Criado</option>
                      <option value="aguardando_motoboy">Aguardando Motoboy</option>
                      <option value="cancelado">Cancelado</option>
                      <option value="rejeitado">Rejeitado</option>
                    </select>
                  </div>

                  {/* Filtro por Cliente */}
                  <div className={styles.filterField}>
                    <label className={styles.filterLabel}><Icon name="user" size={12} /> Nome do Cliente</label>
                    <input
                      type="text"
                      placeholder="Digite o nome..."
                      value={filterCustomer}
                      onChange={(e) => setFilterCustomer(e.target.value)}
                      className={styles.filterInput}
                    />
                  </div>

                  {/* Filtro por Data - De */}
                  <div className={styles.filterField}>
                    <label className={styles.filterLabel}>📅 Data De</label>
                    <input
                      type="date"
                      value={filterDateFrom}
                      onChange={(e) => setFilterDateFrom(e.target.value)}
                      className={styles.filterInput}
                    />
                  </div>

                  {/* Filtro por Data - Até */}
                  <div className={styles.filterField}>
                    <label className={styles.filterLabel}>📅 Data Até</label>
                    <input
                      type="date"
                      value={filterDateTo}
                      onChange={(e) => setFilterDateTo(e.target.value)}
                      className={styles.filterInput}
                    />
                  </div>

                  {/* Filtro por Valor Mínimo */}
                  <div className={styles.filterField}>
                    <label className={styles.filterLabel}><Icon name="wallet" size={12} /> Valor Mínimo (R$)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      step="0.01"
                      value={filterMinValue}
                      onChange={(e) => setFilterMinValue(e.target.value)}
                      className={styles.filterInput}
                    />
                  </div>

                  {/* Filtro por Valor Máximo */}
                  <div className={styles.filterField}>
                    <label className={styles.filterLabel}><Icon name="wallet" size={12} /> Valor Máximo (R$)</label>
                    <input
                      type="number"
                      placeholder="0.00"
                      step="0.01"
                      value={filterMaxValue}
                      onChange={(e) => setFilterMaxValue(e.target.value)}
                      className={styles.filterInput}
                    />
                  </div>

                  {/* Filtro por Categoria de Produtos */}
                  <div className={styles.filterField}>
                    <label className={styles.filterLabel}>📂 Categoria de Produto</label>
                    <select
                      value={filterCategory}
                      onChange={(e) => setFilterCategory(e.target.value)}
                      className={styles.filterInput}
                    >
                      <option value="">Todas as Categorias</option>
                      {storeCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Filtro por Nome de Produto */}
                  <div className={styles.filterField}>
                    <label className={styles.filterLabel}><Icon name="package" size={12} /> Nome do Produto</label>
                    <input
                      type="text"
                      placeholder="Digite o nome..."
                      value={filterProductName}
                      onChange={(e) => setFilterProductName(e.target.value)}
                      className={styles.filterInput}
                    />
                  </div>
                </div>
              </div>

              {/* Contador de resultados filtrados */}
              <div className={styles.resultsCount}>
                <Icon name="chart-bar" size={12} /> {getFilteredHistoryOrders().length} de {historyOrders.length} pedidos
              </div>

              {getFilteredHistoryOrders().length === 0 && historyOrders.length > 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateIcon}><Icon name="search" size={32} /></div>
                  <div className={styles.emptyStateText}>Nenhum pedido encontrado</div>
                  <div style={{ fontSize: 13, marginTop: 8, opacity: 0.7 }}>Tente ajustar os filtros</div>
                </div>
              ) : historyOrders.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateIcon}><Icon name="clipboard" size={32} /></div>
                  <div className={styles.emptyStateText}>Nenhum pedido no histórico</div>
                </div>
              ) : (
                <>
                <div className={styles.ordersList}>
                  {[...getFilteredHistoryOrders()]
                    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                    .slice(0, historyLimit)
                    .map(order => (
                    <div key={order._id} className={styles.historyCard}>
                      {/* TOPO: Info básica + Status + Total */}
                      <div className={styles.historyCardTop}>
                        <div>
                          <div className={styles.historyCardTopLabel}>CLIENTE</div>
                          <div className={styles.historyCardCustomer}><Icon name="user" size={12} /> {order.customerName || 'Cliente'}</div>
                          <div className={styles.historyCardId}>ID: {order._id.slice(0, 8)}...</div>
                        </div>
                        <div className={styles.historyCardStatusCenter}>
                          <div
                            className={styles.historyCardStatusBadge}
                            style={{ backgroundColor: getStatusBadgeInfo(order.status).bg }}
                          >
                            {getStatusBadgeInfo(order.status).label}
                          </div>
                          <div className={styles.historyCardDate}>
                            {order.createdAt && new Date(order.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
                          </div>
                        </div>
                        <div className={styles.historyCardAmountRight}>
                          <div className={styles.historyCardAmountLabel}>VOCÊ RECEBE</div>
                          <div className={styles.historyCardAmount}>
                            R$ {(order.walletDistribution?.storeAmount ||
                              (((order.totalValue || 0) - (order.deliveryFee || 0)) * 0.9)).toFixed(2)}
                          </div>
                        </div>
                      </div>

                      {/* SECÇÃO: Detalhes de Pagamento (5 valores) */}
                      <div className={styles.historyFinancial}>
                        <div className={styles.historyFinancialCell}>
                          <div className={styles.historyFinancialLabel}>VOCÊ RECEBE</div>
                          <div className={styles.historyFinancialValue} style={{ color: '#10b981' }}>
                            R$ {(order.walletDistribution?.storeAmount ||
                              (((order.totalValue || 0) - (order.deliveryFee || 0)) * 0.9)).toFixed(2)}
                          </div>
                          <div className={styles.historyFinancialSub}>(produto - taxa)</div>
                        </div>
                        <div className={styles.historyFinancialCell}>
                          <div className={styles.historyFinancialLabel}>🏢 TAXA APP</div>
                          <div className={styles.historyFinancialValue} style={{ color: '#fc5a8d' }}>
                            R$ {(order.walletDistribution?.appCommission ||
                              (((order.totalValue || 0) - (order.deliveryFee || 0)) * 0.1)).toFixed(2)}
                          </div>
                          <div className={styles.historyFinancialSub}>(comissão)</div>
                        </div>
                        <div className={styles.historyFinancialCell}>
                          <div className={styles.historyFinancialLabel}><Icon name="package" size={12} /> SUBTOTAL</div>
                          <div className={styles.historyFinancialValue} style={{ color: 'var(--drop-text-muted)' }}>
                            R$ {((order.totalValue || 0) - (order.deliveryFee || 0)).toFixed(2)}
                          </div>
                          <div className={styles.historyFinancialSub}>(produtos)</div>
                        </div>
                        <div className={styles.historyFinancialCell}>
                          <div className={styles.historyFinancialLabel}><Icon name="truck" size={12} /> ENTREGA</div>
                          <div className={styles.historyFinancialValue} style={{ color: 'var(--drop-warning)' }}>
                            R$ {(order.deliveryFee || 0).toFixed(2)}
                          </div>
                          <div className={styles.historyFinancialSub}>(taxa)</div>
                        </div>
                        <div className={styles.historyFinancialCell}>
                          <div className={styles.historyFinancialLabel}>CLIENTE PAGOU</div>
                          <div className={styles.historyFinancialValue} style={{ color: '#60A5FA' }}>
                            R$ {order.totalValue?.toFixed(2) || '0.00'}
                          </div>
                          <div className={styles.historyFinancialSub}>(total)</div>
                        </div>
                      </div>

                      {/* PRODUTOS */}
                      {order.products && order.products.length > 0 && (
                        <div className={styles.historyProducts}>
                          <div className={styles.historyProductsTitle}><Icon name="package" size={12} /> Produtos ({order.products.length}):</div>
                          <div className={styles.historyProductsGrid}>
                            {order.products.map((product: any, idx: number) => (
                              <div key={idx} className={styles.historyProductItem}>
                                <div>
                                  <span className={styles.historyProductQty}>{product.quantity}x</span>{' '}
                                  <span>{product.productName || 'Produto'}</span>
                                </div>
                                <div className={styles.historyProductPrice}>
                                  R$ {(product.price * product.quantity).toFixed(2)}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* BOTÃO */}
                      <div className={styles.historyCardFooter}>
                        <button
                          onClick={() => setDetalhesPedido(order)}
                          className={styles.btnMoreDetails}
                        >
                          <Icon name="clipboard" size={12} /> Mais Detalhes
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                {getFilteredHistoryOrders().length > historyLimit && (
                  <button
                    onClick={() => setHistoryLimit(n => n + 10)}
                    className={styles.btnMoreDetails}
                    style={{ margin: '20px auto 0', display: 'flex' }}
                  >
                    <Icon name="clipboard" size={12} /> Ver mais ({getFilteredHistoryOrders().length - historyLimit} restantes)
                  </button>
                )}
                </>
              )}
            </div>
          )}

          {/* ✅ FIX #6: Tab de Devoluções Pendentes */}
          {activeTab === 'returns' && (
            <div>
              <h2 className={styles.returnsTitle}><Icon name="package" size={16} /> Devoluções Pendentes</h2>
              {returnRequests.length === 0 ? (
                <div className={styles.emptyState}>
                  <div className={styles.emptyStateIcon}><Icon name="check-circle" size={24} /></div>
                  <div className={styles.emptyStateText}>Nenhuma devolução pendente</div>
                  <div style={{ fontSize: 13, marginTop: 8, opacity: 0.7 }}>Todas as devoluções foram processadas</div>
                </div>
              ) : (
                <div className={styles.ordersList}>
                  {returnRequests.map((request) => (
                    <div
                      key={request.deliveryId}
                      className={styles.returnCard}
                    >
                      <div className={styles.returnCardTop}>
                        <div>
                          <div className={styles.returnCardTitle}><Icon name="truck" size={14} /> Devolução Solicitada</div>
                          <div className={styles.returnCardOrder}>
                            Pedido: {request.orderId?.slice(-8) || 'N/A'}
                          </div>
                          <div className={styles.returnCardMotoboy}>
                            Motoboy: {request.motoboyId || 'ID'}
                          </div>
                        </div>
                        <div className={styles.returnBadge}>
                          <Icon name="clock" size={12} /> Aguardando<br />Confirmação
                        </div>
                      </div>

                      <div className={styles.returnInstructions}>
                        <div className={styles.returnInstructionsTitle}><Icon name="clipboard" size={12} /> Instruções</div>
                        <ul className={styles.returnInstructionsList}>
                          <li>O motoboy está retornando com o produto</li>
                          <li>Confirme o recebimento do produto</li>
                          <li>Insira o PIN fornecido e clique em confirmar</li>
                        </ul>
                      </div>

                      <div className={styles.returnPinSection}>
                        <label className={styles.returnPinLabel}>
                          <Icon name="lock" size={12} /> PIN de Devolução (6 dígitos)
                        </label>
                        <div className={styles.returnPinWrapper}>
                          <input
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

                      <button
                        onClick={() => handleConfirmReturn(request)}
                        disabled={!returnPinInputs[request.deliveryId] || returnPinInputs[request.deliveryId].length !== 6}
                        className={`${styles.btnConfirmReturn} ${returnPinInputs[request.deliveryId]?.length === 6 ? styles.btnConfirmReturnReady : styles.btnConfirmReturnDisabled}`}
                      >
                        ✓ Confirmar Devolução
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 🆕 ABA: CHAT PRÉ-COMPRA */}
          {activeTab === 'chat' && (
            <div className={styles.chatTabGrid}>
              {/* LISTA DE CONVERSAS - CARD SUPERIOR */}
              <div className={styles.chatListCard}>
                <ChatConversationList
                  filter={chatFilter as 'all' | 'product' | 'user'}
                  onSelectConversation={setSelectedConversationId}
                  selectedConversationId={selectedConversationId || undefined}
                  storeId={user?._id}
                />
              </div>

              {/* DETALHE DA CONVERSA - DIV SEPARADA EM BAIXO, 100% LARGURA */}
              <div className={styles.chatDetailCard}>
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
              </div>
            </div>
          )}

          </div>{/* /tabContent */}
        </main>{/* /mainContent */}

        {detalhesPedido && <DetalhesPedidoModal order={detalhesPedido} onClose={() => setDetalhesPedido(null)} token={token} />}

        {/* Modal de Rejeição */}
        {rejectModalOrderId && (
          <div className={styles.rejectOverlay}>
            <div className={styles.rejectDialog}>
              <div className={styles.rejectDialogHeader}>
                <h3 className={styles.rejectDialogTitle}><Icon name="x-circle" size={16} /> Rejeitar Pedido</h3>
                <button
                  onClick={() => setRejectModalOrderId(null)}
                  className={styles.rejectCloseBtn}
                >
                  ×
                </button>
              </div>

              <div>
                <label className={styles.rejectLabel}>Motivo da Rejeição</label>
                <div className={styles.rejectOptions}>
                  {[
                    { code: 'store_closed', label: 'Loja fechada' },
                    { code: 'store_busy', label: 'Loja muito ocupada' },
                    { code: 'not_available', label: 'Itens indisponíveis' },
                    { code: 'payment_issue', label: 'Problema de pagamento' },
                    { code: 'other', label: 'Outro motivo' },
                  ].map(option => (
                    <label key={option.code} className={styles.rejectOption}>
                      <input
                        type="radio"
                        name="reject-reason"
                        value={option.code}
                        checked={rejectReason === option.code}
                        onChange={e => setRejectReason(e.target.value)}
                      />
                      {option.label}
                    </label>
                  ))}
                </div>

                {rejectReason === 'other' && (
                  <textarea
                    value={rejectCustomReason}
                    onChange={e => setRejectCustomReason(e.target.value)}
                    placeholder="Descreva o motivo..."
                    className={styles.rejectTextarea}
                  />
                )}
              </div>

              <div className={styles.rejectBtnRow}>
                <button
                  onClick={() => setRejectModalOrderId(null)}
                  disabled={rejectLoading}
                  className={styles.btnRejectCancel}
                >
                  Cancelar
                </button>
                <button
                  onClick={handleRejectOrder}
                  disabled={rejectLoading}
                  className={styles.btnRejectConfirm}
                >
                  {rejectLoading ? 'Rejeitando...' : '✕ Rejeitar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </ProtectedRoute>
  );
}
