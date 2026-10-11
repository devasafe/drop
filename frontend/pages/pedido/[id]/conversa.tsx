import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Send } from 'lucide-react';
import api from '../../../lib/api';
import ProtectedRoute from '../../../components/ProtectedRoute';
import { useAuth } from '../../../contexts/AuthContext';
import { useChat } from '../../../hooks/useChat';
import { useOrderTracking } from '../../../hooks/useOrderTracking';
import { ScreenHeader } from '../../../components/drop/ScreenHeader';
import { MessageBubble } from '../../../components/drop/chat/MessageBubble';
import { Alert } from '../../../components/ui/Alert';
import { Skeleton } from '../../../components/ui/Skeleton';
import { QUICK_REPLIES } from '../../../lib/chatQuickReplies';
import { shortOrderCode } from '../../../lib/customerOrder';
import { ROUTES, pedidoHref } from '../../../lib/routes';
import styles from '../Conversa.module.css';

type Aba = 'entregador' | 'loja';
const READ_ONLY_AFTER_MS = 24 * 60 * 60 * 1000;

export default function ConversaPage() {
  const router = useRouter();
  const id = typeof router.query.id === 'string' ? router.query.id : undefined;
  const { user } = useAuth() || ({} as any);
  const userId = String(user?._id ?? user?.id ?? '');
  const { order, delivery, loading } = useOrderTracking(id);
  const chat = useChat({ token: '', userId });
  const mb = delivery?.motoboyObj;
  const hasCourier = !!(mb && delivery?.motoboyId && ['assigned', 'picked', 'delivered'].includes(delivery.status));
  const com = router.query.com === 'loja' ? 'loja' : router.query.com === 'entregador' ? 'entregador' : null;
  const [aba, setAba] = useState<Aba>('loja');
  const [convId, setConvId] = useState<string | null>(null);
  const [text, setText] = useState('');
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const openRef = useRef<string | null>(null);

  useEffect(() => {
    setAba(com === 'entregador' && !hasCourier ? 'loja' : com ?? (hasCourier ? 'entregador' : 'loja'));
  }, [com, hasCourier]);

  // Abre (ou reaproveita) a conversa certa e carrega as mensagens; o socket só notifica as novas.
  useEffect(() => {
    if (!order) return;
    let off = false;
    setConvId(null);
    setFailed(false);
    const open =
      aba === 'entregador' && hasCourier
        ? api.post('/chat/conversations', { type: 'motoboy_cliente', otherParticipantId: mb._id, orderId: order._id })
        : api.post('/chat/conversations/pre-purchase', { storeId: order.storeId, conversationType: 'user' });
    open
      .then(async (r: any) => {
        const cid = String(r.data?._id ?? '');
        const msgs = await api.get(`/chat/conversations/${cid}/messages`);
        if (off) return;
        chat.setMessages(msgs.data?.messages ?? msgs.data ?? []);
        chat.joinConversation(cid);
        openRef.current = cid;
        setConvId(cid);
      })
      .catch(() => {
        if (!off) setFailed(true);
      });
    return () => {
      off = true;
      if (openRef.current) {
        chat.leaveConversation(openRef.current);
        openRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order?._id, aba, hasCourier, attempt]);

  const readOnly = useMemo(() => {
    const done = delivery?.deliveredAt ? Date.parse(delivery.deliveredAt) : NaN;
    return order?.status === 'entregue' && Number.isFinite(done) && Date.now() - done > READ_ONLY_AFTER_MS;
  }, [order?.status, delivery?.deliveredAt]);

  const send = async (t: string) => {
    const body = t.trim();
    if (!body || !convId) return;
    setText('');
    try {
      const r = await api.post(`/chat/conversations/${convId}/messages`, { text: body });
      const sent = r.data?.message ?? r.data;
      if (sent?._id) chat.setMessages((prev: any[]) => (prev.some((m) => m._id === sent._id) ? prev : [...prev, sent]));
    } catch {
      setText(body);
    }
  };

  const courierFirst = mb?.name ? String(mb.name).split(' ')[0] : '';
  const who = aba === 'entregador' && mb ? `${courierFirst} · motoboy` : `${order?.storeName || 'Loja'} · loja`;

  return (
    <ProtectedRoute required_role="cliente">
      <main className={styles.page}>
        <ScreenHeader
          title={who}
          meta={order ? `Pedido #${shortOrderCode(order._id)}` : undefined}
          onBack={() => router.push(id ? pedidoHref(id) : ROUTES.pedidos)}
        />
        {hasCourier && (
          <div className={styles.pills} role="tablist" aria-label="Com quem conversar">
            <button type="button" role="tab" aria-selected={aba === 'entregador'} className={aba === 'entregador' ? styles.on : undefined} onClick={() => setAba('entregador')}>
              {courierFirst}
            </button>
            <button type="button" role="tab" aria-selected={aba === 'loja'} className={aba === 'loja' ? styles.on : undefined} onClick={() => setAba('loja')}>
              {order?.storeName || 'Loja'}
            </button>
          </div>
        )}
        <section className={styles.thread} aria-live="polite" aria-label="Mensagens">
          {failed ? (
            <Alert tone="error" title="Não abrimos a conversa" action={{ label: 'Tentar de novo', onClick: () => setAttempt((n) => n + 1) }}>
              Confira sua conexão.
            </Alert>
          ) : loading || !convId ? (
            <>
              <Skeleton height={44} />
              <Skeleton height={44} />
            </>
          ) : (
            chat.messages.map((m: any) => <MessageBubble key={m._id} message={m} isOwn={String(m.senderId) === userId} />)
          )}
        </section>
        {readOnly ? (
          <Alert tone="info" title="Conversa encerrada" action={{ label: 'Falar com o suporte', onClick: () => router.push(ROUTES.ajuda) }}>
            A entrega foi há mais de 24 horas.
          </Alert>
        ) : (
          <>
            <div className={styles.quick}>
              {QUICK_REPLIES[aba].map((q) => (
                <button key={q} type="button" className={styles.chip} onClick={() => send(q)} disabled={!convId}>
                  {q}
                </button>
              ))}
            </div>
            <form
              className={styles.composer}
              onSubmit={(e: FormEvent) => {
                e.preventDefault();
                send(text);
              }}
            >
              <input aria-label="Mensagem" placeholder="Mensagem" value={text} onChange={(e) => setText(e.target.value)} className={styles.input} maxLength={2000} />
              <button type="submit" className={styles.send} aria-label="Enviar" disabled={!text.trim() || !convId}>
                <Send size={20} aria-hidden="true" />
              </button>
            </form>
          </>
        )}
      </main>
    </ProtectedRoute>
  );
}
