import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../lib/api';
import { useSocket } from '../contexts/SocketContext';
import Icon from './Icon';
import { notify } from '../lib/notify';

interface Message {
  _id?: string;
  senderId: string;
  senderName?: string;
  text: string;
  createdAt: string;
  timestamp?: string;
  status?: 'sent' | 'delivered' | 'read';
}

interface Conversation {
  _id: string;
  otherParticipantId: string;
  otherParticipantName: string;
  otherParticipantRole: 'lojista' | 'motoboy' | 'cliente';
  lastMessage?: { text: string; senderName: string; createdAt: string } | null;
  lastMessageTime?: string;
  unreadCount: number;
  isActive: boolean;
}

interface ChatTab extends Conversation {
  messages: Message[];
  isLoading: boolean;
  isUserTyping?: boolean;
}

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
  const { on, emit } = useSocket();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<{ [conversationId: string]: NodeJS.Timeout }>({});

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

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [tabs, activeTabId]);

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
    participantType?: 'store' | 'customer', // Novo parâmetro para diferenciar
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

  const activeTab = tabs.find((t) => t._id === activeTabId);

  return (
    <div style={{ position: 'fixed', bottom: 20, right: 20, zIndex: 50, fontFamily: "'Inter', sans-serif" }}>
      {/* Botão de abrir */}
      {(!isOpen || isMinimized) && (
        <div style={{ position: 'relative' }}>
          <button
            onClick={() => {
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
          backgroundColor: '#111111',
          borderRadius: 16,
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(108,43,217,0.15)',
          width: 384,
          height: 420,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{
            background: 'linear-gradient(135deg, #6C2BD9 0%, #8B5CF6 100%)',
            color: 'white',
            padding: '12px 16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexShrink: 0,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flex: 1 }}>
              {/* Botão voltar se estiver vendo uma aba (conversas abertas) */}
              {tabs.length > 0 && (
                <button
                  onClick={() => setActiveTabId(null)}
                  title="Voltar para conversas"
                  style={{
                    background: 'rgba(255,255,255,0.15)',
                    color: 'white',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '4px 8px',
                    fontSize: 14,
                    borderRadius: 6,
                    transition: 'background 0.2s',
                  }}
                >
                  ←
                </button>
              )}
              <div>
                {activeTabId && tabs.length > 0 ? (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>
                      {tabs.find(t => t._id === activeTabId)?.otherParticipantName}
                    </div>
                    <div style={{ fontSize: 11, opacity: 0.8, marginTop: 1 }}>
                      {tabs.find(t => t._id === activeTabId)?.otherParticipantRole === 'lojista' ? 'Loja' :
                       tabs.find(t => t._id === activeTabId)?.otherParticipantRole === 'motoboy' ? 'Motoboy' :
                       'Cliente'}
                    </div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize: 15, fontWeight: 700, fontFamily: "'Space Grotesk', sans-serif" }}>Chat DROP</div>
                    <div style={{ fontSize: 11, opacity: 0.8, marginTop: 1 }}>
                      {tabs.length} conversa{tabs.length !== 1 ? 's' : ''}
                    </div>
                  </>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <button
                onClick={async () => {
                  if (activeTabId) await markMessagesAsRead(activeTabId);
                  setIsMinimized(true);
                }}
                style={{
                  background: 'rgba(255,255,255,0.15)',
                  color: 'white',
                  border: 'none',
                  cursor: 'pointer',
                  width: 30, height: 30,
                  borderRadius: 6,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16,
                  transition: 'background 0.2s',
                }}
                title="Minimizar"
              >
                −
              </button>
            </div>
          </div>

          {!isMinimized && (
            <>
              {/* Abas */}
              {tabs.length > 0 && (
                <div style={{
                  display: 'flex',
                  gap: 4,
                  backgroundColor: '#161616',
                  borderBottom: '1px solid rgba(255,255,255,0.07)',
                  overflowX: 'auto',
                  padding: '6px 8px',
                }}>
                  {tabs.map((tab) => (
                    <div
                      key={tab._id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 4,
                        padding: '4px 10px',
                        borderRadius: 6,
                        cursor: 'pointer',
                        fontSize: 12,
                        whiteSpace: 'nowrap',
                        backgroundColor: activeTabId === tab._id
                          ? 'rgba(108,43,217,0.2)'
                          : tab.unreadCount > 0
                            ? 'rgba(108,43,217,0.1)'
                            : 'rgba(255,255,255,0.04)',
                        border: activeTabId === tab._id
                          ? '1px solid rgba(108,43,217,0.5)'
                          : tab.unreadCount > 0
                            ? '1px solid rgba(108,43,217,0.25)'
                            : '1px solid rgba(255,255,255,0.07)',
                        color: activeTabId === tab._id
                          ? '#fff'
                          : 'rgba(255,255,255,0.55)',
                        fontWeight: tab.unreadCount > 0 ? 600 : 400,
                      }}
                      onClick={() => setActiveTabId(tab._id)}
                    >
                      <span>
                        {tab.otherParticipantName.substring(0, 12)}
                        {tab.unreadCount > 0 && (
                          <span style={{
                            marginLeft: 4,
                            backgroundColor: '#6C2BD9',
                            color: 'white',
                            fontSize: 9,
                            padding: '1px 5px',
                            borderRadius: 999,
                            fontWeight: 700,
                          }}>
                            {tab.unreadCount}
                          </span>
                        )}
                      </span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          closeTab(tab._id);
                        }}
                        style={{
                          background: 'transparent',
                          border: 'none',
                          cursor: 'pointer',
                          padding: 0,
                          fontSize: 11,
                          color: 'rgba(255,255,255,0.3)',
                          lineHeight: 1,
                        }}
                        title="Fechar aba"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                </div>
              )}

              {/* Conteúdo */}
              {tabs.length === 0 || activeTabId === null ? (
                <div style={{
                  flex: 1,
                  display: 'flex',
                  flexDirection: 'column',
                  overflow: 'auto',
                  padding: 12,
                  backgroundColor: '#0A0A0A',
                }}>
                  {loadingConversations ? (
                    <div style={{ margin: 'auto', color: 'rgba(255,255,255,0.35)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#6C2BD9', animation: 'spin 0.7s linear infinite' }} />
                      Carregando conversas...
                    </div>
                  ) : conversations.length === 0 ? (
                    <div style={{
                      margin: 'auto',
                      textAlign: 'center',
                      color: 'rgba(255,255,255,0.35)',
                    }}>
                      <div style={{ fontSize: 36, marginBottom: 12, opacity: 0.4 }}><Icon name="chat" size={28} /></div>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>Nenhuma conversa</p>
                      <p style={{ fontSize: 11 }}>
                        Clique em "Chat com a loja" nos produtos
                      </p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, marginBottom: 6, color: 'rgba(255,255,255,0.35)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                        Conversas
                      </div>
                      {conversations.map((conv) => {
                        const hasUnread = conv.unreadCount > 0;
                        return (
                        <div
                          key={conv._id}
                          style={{
                            padding: '10px 12px',
                            borderRadius: 10,
                            background: hasUnread ? 'rgba(108,43,217,0.1)' : 'rgba(255,255,255,0.03)',
                            border: hasUnread ? '1px solid rgba(108,43,217,0.3)' : '1px solid rgba(255,255,255,0.06)',
                            cursor: 'pointer',
                            transition: 'all 0.15s ease',
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                          }}
                          onMouseOver={(e) => {
                            (e.currentTarget as HTMLElement).style.background = hasUnread
                              ? 'rgba(108,43,217,0.15)'
                              : 'rgba(255,255,255,0.06)';
                          }}
                          onMouseOut={(e) => {
                            (e.currentTarget as HTMLElement).style.background = hasUnread
                              ? 'rgba(108,43,217,0.1)'
                              : 'rgba(255,255,255,0.03)';
                          }}
                        >
                          <div
                            onClick={() => openConversation(conv)}
                            style={{ flex: 1 }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 3, color: 'rgba(255,255,255,0.92)' }}>
                              {conv.otherParticipantName}
                            </div>
                            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginBottom: conv.unreadCount > 0 ? 6 : 0 }}>
                              {conv.lastMessage?.text
                                ? conv.lastMessage.text.substring(0, 45) + (conv.lastMessage.text.length > 45 ? '...' : '')
                                : 'Nenhuma mensagem'}
                            </div>
                            {conv.unreadCount > 0 && (
                              <div style={{
                                background: '#6C2BD9',
                                color: 'white',
                                fontSize: 10,
                                padding: '2px 8px',
                                borderRadius: 999,
                                display: 'inline-block',
                                fontWeight: 700,
                              }}>
                                {conv.unreadCount} nova{conv.unreadCount !== 1 ? 's' : ''}
                              </div>
                            )}
                          </div>
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              closeConversation(conv._id);
                            }}
                            style={{
                              background: 'transparent',
                              border: 'none',
                              cursor: 'pointer',
                              padding: '2px 6px',
                              fontSize: 14,
                              color: 'rgba(255,255,255,0.25)',
                              marginLeft: 8,
                              lineHeight: 1,
                              transition: 'color 0.2s',
                            }}
                            onMouseEnter={e => { e.currentTarget.style.color = '#EF4444'; }}
                            onMouseLeave={e => { e.currentTarget.style.color = 'rgba(255,255,255,0.25)'; }}
                            title="Fechar conversa"
                          >
                            ✕
                          </button>
                        </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              ) : activeTab ? (
                <>
                  {/* Mensagens */}
                  <div style={{
                    flex: 1,
                    overflowY: 'auto',
                    padding: '12px 14px',
                    backgroundColor: '#0A0A0A',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}>
                    {activeTab.isLoading ? (
                      <div style={{ margin: 'auto', color: 'rgba(255,255,255,0.35)', fontSize: 13, display: 'flex', alignItems: 'center', gap: 8 }}>
                        <div style={{ width: 14, height: 14, borderRadius: '50%', border: '2px solid rgba(255,255,255,0.1)', borderTopColor: '#6C2BD9', animation: 'spin 0.7s linear infinite' }} />
                        Carregando mensagens...
                      </div>
                    ) : activeTab.messages.length === 0 ? (
                      <div style={{ margin: 'auto', color: 'rgba(255,255,255,0.35)', fontSize: 12, textAlign: 'center' }}>
                        <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.4 }}><Icon name="chat" size={28} /></div>
                        Sem mensagens ainda
                      </div>
                    ) : (
                      <div>
                        {activeTab.messages.map((msg, idx) => {
                          const isOwn = msg.senderId === user.id;
                          const isUnread = msg.status !== 'read' && !isOwn;

                          return (
                          <div
                            key={msg._id || idx}
                            style={{
                              display: 'flex',
                              marginBottom: 4,
                              justifyContent: isOwn ? 'flex-end' : 'flex-start',
                            }}
                          >
                            <div style={{
                              maxWidth: '78%',
                              padding: '8px 12px',
                              borderRadius: 13,
                              borderBottomRightRadius: isOwn ? 3 : 13,
                              borderBottomLeftRadius: isOwn ? 13 : 3,
                              background: isOwn ? '#6C2BD9' : '#1A1A1A',
                              color: isOwn ? '#fff' : 'rgba(255,255,255,0.92)',
                              wordBreak: 'break-word',
                              border: isOwn ? 'none' : isUnread
                                ? '1px solid rgba(108,43,217,0.35)'
                                : '1px solid rgba(255,255,255,0.07)',
                              boxShadow: isOwn
                                ? '0 2px 10px rgba(108,43,217,0.3)'
                                : '0 1px 4px rgba(0,0,0,0.3)',
                              fontSize: 13,
                              lineHeight: 1.5,
                            }}>
                              <p style={{ margin: 0 }}>{msg.text}</p>
                              <p style={{ fontSize: 10, opacity: 0.55, marginTop: 4, textAlign: 'right', margin: '4px 0 0 0' }}>
                                {new Date(msg.createdAt || msg.timestamp || new Date()).toLocaleTimeString(
                                  'pt-BR',
                                  { hour: '2-digit', minute: '2-digit' },
                                )}
                              </p>
                            </div>
                          </div>
                          );
                        })}
                        <div ref={messagesEndRef} />
                      </div>
                    )}
                  </div>

                  {/* Input */}
                  <div style={{
                    borderTop: '1px solid rgba(255,255,255,0.07)',
                    padding: '10px 12px',
                    backgroundColor: '#111111',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                    flexShrink: 0,
                  }}>
                    {/* Indicador de digitação */}
                    {typingUsers[activeTabId || ''] && (
                      <div style={{
                        fontSize: 11,
                        color: 'rgba(255,255,255,0.4)',
                        fontStyle: 'italic',
                        height: 14,
                      }}>
                        digitando...
                      </div>
                    )}
                    <div style={{ display: 'flex', gap: 8 }}>
                      <input
                        type="text"
                        placeholder="Sua mensagem..."
                        value={messageText}
                        onChange={(e) => handleMessageInputChange(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' && !e.shiftKey) {
                            e.preventDefault();
                            sendMessage();
                          }
                        }}
                        style={{
                          flex: 1,
                          border: '1px solid rgba(255,255,255,0.07)',
                          borderRadius: 8,
                          padding: '8px 12px',
                          fontSize: 13,
                          fontFamily: "'Inter', sans-serif",
                          outline: 'none',
                          background: '#161616',
                          color: 'rgba(255,255,255,0.92)',
                          transition: 'border-color 0.2s, box-shadow 0.2s',
                        }}
                        onFocus={e => {
                          e.currentTarget.style.borderColor = '#6C2BD9';
                          e.currentTarget.style.boxShadow = '0 0 0 3px rgba(108,43,217,0.12)';
                        }}
                        onBlur={e => {
                          e.currentTarget.style.borderColor = 'rgba(255,255,255,0.07)';
                          e.currentTarget.style.boxShadow = 'none';
                        }}
                      />
                      <button
                        onClick={sendMessage}
                        disabled={!messageText.trim()}
                        style={{
                          background: messageText.trim() ? '#6C2BD9' : 'rgba(108,43,217,0.3)',
                          color: 'white',
                          border: 'none',
                          borderRadius: 8,
                          padding: '8px 14px',
                          cursor: messageText.trim() ? 'pointer' : 'not-allowed',
                          fontSize: 13,
                          fontWeight: 600,
                          fontFamily: "'Inter', sans-serif",
                          transition: 'all 0.2s',
                          flexShrink: 0,
                        }}
                        onMouseEnter={e => { if (messageText.trim()) e.currentTarget.style.background = '#8B5CF6'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = messageText.trim() ? '#6C2BD9' : 'rgba(108,43,217,0.3)'; }}
                        title="Enviar (Enter)"
                      >
                        Enviar
                      </button>
                    </div>
                  </div>
                  <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
                </>
              ) : null}
            </>
          )}
        </div>
      )}
    </div>
  );
}
