import { useEffect, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { notify, primeAudio, requestNotificationPermission } from '../lib/notify';
import { SELLER_ROUTES } from '../lib/sellerRoutes';
import { useSellerPanel } from './seller/panel/SellerPanelProvider';

/**
 * Notificador global de tempo real. Mantém o lojista avisado de novos pedidos
 * em qualquer página (som + toast + pop-up). Mensagens são tratadas no widget
 * de chat. Não renderiza nada.
 */
export default function RealtimeNotifier() {
  const { on, emit, isConnected } = useSocket();
  const { user, teamRoles } = useAuth() || ({} as any);
  const [ownStoreId, setOwnStoreId] = useState<string | null>(null);
  // V12: no painel da loja (/seller/*) a loja vem do SellerPanelProvider, que já leu /stores/dashboard.
  const panel = useSellerPanel();
  const inPanel = panel?.inPanel === true;

  const role = user?.activeRole || user?.role;
  const isLojista = role === 'lojista';
  const isMotoboy = role === 'motoboy';
  // Papel de equipe é acréscimo: quem segue cliente com marketing/gerente também ouve os avisos do admin.
  const isAdmin = ['ceo', 'marketing', 'gerente_geral', 'gerente_clientes', 'gerente_lojistas', 'gerente_motoboys'].includes(role)
    || (Array.isArray(teamRoles) && teamRoles.length > 0);

  // Habilita o áudio e pede permissão de notificação no 1º gesto do usuário
  useEffect(() => {
    if (!user) return;
    const onGesture = () => { primeAudio(); requestNotificationPermission(); };
    window.addEventListener('pointerdown', onGesture, { once: true });
    window.addEventListener('keydown', onGesture, { once: true });
    return () => {
      window.removeEventListener('pointerdown', onGesture);
      window.removeEventListener('keydown', onGesture);
    };
  }, [user]);

  // Descobre a loja do lojista para entrar na sala de pedidos em qualquer página.
  // Dentro do painel, usa a do painel (enquanto ele carrega, sem sala: fail closed); fora, o GET próprio.
  useEffect(() => {
    let cancelled = false;
    if (!user || !isLojista || inPanel) { setOwnStoreId(null); return; }
    api.get('/stores/dashboard')
      .then(({ data }) => { if (!cancelled) setOwnStoreId(data?.store?._id || null); })
      .catch(() => { /* sem loja ainda */ });
    return () => { cancelled = true; };
  }, [user, isLojista, inPanel]);
  const panelStoreId = isLojista && panel?.store?._id ? String(panel.store._id) : null;
  const storeId = inPanel ? panelStoreId : ownStoreId;

  // Entra na sala da loja (e re-entra ao reconectar)
  useEffect(() => {
    if (!storeId || !isConnected) return;
    emit('join', { room: `store:${storeId}`, storeId });
  }, [storeId, isConnected, emit]);

  // Novo pedido (evento específico da loja) → notifica
  useEffect(() => {
    if (!user || !isLojista) return;
    const handler = (data?: { orderId?: string | number }) => {
      notify({
        kind: 'order',
        title: 'Novo pedido recebido! 🛒',
        body: 'Você tem um novo pedido esperando na sua loja.',
        // D1: abre o pedido certo; sem id, a aba Agora
        url: data?.orderId !== undefined && data?.orderId !== null ? SELLER_ROUTES.pedido(String(data.orderId)) : SELLER_ROUTES.agora,
        tag: 'new-order',
      });
    };
    const unsub = on('new_order', handler);
    return () => unsub();
  }, [user, isLojista, on]);

  // Motoboy pediu devolução → a loja precisa digitar o PIN quando ele voltar com o produto
  useEffect(() => {
    if (!user || !isLojista) return;
    const handler = () => {
      notify({
        kind: 'order',
        title: 'Devolução pedida ↩️',
        body: 'O motoboy vai voltar com o produto. Confirme com o PIN quando ele chegar.',
        url: SELLER_ROUTES.pedidos('devolucoes'),
        tag: 'return-requested',
      });
    };
    const unsub = on('delivery:return_requested', handler);
    return () => unsub();
  }, [user, isLojista, on]);

  // Nova entrega disponível (motoboy entra na sala "motoboys" no connect) → notifica
  useEffect(() => {
    if (!user || !isMotoboy) return;
    const handler = () => {
      notify({
        kind: 'order',
        title: 'Nova entrega disponível! 🏍️',
        body: 'Apareceu uma nova entrega para você aceitar.',
        url: '/motoboy',
        tag: 'new-delivery',
      });
    };
    const unsub = on('delivery:available', handler);
    return () => unsub();
  }, [user, isMotoboy, on]);

  // Admin: verificações pendentes, mudança de plano, novo ticket de suporte
  useEffect(() => {
    if (!user || !isAdmin) return;
    const handler = (data: any) => {
      notify({
        kind: 'order',
        title: data?.title || 'Nova solicitação',
        body: data?.body,
        url: data?.url,
        tag: data?.tag || 'admin',
      });
    };
    const unsub = on('admin:notification', handler);
    return () => unsub();
  }, [user, isAdmin, on]);

  // Anúncio (broadcast do admin) → som próprio, para quem recebe
  useEffect(() => {
    if (!user) return;
    const handler = (data: any) => {
      if (data?.type !== 'broadcast') return;
      notify({
        kind: 'announcement',
        title: data?.title || 'Anúncio',
        body: data?.message,
        url: '/notifications',
        tag: 'broadcast',
      });
    };
    const unsub = on('notification:received', handler);
    return () => unsub();
  }, [user, on]);

  return null;
}

