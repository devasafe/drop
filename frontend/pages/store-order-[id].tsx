import { useRouter } from 'next/router';
import { useEffect, useState, useContext } from 'react';
import api from '../lib/api';
import { useOrder, useDelivery } from '../hooks/useSync';
import { useSocket } from '../contexts/SocketContext';
import useChat from '../hooks/useChat';
import ChatPanel from '../components/ChatPanel';
import ChatInput from '../components/ChatInput';
import ContactInfo from '../components/delivery/ContactInfo';
import AuthContext from '../contexts/AuthContext';
import LoadingSkeleton from '../components/LoadingSkeleton';
import * as logger from '../lib/logger';

export default function StoreOrderStatus() {
  logger.log('Componente StoreOrderStatus montou');
  const router = useRouter();
  const { id } = router.query as { id?: string };
  const { order, loading: orderLoading, setOrder } = useOrder(id);
  const { delivery, loading: deliveryLoading, setDelivery } = useDelivery(order?.deliveryId);
  const { on } = useSocket();
  const { user, token } = useContext(AuthContext);
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');
  const [avaliando, setAvaliando] = useState(false);
  const [avaliado, setAvaliado] = useState(false);
  const [erroAvaliacao, setErroAvaliacao] = useState('');

  // CHAT
  const [conversationWithCustomer, setConversationWithCustomer] = useState<string | null>(null);
  const [conversationWithMotoboy, setConversationWithMotoboy] = useState<string | null>(null);
  const [activeChatTab, setActiveChatTab] = useState<'customer' | 'motoboy' | null>(null);
  const [chatLoading, setChatLoading] = useState(false);

  const {
    socket,
    isConnected,
    messages,
    joinConversation,
    leaveConversation,
    sendMessage,
    markAsRead,
    setUserTyping,
    typingUsers,
    error: chatError
  } = useChat({
    token: token || '',
    userId: user?._id || ''
  });

  useEffect(() => {
    if (!socket || !isConnected || !order || !user || conversationWithCustomer) return;

    const createConversationWithCustomer = async () => {
      try {
        setChatLoading(true);
        logger.log('[Chat] Criando conversa com cliente...');
        const response = await api.post('/api/chat/conversations', {
          type: 'loja_cliente',
          participant1: {
            userId: user._id,
            role: 'loja',
            name: user.name
          },
          participant2: {
            userId: order.customerObj._id,
            role: 'cliente',
            name: order.customerObj.name
          },
          orderId: order._id
        });

        logger.log('[Chat] Conversa com cliente criada:', response.data._id);
        setConversationWithCustomer(response.data._id);
        joinConversation(response.data._id);
      } catch (error) {
        logger.error('[Chat] Erro ao criar conversa com cliente:', error);
      } finally {
        setChatLoading(false);
      }
    };

    createConversationWithCustomer();
  }, [socket, isConnected, order, user, conversationWithCustomer, joinConversation]);

  useEffect(() => {
    if (!socket || !isConnected || !delivery?.driverId || !user || conversationWithMotoboy) return;

    const createConversationWithMotoboy = async () => {
      try {
        logger.log('[Chat] Criando conversa com motoboy...');
        const response = await api.post('/api/chat/conversations', {
          type: 'loja_motoboy',
          participant1: {
            userId: user._id,
            role: 'loja',
            name: user.name
          },
          participant2: {
            userId: delivery.driverId,
            role: 'motoboy',
            name: delivery.driverName || 'Motoboy'
          },
          deliveryId: delivery._id
        });

        logger.log('[Chat] Conversa com motoboy criada:', response.data._id);
        setConversationWithMotoboy(response.data._id);
      } catch (error) {
        logger.error('[Chat] Erro ao criar conversa com motoboy:', error);
      }
    };

    createConversationWithMotoboy();
  }, [socket, isConnected, delivery?.driverId, user, conversationWithMotoboy]);

  const handleSendMessage = async (text: string, attachments?: any[]) => {
    const conversationId = activeChatTab === 'customer' 
      ? conversationWithCustomer 
      : conversationWithMotoboy;

    if (!conversationId || !isConnected) return;

    try {
      await api.post('/api/chat/messages', {
        conversationId,
        text,
        attachments
      });

      sendMessage(text, attachments);
    } catch (error) {
      logger.error('Erro ao enviar mensagem:', error);
    }
  };

  const handleSwitchTab = (tab: 'customer' | 'motoboy') => {
    logger.log(`[Chat] Abrindo chat: ${tab}`, {
      conversationWithCustomer,
      conversationWithMotoboy,
      activeChatTab
    });

    const oldConversationId = activeChatTab === 'customer' 
      ? conversationWithCustomer 
      : conversationWithMotoboy;

    const newConversationId = tab === 'customer' 
      ? conversationWithCustomer 
      : conversationWithMotoboy;

    if (oldConversationId && oldConversationId !== newConversationId) {
      leaveConversation(oldConversationId);
    }

    if (newConversationId && newConversationId !== oldConversationId) {
      joinConversation(newConversationId);
    }

    setActiveChatTab(tab);
  };

  useEffect(() => {
    return () => {
      if (conversationWithCustomer) {
        leaveConversation(conversationWithCustomer);
      }
      if (conversationWithMotoboy) {
        leaveConversation(conversationWithMotoboy);
      }
    };
  }, [conversationWithCustomer, conversationWithMotoboy, leaveConversation]);

  // ✅ NOVO: Listeners diretos de socket na página
  useEffect(() => {
    if (!id) return;

    const handleOrderAccepted = (data: any) => {
      if (data.orderId === id) {
        logger.log('[Order] Loja aceitou:', data);
        setOrder((prev: any) => ({ ...prev, status: 'pago' }));
      }
    };

    const handleMotoboyAssigned = (data: any) => {
      if (data.orderId === id) {
        logger.log('[Order] Motoboy atribuído:', data);
        // Buscar dados atualizados da delivery
        if (order?.deliveryId) {
          api.get(`/deliveries/${order.deliveryId}`).then(res => {
            setDelivery(res.data);
          });
        }
      }
    };

    const handleDeliveryPicked = (data: any) => {
      if (data.orderId === id) {
        logger.log('[Order] Pedido retirado:', data);
        if (order?.deliveryId) {
          api.get(`/deliveries/${order.deliveryId}`).then(res => {
            setDelivery(res.data);
          });
        }
      }
    };

    const handleDeliveryCompleted = (data: any) => {
      if (data.deliveryId === order?.deliveryId) {
        logger.log('[Order] Entrega finalizada:', data);
        if (order?.deliveryId) {
          api.get(`/deliveries/${order.deliveryId}`).then(res => {
            setDelivery(res.data);
          });
        }
      }
    };

    const unsubOrderAccepted = on('order:accepted_by_store', handleOrderAccepted);
    const unsubMotoboyAssigned = on('motoboy:assigned', handleMotoboyAssigned);
    const unsubDeliveryPicked = on('delivery:picked', handleDeliveryPicked);
    const unsubDeliveryCompleted = on('delivery:completed', handleDeliveryCompleted);

    return () => {
      unsubOrderAccepted();
      unsubMotoboyAssigned();
      unsubDeliveryPicked();
      unsubDeliveryCompleted();
    };
  }, [id, order?.deliveryId, on, setOrder, setDelivery]);

  useEffect(() => {
    if (delivery && delivery.rating) setAvaliado(true);
  }, [delivery]);

  useEffect(() => {
    logger.log('[Order] Atualizando com novos dados:', { order, delivery });
  }, [order, delivery]);

  logger.log('Renderizando StoreOrderStatus', { order, delivery });
  if (!order) return <div style={{ padding: '40px 24px' }}><LoadingSkeleton variant="detail" /></div>;

  // Traduzir status português para UI
  const statusMap: Record<string, string> = {
    'criado': 'Pedido Criado',
    'pago': 'Pago (Aguardando loja aceitar)',
    'enviado': 'Entregue',
    'entregue': 'Entrega Finalizada',
    'cancelado': 'Cancelado',
    'rejeitado': 'Rejeitado'
  };

  const getStatusMessage = () => {
    if (!delivery) {
      return 'Aguardando motoboy aceitar a entrega...';
    }
    
    if (delivery.status === 'pending') {
      return 'Aguardando motoboy aceitar...';
    }
    if (delivery.status === 'assigned') {
      return 'Motoboy a caminho para a loja!';
    }
    if (delivery.status === 'picked') {
      return 'Motoboy retirou seu pedido! Siga para seu endereço.';
    }
    if (delivery.status === 'delivered') {
      return 'Entrega feita com sucesso! Por favor, avalie o atendimento:';
    }
    
    return 'Aguardando atualização...';
  };

  return (
    <div>
      <h1>Status do Pedido</h1>
      <p><b>ID:</b> {order._id}</p>
      <p><b>Status do Pedido:</b> {statusMap[order.status] || order.status}</p>
      <p><b>Status da Entrega:</b> {delivery?.status || 'Aguardando...'}</p>
      <p><b>Loja:</b> {order.storeName || order.storeId}</p>
      <ul>
        {order.products?.map((p: any) => (
          <li key={p.productId}>{p.name} — {p.quantity}x</li>
        ))}
      </ul>

      {/* Detalhes de Pagamento com 4 valores */}
      <div style={{marginTop:16, padding:12, backgroundColor:'#f0f9ff', borderRadius:8, border:'1px solid #b3d9ff'}}>
        <h3 style={{marginTop:0, marginBottom:12}}>Detalhes de Pagamento</h3>
        <div style={{display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:12, fontSize:12}}>
          <div>
            <span style={{fontWeight:600, color:'#10b981', fontSize:'11px', display:'block'}}>Valor Recebido</span>
            <div style={{fontWeight:700, color:'#10b981', fontSize:'14px', marginTop:'4px'}}>
              R$ {(order.walletDistribution?.storeAmount || 
                (((order.totalValue || 0) - (order.deliveryFee || 0)) * 0.9)).toFixed(2)}
            </div>
            <div style={{fontSize:'10px', color:'#999', marginTop:'2px'}}>(produto - taxa)</div>
          </div>
          <div>
            <span style={{fontWeight:600, color:'#333', fontSize:'11px', display:'block'}}>Valor Produto</span>
            <div style={{fontWeight:700, color:'#333', fontSize:'14px', marginTop:'4px'}}>
              R$ {((order.totalValue || 0) - (order.deliveryFee || 0)).toFixed(2)}
            </div>
            <div style={{fontSize:'10px', color:'#999', marginTop:'2px'}}>(subtotal)</div>
          </div>
          <div>
            <span style={{fontWeight:600, color:'#ff9800', fontSize:'11px', display:'block'}}>Taxa Entrega</span>
            <div style={{fontWeight:700, color:'#ff9800', fontSize:'14px', marginTop:'4px'}}>
              R$ {(order.deliveryFee || 0).toFixed(2)}
            </div>
            <div style={{fontSize:'10px', color:'#999', marginTop:'2px'}}>(app + motoboy)</div>
          </div>
          <div>
            <span style={{fontWeight:600, color:'#007bff', fontSize:'11px', display:'block'}}>Valor Total</span>
            <div style={{fontWeight:700, color:'#007bff', fontSize:'14px', marginTop:'4px'}}>
              R$ {order.totalValue?.toFixed(2) || '0.00'}
            </div>
            <div style={{fontSize:'10px', color:'#999', marginTop:'2px'}}>(você pagou)</div>
          </div>
        </div>
      </div>

      <div style={{marginTop:16, fontWeight:'bold', fontSize:16}}>{getStatusMessage()}</div>
      {delivery && delivery.pin && delivery.status !== 'pending' && delivery.status !== 'delivered' && (
        <div style={{marginTop:16, padding:12, background:'#e3f2fd', borderRadius:4}}>
          <b>PIN para retirada na loja:</b> <span style={{fontSize:24,letterSpacing:4, fontWeight:'bold', color:'#d32f2f'}}>{delivery.pin}</span>
        </div>
      )}
      {/* Debug: mostrar order e delivery */}
      <details style={{marginTop:24}}>
        <summary style={{cursor:'pointer', fontWeight:'bold'}}>Debug (clique para expandir)</summary>
        <pre style={{background:'#f6f6f6',padding:8,borderRadius:4,margin:'16px 0',fontSize:12}}>
          {JSON.stringify({ order, delivery }, null, 2)}
        </pre>
      </details>
      {/* Avaliação após entrega */}
      {delivery && delivery.status === 'delivered' && !avaliado && (
        <div style={{marginTop:24, maxWidth:400}}>
          <h3>Avalie o atendimento do motoboy:</h3>
          <div style={{fontSize:32, marginBottom:4}}>
            {[1,2,3,4,5].map(star => (
              <span
                key={star}
                style={{cursor:'pointer',marginRight:8, color: rating >= star ? '#FFD700' : '#ccc'}}
                onClick={() => setRating(star)}
              >★</span>
            ))}
          </div>
          {erroAvaliacao === 'É obrigatório adicionar estrelas para o motoboy.' && (
            <div style={{color:'red', marginBottom:8, fontWeight:'bold'}}>Selecione uma nota</div>
          )}
          <textarea
            placeholder="Deixe um comentário (opcional)"
            value={comment}
            onChange={e => setComment(e.target.value)}
            rows={3}
            style={{width:'100%', marginBottom:8}}
          />
          <button
            disabled={avaliando}
            style={{padding:'8px 16px', fontWeight:'bold', background:'#0070f3', color:'#fff', border:'none', borderRadius:4, cursor:'pointer'}}
            onClick={async () => {
              setErroAvaliacao('');
              if (rating === 0) {
                setErroAvaliacao('É obrigatório adicionar estrelas para o motoboy.');
                return;
              }
              setAvaliando(true);
              try {
                await api.post(`/deliveries/${delivery._id}/avaliar`, { rating, comment });
                setAvaliado(true);
              } catch (e: any) {
                setErroAvaliacao(e?.response?.data?.error || 'Erro ao enviar avaliação');
              }
              setAvaliando(false);
            }}
          >{avaliando ? 'Enviando...' : 'Enviar avaliação'}</button>
          {avaliando && <div style={{marginTop:8}}><span className="spinner" style={{display:'inline-block',width:24,height:24,border:'4px solid #ccc',borderTop:'4px solid #0070f3',borderRadius:'50%',animation:'spin 1s linear infinite'}}></span></div>}
          {erroAvaliacao && <div style={{color:'red', marginTop:8}}>{erroAvaliacao}</div>}
        </div>
      )}
      {delivery && delivery.status === 'delivered' && avaliado && (
        <div style={{marginTop:24, color:'#007a1f', fontWeight:'bold'}}>
          Obrigado pela sua avaliação!
        </div>
      )}

      {/* Chat com Cliente e Motoboy */}
      <div style={{ marginTop: '40px', paddingTop: '20px', borderTop: '2px solid #eee' }}>
        <h2 style={{ marginBottom: '20px' }}>Conversas</h2>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
          {/* Chat com Cliente */}
          <ContactInfo
            name={order.customerObj?.name || 'Cliente'}
            email={order.customerObj?.email}
            phone={order.customerObj?.phone}
            label="Cliente do Pedido"
            onChatClick={() => handleSwitchTab('customer')}
            isOpen={activeChatTab === 'customer'}
            conversationId={conversationWithCustomer}
            userId={user?._id}
            messages={messages}
            isLoading={chatLoading}
            typingUsers={typingUsers}
            onSendMessage={handleSendMessage}
            onMarkAsRead={async (messageId) => markAsRead(messageId)}
            onUserTyping={setUserTyping}
            isConnected={isConnected}
            chatError={chatError}
            onClose={() => setActiveChatTab(null)}
          />

          {/* Chat com Motoboy (se houver) */}
          {delivery?.driverId && (
            <ContactInfo
              name={delivery.driverName || 'Motoboy'}
              phone={delivery.driverPhone}
              label="Motoboy da Entrega"
              onChatClick={() => handleSwitchTab('motoboy')}
              isOpen={activeChatTab === 'motoboy'}
              conversationId={conversationWithMotoboy}
              userId={user?._id}
              messages={messages}
              isLoading={chatLoading}
              typingUsers={typingUsers}
              onSendMessage={handleSendMessage}
              onMarkAsRead={async (messageId) => markAsRead(messageId)}
              onUserTyping={setUserTyping}
              isConnected={isConnected}
              chatError={chatError}
              onClose={() => setActiveChatTab(null)}
            />
          )}
        </div>
      </div>
    </div>
  );
}
