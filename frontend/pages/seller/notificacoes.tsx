import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import { Bell, CheckCheck, Megaphone, Receipt, Wallet } from 'lucide-react';
import ProtectedRoute from '../../components/ProtectedRoute';
import { SellerShell } from '../../components/seller/panel/SellerShell';
import { useSellerPanel } from '../../components/seller/panel/SellerPanelProvider';
import { AcceptButton } from '../../components/seller/order/AcceptButton';
import { useNotifications } from '../../hooks/useSync';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { groupByDay } from '../../lib/groupNotifications';
import { isAwaitingAccept } from '../../lib/sellerOrders';
import { payload } from '../../lib/sellerApi';
import { SELLER_ROUTES } from '../../lib/sellerRoutes';
import api from '../../lib/api';
import { Alert } from '../../components/ui/Alert';
import { Chip } from '../../components/ui/Chip';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Switch } from '../../components/ui/Switch';
import blocks from '../../components/panel/PanelBlocks.module.css';

type Filter = 'tudo' | 'pedidos' | 'dinheiro' | 'drop';
const FILTERS: Array<{ id: Filter; label: string }> = [
  { id: 'tudo', label: 'Tudo' },
  { id: 'pedidos', label: 'Pedidos' },
  { id: 'dinheiro', label: 'Dinheiro' },
  { id: 'drop', label: 'Do DROP' },
];

export function notificationCategory(n: any): 'pedidos' | 'dinheiro' | 'drop' | 'outros' {
  const link = typeof n?.link === 'string' ? n.link : '';
  if (n?.type === 'broadcast') return 'drop';
  if (link.startsWith('/seller/dinheiro')) return 'dinheiro';
  if (n?.type === 'order' || link.startsWith('/seller/pedido')) return 'pedidos';
  return 'outros';
}

const ICON = { pedidos: Receipt, dinheiro: Wallet, drop: Megaphone, outros: Bell } as const;
const ICON_CLASS = { pedidos: blocks.icoBrand, dinheiro: blocks.icoOk, drop: blocks.icoInfo, outros: '' } as const;
/** Só navega para rota interna do painel da loja; qualquer outro valor é ignorado. */
const safeLink = (l: unknown): l is string => typeof l === 'string' && l.startsWith('/seller/');
const hhmm = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '');

/** Cartão ainda não aprovado pelo Asaas: o servidor não confere o pagamento no aceite, então a tela não oferece. */
const cardAwaitingPayment = (o: any): boolean =>
  o?.paymentMethod === 'credit_card' && !!o?.asaasPaymentId && o?.paymentStatus !== 'paid';

