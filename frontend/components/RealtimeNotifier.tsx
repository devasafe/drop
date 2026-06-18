import { useEffect, useState } from 'react';
import { useSocket } from '../contexts/SocketContext';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { notify, primeAudio, requestNotificationPermission } from '../lib/notify';

/**
 * Notificador global de tempo real. Mantém o lojista avisado de novos pedidos
 * em qualquer página (som + toast + pop-up). Mensagens são tratadas no widget
 * de chat. Não renderiza nada.
 */
export default function RealtimeNotifier() {
  const { on, emit, isConnected } = useSocket();
  const { user } = useAuth() || {};
  const [storeId, setStoreId] = useState<string | null>(null);

  const role = user?.activeRole || user?.role;
  const isLojista = role === 'lojista';
  const isMotoboy = role === 'motoboy';

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

  // Descobre a loja do lojista para entrar na sala de pedidos em qualquer página
  useEffect(() => {
    let cancelled = false;
    if (!user || !isLojista) { setStoreId(null); return; }
    api.get('/stores/dashboard')
      .then(({ data }) => { if (!cancelled) setStoreId(data?.store?._id || null); })
      .catch(() => { /* sem loja ainda */ });
    return () => { cancelled = true; };
  }, [user, isLojista]);

  // Entra na sala da loja (e re-entra ao reconectar)
  useEffect(() => {
    if (!storeId || !isConnected) return;
    emit('join', { room: `store:${storeId}`, storeId });
  }, [storeId, isConnected, emit]);

  // Novo pedido (evento específico da loja) → notifica
  useEffect(() => {
    if (!user || !isLojista) return;
    const handler = () => {
      notify({
        kind: 'order',
        title: 'Novo pedido recebido! 🛒',
        body: 'Você tem um novo pedido esperando na sua loja.',
        url: '/store-dashboard',
        tag: 'new-order',
      });
    };
    const unsub = on('new_order', handler);
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

  return null;
}
