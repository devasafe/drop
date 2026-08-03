import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';
import Icon from './Icon';
import { notify } from '../lib/notify';
import { useOverlay } from '../contexts/OverlayContext';
import { useDraggableFab } from './drop/useDraggableFab';
import { participantTypeFor } from '../lib/chatContacts';
import { ConversationView } from './drop/chat/ConversationView';
import { ChatComposer } from './drop/chat/ChatComposer';
import { ChatHeader } from './drop/chat/ChatHeader';
import { ChatTabBar } from './drop/chat/ChatTabBar';
import { ConversationList } from './drop/chat/ConversationList';
import type { Message, Conversation, ChatTab } from './drop/chat/types';

interface ChatWidgetProps {
  storeId?: string;
  conversationType?: 'user' | 'product';
  mode?: 'customer' | 'seller';
}

export default function ChatWidgetWithTabs({
  storeId,
  conversationType = 'user',
  mode = 'customer',
}: ChatWidgetProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [isMinimized, setIsMinimized] = useState(false);
  const [tabs, setTabs] = useState<ChatTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);
  const [messageText, setMessageText] = useState('');
  const [user, setUser] = useState<any>(null);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loadingConversations, setLoadingConversations] = useState(false);
  const [typingUsers, setTypingUsers] = useState<{ [conversationId: string]: string }>({});
  // "Nova conversa": cliente escolhe qualquer loja; motoboy/lojista escolhem
  // entre os contatos da entrega/pedidos ativos (GET /chat/contacts).
  const [newOpen, setNewOpen] = useState(false);
  const [contactList, setContactList] = useState<any[]>([]);
  const [storeList, setStoreList] = useState<any[]>([]);
  const [contactSearch, setContactSearch] = useState('');
  const [loadingContacts, setLoadingContacts] = useState(false);
  const { on, emit } = useSocket();
  const overlay = useOverlay();
  const fab = useDraggableFab({
    storageKey: 'chatFabPos',
    onTap: () => { setIsOpen(true); setIsMinimized(false); },
  });
  const typingTimeoutRef = useRef<{ [conversationId: string]: NodeJS.Timeout }>({});

  // O painel do chat só "cobre a tela" quando está aberto e não minimizado
  // (minimizado vira apenas a bolha flutuante). Reflete esse estado no overlay
  // manager pra abrir o chat fechar AccountMenu/drawer/sidebar, e vice-versa.
  const chatVisible = isOpen && !isMinimized;
  const chatVisibleRef = useRef(chatVisible);
  useEffect(() => { chatVisibleRef.current = chatVisible; }, [chatVisible]);
  useEffect(() => {
    if (chatVisible) overlay.open('chat');
    else overlay.close('chat');
    // overlay.open/close são estáveis (useCallback); depender só de chatVisible
    // evita loop de feedback.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    return () => overlay.close('chat');
  }, [chatVisible]);
  useEffect(() => {
    // Coerência: se OUTRO overlay assumiu o controle (ou o Esc fechou tudo)
    // enquanto o chat estava visível, minimiza o chat. Depende SÓ de
    // `overlay.active` (não de chatVisible): ao ABRIR o chat, `overlay.open`
    // ainda não refletiu o novo active neste render — se dependêssemos de
    // chatVisible, este efeito rodaria com o active velho (null) e minimizaria
    // o chat na hora (bug "não abre"). Lendo chatVisible por ref e reagindo só
    // à MUDANÇA de active, só minimizamos quando outro overlay realmente entra.
    if (chatVisibleRef.current && overlay.active !== 'chat') {
      setIsMinimized(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [overlay.active]);

  // Refs com o estado atual da janela (para o listener de mensagens saber se o
  // usuário já está vendo a conversa e não notificar à toa)
  const isOpenRef = useRef(isOpen);
  const isMinimizedRef = useRef(isMinimized);
  const activeTabIdRef = useRef(activeTabId);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);
  useEffect(() => { isMinimizedRef.current = isMinimized; }, [isMinimized]);
  useEffect(() => { activeTabIdRef.current = activeTabId; }, [activeTabId]);

  // Calcular total de mensagens não lidas
  const totalUnread = conversations.reduce((sum, conv) => sum + (conv.unreadCount || 0), 0);

  // Carregar usuário
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const userRaw = localStorage.getItem('user');
      setUser(userRaw ? JSON.parse(userRaw) : null);
    }
  }, []);

  // Registrar listeners de chat no socket singleton (via SocketContext)
  useEffect(() => {
    if (!user) return;

    const unsubs: Array<() => void> = [];

    unsubs.push(on('chat:new_message', (data: any) => {
      console.log('📨 Nova mensagem recebida:', data);

      // 🔔 Som + toast + pop-up — exceto se a mensagem é minha ou eu já estou
      // vendo exatamente essa conversa com a janela em foco.
      const isOwn = data.senderId === user.id;
      const viewingThis =
        isOpenRef.current &&
        !isMinimizedRef.current &&
        activeTabIdRef.current === data.conversationId &&
        typeof document !== 'undefined' && !document.hidden;
      if (!isOwn && !viewingThis) {
        notify({
          kind: 'message',
          title: data.senderName ? `Mensagem de ${data.senderName}` : 'Nova mensagem',
          body: data.text,
          tag: `msg-${data.conversationId}`,
        });
      }

      // Atualizar tabs
      setTabs((prevTabs) =>
        prevTabs.map((tab) =>
          tab._id === data.conversationId
            ? {
                ...tab,
                messages: [...tab.messages, {
                  _id: data._id,
                  senderId: data.senderId,
                  senderName: data.senderName,
                  text: data.text,
                  createdAt: data.timestamp || new Date().toISOString(),
                  timestamp: data.timestamp,
                  status: data.status || 'delivered',
                }],
                lastMessage: { text: data.text, senderName: data.senderName, createdAt: data.timestamp || new Date().toISOString() },
                lastMessageTime: data.timestamp,
              }
            : tab
        )
      );

      // 🟢 Atualizar conversas: mover para o topo e atualizar última mensagem
      setConversations((prevConvs) => {
        const updated = prevConvs.map((conv) =>
          conv._id === data.conversationId
            ? {
                ...conv,
                lastMessage: { text: data.text, senderName: data.senderName, createdAt: data.timestamp || new Date().toISOString() },
                lastMessageTime: data.timestamp,
              }
            : conv
        );
        
        // Mover conversa com mensagem nova para o topo
        const withMessage = updated.find(c => c._id === data.conversationId);
        const withoutMessage = updated.filter(c => c._id !== data.conversationId);
        
        if (withMessage) {
          return [withMessage, ...withoutMessage];
        }
        return updated;
      });
    }));

    unsubs.push(on('chat:new_conversation', (conversationData: any) => {
      console.log('📢 Nova conversa recebida:', conversationData);
      if (conversationData.type === 'suporte') return;
      // Converter para o formato da interface Conversation
      const participant = conversationData.participant1.userId === user.id
        ? conversationData.participant2 
        : conversationData.participant1;
      
      const newConversation: Conversation = {
        _id: conversationData._id,
        otherParticipantId: participant.userId,
        otherParticipantName: participant.name,
        otherParticipantRole: participant.role || 'cliente',
        lastMessage: conversationData.lastMessage || null,
        lastMessageTime: conversationData.lastMessageAt,
        unreadCount: conversationData.unreadCount?.[conversationData.participant1.userId === user.id ? 0 : 1] || 0,
        isActive: true,
      };
      
      // Adicionar ou atualizar conversa
      setConversations((prev) => {
        const exists = prev.find(c => c._id === newConversation._id);
        if (exists) {
          // Se já existe, atualizar e mover para o topo
          const updated = prev.map(c => c._id === newConversation._id ? newConversation : c);
          const withMessage = updated.find(c => c._id === newConversation._id);
          const withoutMessage = updated.filter(c => c._id !== newConversation._id);
          return [withMessage!, ...withoutMessage];
        }
        return [newConversation, ...prev];
      });
    }));

    unsubs.push(on('chat:conversation_deleted', (data: any) => {
      console.log('🗑️ Conversa deletada:', data.conversationId);
      // Remover conversa da lista
      setConversations((prev) => prev.filter(c => c._id !== data.conversationId));
      // Remover das abas abertas
      setTabs((prev) => prev.filter(tab => tab._id !== data.conversationId));
    }));

    // 🔄 Conversa reativada (quando foi deletada e outro usuário mandou mensagem)
    unsubs.push(on('chat:conversation_reactivated', (conversationData: any) => {
      console.log('🔄 Conversa reativada:', conversationData._id);
      // Converter para o formato da interface Conversation
      const participant = conversationData.participant1.userId === user.id 
        ? conversationData.participant2 
        : conversationData.participant1;
      
      const reactivatedConversation: Conversation = {
        _id: conversationData._id,
        otherParticipantId: participant.userId,
        otherParticipantName: participant.name,
        otherParticipantRole: participant.role || 'cliente',
        lastMessage: null,
        lastMessageTime: conversationData.lastMessageAt,
        unreadCount: conversationData.unreadCount ? (
          conversationData.participant1.userId === user.id 
            ? conversationData.unreadCount[0] 
            : conversationData.unreadCount[1]
        ) : 0,
        isActive: true,
      };
      
      // Adicionar conversa reativada à lista (vai aparecer no topo)
      setConversations((prev) => {
        const exists = prev.find(c => c._id === reactivatedConversation._id);
        if (exists) return prev;
        return [reactivatedConversation, ...prev];
      });
    }));

    // ✓✓ Mensagens lidas
    unsubs.push(on('chat:messages_read', (data: any) => {
      console.log('✓✓ Mensagens marcadas como lidas:', data.messageIds);
      setTabs((prev) =>
        prev.map((tab) =>
          tab._id === data.conversationId
            ? {
                ...tab,
                messages: tab.messages.map((msg) =>
                  data.messageIds.includes(msg._id) ? { ...msg, status: 'read', readAt: data.readAt } : msg
                )
              }
            : tab
        )
      );
    }));

    // ⌨️ Usuário digitando
    unsubs.push(on('chat:user_typing', (data: any) => {
      console.log('⌨️ Usuário digitando:', data.userId, 'em:', data.conversationId);
      const { userId, conversationId, isTyping } = data;
      
      // Não mostrar "Digitando..." para você mesmo
      if (userId === user?.id) {
        console.log('⌨️ (Você está digitando - não mostrando indicador)');
        return;
      }
      
      if (isTyping) {
        setTypingUsers((prev) => ({
          ...prev,
          [conversationId]: userId,
        }));
        
        // Limpar timeout anterior se existir
        if (typingTimeoutRef.current[conversationId]) {
          clearTimeout(typingTimeoutRef.current[conversationId]);
        }
        
        // Remover "digitando" após 3 segundos de inatividade
        typingTimeoutRef.current[conversationId] = setTimeout(() => {
          setTypingUsers((prev) => {
            const next = { ...prev };
            delete next[conversationId];
            return next;
          });
        }, 3000);
      } else {
        // Usuário parou de digitar
        setTypingUsers((prev) => {
          const next = { ...prev };
          delete next[conversationId];
          return next;
        });
        
        if (typingTimeoutRef.current[conversationId]) {
          clearTimeout(typingTimeoutRef.current[conversationId]);
        }
      }
    }));

    // ⌨️ Typing indicator
    unsubs.push(on('chat:user_typing', (data: any) => {
      if (data.userId !== user.id) {
        setTabs((prev) =>
          prev.map((tab) =>
            tab._id === data.conversationId
              ? { ...tab, isUserTyping: data.isTyping }
              : tab
          )
        );
      }
    }));

    // ✓ Delivery confirmation
    unsubs.push(on('chat:message_delivered', (data: any) => {
      setTabs((prev) =>
        prev.map((tab) =>
          tab.messages
            ? {
                ...tab,
                messages: tab.messages.map((msg) =>
                  msg._id === data.messageId ? { ...msg, status: 'delivered' } : msg
                )
              }
            : tab
        )
      );
    }));

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [user, on]);

  // Carregar conversas quando abre o widget
  useEffect(() => {
    if (!isOpen || !user) return;

    const loadConversations = async () => {
      setLoadingConversations(true);
      try {
        // Carregar AMBAS as rotas: pré-compra E conversas normais (motoboy, etc)
        const [prePurchaseResponse, conversationsResponse] = await Promise.all([
          api.get('/chat/conversations/pre-purchase/list').catch(() => ({ data: { conversations: [] } })),
          api.get('/chat/conversations').catch(() => ({ data: { conversations: [] } }))
        ]);

        console.log('📋 Conversas pré-compra:', prePurchaseResponse.data);
        console.log('📋 Conversas gerais:', conversationsResponse.data);

        // Combinar ambas as listas, excluindo tickets de suporte
        const allConversations = [
          ...(prePurchaseResponse.data?.conversations || []),
          ...(conversationsResponse.data?.conversations || [])
        ].filter((conv: any) => conv.type !== 'suporte');

        // Mapear para o formato esperado
        const mappedConversations = allConversations.map((conv: any) => {
          // Para pré-compra, usar otherParticipant
          // Para conversas normais, calcular qual é o outro participante
          let otherParticipantId = '';
          let otherParticipantName = '';
          let otherParticipantRole = 'cliente';

          if (conv.otherParticipant) {
            // Formato pré-compra
            otherParticipantId = conv.otherParticipant?.userId || '';
            otherParticipantName = conv.otherParticipant?.name || '';
            otherParticipantRole = conv.otherParticipant?.role || 'lojista';
          } else if (conv.participant1 && conv.participant2) {
            // Formato conversa normal - calcular qual é o outro
            const isParticipant1 = conv.participant1.userId === user.id;
            const other = isParticipant1 ? conv.participant2 : conv.participant1;
            otherParticipantId = other.userId;
            otherParticipantName = other.name;
            otherParticipantRole = other.role || 'cliente';
          }

          return {
            _id: conv._id,
            otherParticipantId,
            otherParticipantName,
            otherParticipantRole: otherParticipantRole as 'lojista' | 'motoboy' | 'cliente',
            lastMessage: conv.lastMessage,
            lastMessageTime: conv.lastMessage?.createdAt || conv.lastMessageAt,
            unreadCount: conv.unreadCount || 0,
            isActive: conv.isActive || true,
          };
        });

        // Remover duplicatas baseado em otherParticipantId
        // Manter a conversa com a mensagem mais recente
        const uniqueConversations: { [key: string]: any } = {};
        mappedConversations.forEach((conv) => {
          const key = conv.otherParticipantId;
          if (!uniqueConversations[key] || 
              (conv.lastMessageTime && new Date(conv.lastMessageTime) > new Date(uniqueConversations[key].lastMessageTime || 0))) {
            uniqueConversations[key] = conv;
          }
        });

        const dedupedConversations = Object.values(uniqueConversations);
        setConversations(dedupedConversations);
        
        // Salvar no localStorage
        if (typeof window !== 'undefined') {
          localStorage.setItem(`chat_conversations_${user.id}`, JSON.stringify(dedupedConversations));
        }
      } catch (err) {
        console.error('❌ Erro ao carregar conversas:', err);
        // Carregar do localStorage como fallback
        if (typeof window !== 'undefined') {
          const cached = localStorage.getItem(`chat_conversations_${user.id}`);
          if (cached) {
            setConversations(JSON.parse(cached));
          }
        }
      } finally {
        setLoadingConversations(false);
      }
    };

    loadConversations();
  }, [isOpen, user]);

  const openChatWithStore = useCallback(async (
    participantId: string,
    participantName: string,
    participantRole: 'lojista' | 'motoboy' | 'cliente',
    participantType?: 'store' | 'customer' | 'motoboy', // Novo parâmetro para diferenciar
  ) => {
    if (!user) {
      console.error('❌ Sem usuário');
      return;
    }

    console.log('🔍 openChatWithStore called:', { participantId, participantName, participantRole, participantType, user: user.id });

    const existingTab = tabs.find((tab) => tab.otherParticipantId === participantId);
    if (existingTab) {
      console.log('📌 Tab já existe, ativando...');
      setActiveTabId(existingTab._id);
      return;
    }

    console.log('🆕 Criando nova conversa com:', participantName);

    try {
      let response;

      // Detectar role do usuário atual
      const currentRole = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}').role : 'cliente';

      if (participantType === 'customer') {
        // Chat com cliente/usuário: usar rota genérica de conversas
        // Tipo de conversa depende do role do usuário atual
        const conversationType = currentRole === 'motoboy' ? 'motoboy_cliente' : 'loja_cliente';
        
        console.log('📡 Fazendo POST para /chat/conversations (cliente)');
        console.log('   Enviando:', { type: conversationType, otherParticipantId: participantId });
        response = await api.post('/chat/conversations', {
          type: conversationType,
          otherParticipantId: participantId,
        });
      } else if (participantType === 'store' && currentRole === 'motoboy') {
        // Chat motoboy com loja: usar rota genérica com tipo loja_motoboy
        console.log('📡 Fazendo POST para /chat/conversations (motoboy→loja)');
        console.log('   Enviando:', { type: 'loja_motoboy', otherParticipantId: participantId });
        response = await api.post('/chat/conversations', {
          type: 'loja_motoboy',
          otherParticipantId: participantId,
        });
      } else if (participantType === 'motoboy') {
        // Chat lojista → motoboy (participante é userId do motoboy)
        console.log('📡 Fazendo POST para /chat/conversations (lojista→motoboy)');
        response = await api.post('/chat/conversations', {
          type: 'loja_motoboy',
          otherParticipantId: participantId,
        });
      } else {
        // Chat com loja (padrão pré-compra): usar rota de pré-compra
        console.log('📡 Fazendo POST para /chat/conversations/pre-purchase (loja)');
        response = await api.post('/chat/conversations/pre-purchase', {
          storeId: participantId,
          conversationType: 'user',
        });
      }

      const conversation = response.data;
      console.log('✅ Conversa criada/obtida:', conversation);

      const newTab: ChatTab = {
        _id: conversation._id,
        otherParticipantId: participantId,
        otherParticipantName: participantName,
        otherParticipantRole: participantRole,
        messages: [],
        isLoading: true,
        unreadCount: 0,
        isActive: true,
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(conversation._id);

      try {
        const messagesResponse = await api.get(
          `/chat/conversations/${conversation._id}/messages`,
        );
        console.log('📨 Mensagens carregadas:', messagesResponse.data);

        // Garantir que todas as mensagens têm um status
        const normalizedMessages = (messagesResponse.data?.messages || messagesResponse.data || []).map((msg: any) => ({
          ...msg,
          status: msg.status || 'read', // Padrão: se não tiver status, considerar como lida
        }));

        setTabs((prev) =>
          prev.map((tab) =>
            tab._id === conversation._id
              ? {
                  ...tab,
                  messages: normalizedMessages,
                  isLoading: false,
                }
              : tab
          )
        );
      } catch (err) {
        console.error('❌ Erro ao carregar mensagens:', err);
        setTabs((prev) =>
          prev.map((tab) =>
            tab._id === conversation._id
              ? { ...tab, isLoading: false }
              : tab
          )
        );
      }

      emit('chat:join', {
        conversationId: conversation._id,
        userId: user.id,
      });
    } catch (err: any) {
      console.error('❌ Erro ao abrir chat:', err?.message);
    }
  }, [user, tabs, conversationType, emit]);

  // Escutar evento global
  useEffect(() => {
    console.log('📡 [ChatWidgetWithTabs] Registrando listener de evento openChat...');
    
    const handleOpenChatEvent = (event: any) => {
      const { storeId: eventStoreId, participantId, storeName, participantName, role, type } = event.detail;
      const id = eventStoreId || participantId;
      const name = storeName || participantName || 'Contato';
      
      console.log('🎯 [EVENT LISTENER] Evento recebido:', { id, name, role, type, eventDetail: event.detail });
      console.log('🎯 [EVENT LISTENER] User atual:', user);
      console.log('🎯 [EVENT LISTENER] Mode:', mode);
      console.log('🎯 [EVENT LISTENER] isOpen:', isOpen);
      console.log('🎯 [EVENT LISTENER] isMinimized:', isMinimized);
      
      if (!user) {
        console.error('❌ User não está carregado ainda!');
        return;
      }
      
      console.log('✅ [EVENT LISTENER] User carregado, abrindo chat com:', { id, name, role, type });
      
      // Abre o widget e chama a função de chat
      setIsOpen(true);
      setIsMinimized(false);
      
      // Chama openChatWithStore de forma assíncrona pra garantir que widget tá visível
      setTimeout(() => {
        openChatWithStore(id, name, role || 'lojista', type);
      }, 100);
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('openChat', handleOpenChatEvent);
      console.log('✅ [ChatWidgetWithTabs] Listener registrado com sucesso');
    }
    return () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('openChat', handleOpenChatEvent);
        console.log('🧹 [ChatWidgetWithTabs] Listener removido');
      }
    };
  }, [user, openChatWithStore, isOpen, isMinimized]);

  // 🔵 Função para marcar mensagens como lidas (apenas atualiza estado local)
  const markMessagesAsRead = async (conversationId: string) => {
    try {
      // 🟢 Atualizar estado local para mudar cor das mensagens imediatamente
      setTabs((prevTabs) =>
        prevTabs.map((tab) =>
          tab._id === conversationId
            ? {
                ...tab,
                messages: tab.messages.map((msg) =>
                  msg.senderId !== user?.id && msg.status !== 'read'
                    ? { ...msg, status: 'read' }
                    : msg
                ),
                unreadCount: 0,
              }
            : tab
        )
      );

      // Atualizar conversas para zerar unreadCount
      setConversations((prevConvs) =>
        prevConvs.map((conv) =>
          conv._id === conversationId
            ? { ...conv, unreadCount: 0 }
            : conv
        )
      );

      console.log('✅ Mensagens marcadas como lidas no frontend:', conversationId);
    } catch (err) {
      console.error('❌ Erro ao marcar como lido:', err);
    }
  };

  const sendMessage = async () => {
    if (!messageText.trim() || !activeTabId || !user) return;

    const activeTab = tabs.find((t) => t._id === activeTabId);
    if (!activeTab) return;

    const text = messageText.trim();
    setMessageText('');

    // Parar de enviar evento de digitação
    emit('chat:typing', {
      conversationId: activeTabId,
      isTyping: false,
    });

    try {
      await api.post(`/chat/conversations/${activeTabId}/messages`, {
        text,
        senderId: user.id,
        senderName: user.name,
      });

      // 🔵 Marcar como lido ao enviar mensagem
      await markMessagesAsRead(activeTabId);

      emit('chat:send_message', {
        conversationId: activeTabId,
        text,
        senderId: user.id,
        senderName: user.name,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      console.error('❌ Erro ao enviar mensagem:', err);
      setMessageText(text);
    }
  };

  // ⌨️ Emitir evento de digitação com debounce
  const handleMessageInputChange = (text: string) => {
    setMessageText(text);

    if (!activeTabId) return;

    emit('chat:typing', {
      conversationId: activeTabId,
      isTyping: text.trim().length > 0,
    });
  };

  const closeTab = (tabId: string) => {
    const newTabs = tabs.filter((t) => t._id !== tabId);
    setTabs(newTabs);

    if (activeTabId === tabId) {
      setActiveTabId(newTabs.length > 0 ? newTabs[0]._id : null);
    }
  };

  const closeConversation = async (conversationId: string) => {
    try {
      // Deletar no backend
      await api.delete(`/chat/conversations/${conversationId}`);
      console.log('✅ Conversa deletada no backend:', conversationId);
    } catch (err) {
      console.error('❌ Erro ao deletar conversa:', err);
    }
    
    // Remover da lista de conversas
    setConversations((prev) => prev.filter((c) => c._id !== conversationId));
    
    // Fechar a aba se estiver aberta
    closeTab(conversationId);
    
    // Atualizar localStorage
    if (typeof window !== 'undefined') {
      const cached = localStorage.getItem(`chat_conversations_${user?.id}`);
      if (cached) {
        const convos = JSON.parse(cached);
        const filtered = convos.filter((c: any) => c._id !== conversationId);
        localStorage.setItem(`chat_conversations_${user?.id}`, JSON.stringify(filtered));
      }
    }
    
    console.log('🗑️ Conversa removida:', conversationId);
  };

  const openConversation = async (conversation: Conversation) => {
    console.log('🔍 [Widget] Abrindo conversa existente:', conversation._id);
    
    // 🟢 Limpar unreadCount quando abre a conversa
    setConversations((prev) =>
      prev.map((conv) =>
        conv._id === conversation._id
          ? { ...conv, unreadCount: 0 }
          : conv
      )
    );
    
    const existingTab = tabs.find((tab) => tab._id === conversation._id);
    if (existingTab) {
      console.log('📌 Tab já existe, ativando...');
      setActiveTabId(existingTab._id);
      emit('chat:join', {
        conversationId: conversation._id,
        userId: user.id,
      });
      console.log('📨 [Widget] Emitido chat:join para sala:', `conversation:${conversation._id}`);
      return;
    }

    try {
      const newTab: ChatTab = {
        ...conversation,
        messages: [],
        isLoading: true,
      };

      setTabs((prev) => [...prev, newTab]);
      setActiveTabId(conversation._id);

      try {
        const messagesResponse = await api.get(
          `/chat/conversations/${conversation._id}/messages`,
        );
        console.log('📨 Mensagens carregadas:', messagesResponse.data);

        // Garantir que todas as mensagens têm um status
        const normalizedMessages = (messagesResponse.data?.messages || messagesResponse.data || []).map((msg: any) => ({
          ...msg,
          status: msg.status || 'read', // Padrão: se não tiver status, considerar como lida
        }));

        setTabs((prev) =>
          prev.map((tab) =>
            tab._id === conversation._id
              ? {
                  ...tab,
                  messages: normalizedMessages,
                  isLoading: false,
                }
              : tab
          )
        );
      } catch (err) {
        console.error('❌ Erro ao carregar mensagens:', err);
        setTabs((prev) =>
          prev.map((tab) =>
            tab._id === conversation._id
              ? { ...tab, isLoading: false }
              : tab
          )
        );
      }

      emit('chat:join', {
        conversationId: conversation._id,
        userId: user.id,
      });
      console.log('📨 [Widget] Emitido chat:join para sala:', `conversation:${conversation._id}`);
    } catch (err) {
      console.error('❌ Erro ao abrir conversa:', err);
    }
  };

  // Carrega contatos/lojas quando abre "Nova conversa".
  useEffect(() => {
    if (!newOpen || !user) return;
    const role = user.activeRole || user.role;
    setLoadingContacts(true);
    if (role === 'cliente') {
      api.get('/stores')
        .then((r) => setStoreList(Array.isArray(r.data) ? r.data : (r.data?.stores || [])))
        .catch(() => setStoreList([]))
        .finally(() => setLoadingContacts(false));
    } else {
      api.get('/chat/contacts')
        .then((r) => setContactList(r.data?.contacts || []))
        .catch(() => setContactList([]))
        .finally(() => setLoadingContacts(false));
    }
  }, [newOpen, user]);

  const startWithContact = (c: any) => {
    setNewOpen(false);
    setIsOpen(true);
    setIsMinimized(false);
    openChatWithStore(c.id, c.name, c.role, participantTypeFor(c));
  };
  const startWithStore = (s: any) => {
    setNewOpen(false);
    setIsOpen(true);
    setIsMinimized(false);
    openChatWithStore(s._id || s.id, s.name, 'lojista', 'store');
  };

  const isCustomerRole = (user?.activeRole || user?.role) === 'cliente';

  const activeTab = tabs.find((t) => t._id === activeTabId);

  return (
    <>
      {/* Botão de abrir (arrastável) */}
      {(!isOpen || isMinimized) && (
        <div style={{ ...fab.style, fontFamily: "'Inter', sans-serif" }} {...fab.pointerHandlers}>
          <button
            onClick={() => {
              if (fab.movedRef.current) return; // foi arrasto, não abre
              setIsOpen(true);
              setIsMinimized(false);
            }}
            style={{
              backgroundColor: '#6C2BD9',
              color: 'white',
              border: 'none',
              borderRadius: '50%',
              width: 56,
              height: 56,
              fontSize: 24,
              cursor: 'pointer',
              boxShadow: '0 4px 16px rgba(108,43,217,0.45)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.25s ease',
            }}
            title="Abrir chat"
          >
            <Icon name="chat" size={24} />
          </button>
          {/* Badge de notificação */}
          {totalUnread > 0 && (
            <div style={{
              position: 'absolute',
              top: -8,
              right: -8,
              backgroundColor: '#6C2BD9',
              color: 'white',
              borderRadius: '50%',
              width: 22,
              height: 22,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 11,
              fontWeight: 700,
              boxShadow: '0 0 12px rgba(108,43,217,0.5)',
            }}>
              {totalUnread > 99 ? '99+' : totalUnread}
            </div>
          )}
        </div>
      )}

      {/* Janela */}
      {isOpen && !isMinimized && (
        <div style={{
          position: 'fixed',
          bottom: 20,
          right: 20,
          zIndex: 50,
          fontFamily: "'Inter', sans-serif",
          backgroundColor: '#111111',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(108,43,217,0.15)',
          width: 'min(384px, calc(100vw - 40px))',
          height: 420,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <ChatHeader
            title={activeTab?.otherParticipantName ?? 'Conversas'}
            subtitle={
              activeTab
                ? (activeTab.otherParticipantRole === 'lojista' ? 'Loja' :
                   activeTab.otherParticipantRole === 'motoboy' ? 'Motoboy' :
                   'Cliente')
                : undefined
            }
            onMinimize={async () => {
              if (activeTabId) await markMessagesAsRead(activeTabId);
              setIsMinimized(true);
            }}
            onBack={tabs.length > 0 ? () => setActiveTabId(null) : undefined}
          />

          {!isMinimized && (
            <>
              {/* Abas */}
              <ChatTabBar
                tabs={tabs}
                activeTabId={activeTabId}
                onSelect={setActiveTabId}
                onClose={closeTab}
              />

              {/* Conteúdo */}
              {tabs.length === 0 || activeTabId === null ? (
                newOpen ? (
                  <div style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    overflow: 'auto',
                    padding: 12,
                    backgroundColor: '#0A0A0A',
                  }}>
                    <button
                      type="button"
                      onClick={() => setNewOpen(false)}
                      style={{
                        background: 'rgba(255,255,255,0.06)',
                        border: '1px solid rgba(108,43,217,0.3)',
                        color: '#fff',
                        borderRadius: 10,
                        padding: '9px 12px',
                        fontSize: 13,
                        fontWeight: 600,
                        cursor: 'pointer',
                        marginBottom: 10,
                        flexShrink: 0,
                        fontFamily: "'Inter', sans-serif",
                      }}
                    >
                      ← Conversas
                    </button>
                    {isCustomerRole ? (
                      <>
                        <input
                          type="text"
                          placeholder="Buscar loja..."
                          value={contactSearch}
                          onChange={(e) => setContactSearch(e.target.value)}
                          style={{ border: '1px solid rgba(255,255,255,0.07)', borderRadius: 8, padding: '8px 12px', fontSize: 13, background: '#161616', color: 'rgba(255,255,255,0.92)', outline: 'none', marginBottom: 8, flexShrink: 0 }}
                        />
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                          {loadingContacts ? (
                            <div style={{ margin: 'auto', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Carregando lojas...</div>
                          ) : (
                            storeList
                              .filter((s) => (s.name || '').toLowerCase().includes(contactSearch.toLowerCase()))
                              .slice(0, 40)
                              .map((s) => (
                                <div key={s._id || s.id} onClick={() => startWithStore(s)} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
                                  <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>{s.name}</div>
                                </div>
                              ))
                          )}
                          {!loadingContacts && storeList.length === 0 && (
                            <div style={{ margin: 'auto', color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center', paddingTop: 20 }}>Nenhuma loja disponível</div>
                          )}
                        </div>
                      </>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        {loadingContacts ? (
                          <div style={{ margin: 'auto', color: 'rgba(255,255,255,0.35)', fontSize: 13 }}>Carregando contatos...</div>
                        ) : contactList.length === 0 ? (
                          <div style={{ margin: 'auto', color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center', paddingTop: 20 }}>
                            Nenhum contato disponível agora.<br />Aparecem os participantes das entregas/pedidos ativos.
                          </div>
                        ) : (
                          contactList.map((c) => (
                            <div key={c.id} onClick={() => startWithContact(c)} style={{ padding: '10px 12px', borderRadius: 10, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)', cursor: 'pointer' }}>
                              <div style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.92)' }}>{c.name}</div>
                              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>
                                {[c.context, c.role === 'lojista' ? 'Loja' : c.role === 'motoboy' ? 'Motoboy' : 'Cliente'].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    )}
                  </div>
                ) : (
                  <ConversationList
                    conversations={conversations}
                    loading={loadingConversations}
                    onSelect={openConversation}
                    onNew={() => setNewOpen(true)}
                    onRemove={(c) => closeConversation(c._id)}
                  />
                )
              ) : activeTab ? (
                <>
                  {/* Mensagens */}
                  <ConversationView
                    messages={activeTab.messages}
                    loading={activeTab.isLoading}
                    currentUserId={user.id}
                    typingName={typingUsers[activeTabId || ''] ? 'alguém' : undefined}
                  />

                  {/* Input */}
                  <ChatComposer value={messageText} onChange={handleMessageInputChange} onSend={sendMessage} />
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </>
              ) : null}
            </>
          )}
        </div>
      )}
    </>
  );
}