export default function SellerNotificacoes() {
  const router = useRouter();
  const { notifications, loading } = useNotifications();
  const { orders, refresh } = useSellerPanel();
  const push = usePushNotifications();
  const [items, setItems] = useState<any[]>([]);
  const [filter, setFilter] = useState<Filter>('tudo');
  const [handled, setHandled] = useState<Record<string, string>>({});
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  useEffect(() => {
    setItems((notifications || []).filter((x: any) => typeof x?._id === 'string'));
  }, [notifications]);

  // Pedidos pagos que ainda esperam aceite.
  const awaiting = useMemo(() => {
    const m = new Map<string, any>();
    for (const o of orders || []) if (o?._id && isAwaitingAccept(o) && !cardAwaitingPayment(o)) m.set(String(o._id), o);
    return m;
  }, [orders]);

  const visible = filter === 'tudo' ? items : items.filter((x) => notificationCategory(x) === filter);
  const unread = items.some((x) => !x.read);

  const markAll = async () => {
    setItems((list) => list.map((x) => ({ ...x, read: true })));
    try { await api.patch('/notifications/read-all'); } catch { /* a lista volta como o servidor tem na próxima carga */ }
  };

  const open = (x: any) => {
    if (!x.read) {
      setItems((list) => list.map((y) => (y._id === x._id ? { ...y, read: true } : y)));
      Promise.resolve(api.patch(`/notifications/${x._id}/read`)).catch(() => {});
    }
    if (safeLink(x.link)) router.push(x.link);
  };

  const accepted = useCallback((orderId: string) => {
    setHandled((h) => ({ ...h, [orderId]: 'Aceito' }));
    Promise.resolve(refresh?.()).catch(() => {});
  }, [refresh]);

  // Qualquer erro no aceite recarrega o pedido; true = ainda espera aceite (vale a mensagem do servidor).
  const alreadyHandled = useCallback(async (orderId: string): Promise<boolean | void> => {
    Promise.resolve(refresh?.()).catch(() => {});
    const res = await api.get(`/orders/${orderId}`);
    const fresh = payload<any>(res);
    if (!fresh) return undefined;
    if (isAwaitingAccept(fresh)) return true;
    if (mounted.current) setHandled((h) => ({ ...h, [orderId]: 'Já aceito' }));
    return false;
  }, [refresh]);

  return (
    <ProtectedRoute required_role="lojista">
      <SellerShell
        title="Notificações"
        back={SELLER_ROUTES.loja}
        actions={unread ? (
          <button type="button" className={blocks.link} onClick={markAll}>
            <CheckCheck size={16} aria-hidden="true" /> Marcar lidas
          </button>
        ) : undefined}
      >
        <div className={blocks.body}>
          <div className={blocks.chips} role="group" aria-label="Filtrar avisos">
            {FILTERS.map((f) => <Chip key={f.id} label={f.label} active={filter === f.id} onClick={() => setFilter(f.id)} />)}
          </div>

          {push.supported && push.permission === 'denied' && (
            <Alert tone="warning" title="Você pode perder pedidos">
              {push.blockedText}
            </Alert>
          )}

          <section aria-label="Avisos" className={blocks.stack}>
            {loading ? (
              <>
                <Skeleton height={64} radius="var(--radius-lg)" />
                <Skeleton height={64} radius="var(--radius-lg)" />
              </>
            ) : visible.length === 0 ? (
              <EmptyState icon={<Bell />} title="Tudo em dia" description="Avisos de pedidos, dinheiro e do DROP aparecem aqui." />
            ) : (
              groupByDay(visible).map((g) => (
                <div key={g.label} className={blocks.stack}>
                  <h2 className={blocks.cap}>{g.label}</h2>
                  <ul className={blocks.list}>
                    {g.items.map((x: any) => {
                      const cat = notificationCategory(x);
                      const Icon = ICON[cat];
                      const orderId = x.entityId ? String(x.entityId) : '';
                      const order = orderId ? awaiting.get(orderId) : undefined;
                      const done = orderId ? handled[orderId] : undefined;
                      return (
                        <li key={x._id} className={[blocks.row, !x.read && blocks.rowCurrent].filter(Boolean).join(' ')}>
                          <button type="button" className={blocks.rowMain} onClick={() => open(x)}>
                            <span className={[blocks.ico, ICON_CLASS[cat]].filter(Boolean).join(' ')} aria-hidden="true"><Icon size={18} /></span>
                            <span className={blocks.tx}>
                              <b>{x.title || 'Aviso'}</b>
                              <span>{order?.acceptDeadline ? `${x.message} · aceite até ${hhmm(order.acceptDeadline)}` : x.message}</span>
                            </span>
                            <span className={blocks.end}>
                              <time className={blocks.time}>{hhmm(x.createdAt)}</time>
                              {!x.read && <span className={blocks.dot}><span className={blocks.srOnly}>Não lida</span></span>}
                            </span>
                          </button>
                          {done ? (
                            <span className={[blocks.tag, blocks.tagOk].join(' ')}>{done}</span>
                          ) : order ? (
                            <AcceptButton
                              size="sm"
                              orderId={orderId}
                              distance={order.deliveryDistance || 0}
                              onAccepted={() => accepted(orderId)}
                              onAlreadyHandled={() => alreadyHandled(orderId)}
                            />
                          ) : null}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))
            )}
          </section>

          <section className={blocks.blk} aria-label="Preferências">
            {push.supported ? (
              <Switch
                label="Avisos de pedido novo"
                description={push.error || (push.permission === 'denied' ? push.blockedText : 'Som e aviso no celular, mesmo com o app fechado.')}
                checked={push.subscribed}
                disabled={push.busy || push.permission === 'denied'}
                onChange={(on) => (on ? push.enable() : push.disable())}
              />
            ) : (
              <p className={blocks.meta}>Este aparelho não recebe avisos fora do app. Deixe o painel aberto para ouvir o som de pedido novo.</p>
            )}
          </section>
        </div>
      </SellerShell>
    </ProtectedRoute>
  );
}
