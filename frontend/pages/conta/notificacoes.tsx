import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Bell, Bike, CheckCheck, Megaphone, MessageCircle } from 'lucide-react';
import api from '../../lib/api';
import ProtectedRoute from '../../components/ProtectedRoute';
import { useNotifications } from '../../hooks/useSync';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import { groupByDay } from '../../lib/groupNotifications';
import { ROUTES } from '../../lib/routes';
import { ScreenHeader } from '../../components/drop/ScreenHeader';
import { EmptyState } from '../../components/ui/EmptyState';
import { Skeleton } from '../../components/ui/Skeleton';
import { Switch } from '../../components/ui/Switch';
import styles from './Notificacoes.module.css';
import { PushTestButton } from '../../components/drop/PushTestButton';

const ICON: Record<string, typeof Bell> = { order: Bike, chat: MessageCircle, broadcast: Megaphone, system: Bell };
const hhmm = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

export default function NotificacoesPage() {
  const router = useRouter();
  const { notifications, loading } = useNotifications();
  const push = usePushNotifications();
  const [items, setItems] = useState<any[]>([]);
  useEffect(() => {
    setItems((notifications || []).filter((n: any) => typeof n?._id === 'string'));
  }, [notifications]);
  const unread = items.some((n) => !n.read);

  const markAll = async () => {
    setItems((list) => list.map((n) => ({ ...n, read: true })));
    try {
      await api.patch('/notifications/read-all');
    } catch {
      /* a lista volta como o servidor tem na próxima carga */
    }
  };
  const open = (n: any) => {
    if (!n.read) {
      setItems((list) => list.map((x) => (x._id === n._id ? { ...x, read: true } : x)));
      api.patch(`/notifications/${n._id}/read`).catch(() => {});
    }
    if (typeof n.link === 'string' && n.link.startsWith('/') && !n.link.startsWith('//')) router.push(n.link);
  };

  return (
    <ProtectedRoute required_role="cliente">
      <main className={styles.page}>
        <ScreenHeader
          title="Notificações"
          onBack={() => router.push(ROUTES.conta)}
          end={
            unread ? (
              <button type="button" className={styles.link} onClick={markAll}>
                <CheckCheck size={16} aria-hidden="true" />
                Marcar lidas
              </button>
            ) : undefined
          }
        />
        {loading ? (
          <div className={styles.body}>
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        ) : items.length === 0 ? (
          <EmptyState icon={<Bell />} title="Tudo em dia" description="Avisamos aqui cada passo do seu pedido." />
        ) : (
          <div className={styles.body}>
            {groupByDay(items).map((g) => (
              <section key={g.label} aria-label={g.label}>
                <h2 className={styles.cap}>{g.label}</h2>
                <ul className={styles.list}>
                  {g.items.map((n: any) => {
                    const Icon = ICON[n.type] ?? Bell;
                    return (
                      <li key={n._id}>
                        <button type="button" className={[styles.row, !n.read && styles.unread].filter(Boolean).join(' ')} onClick={() => open(n)}>
                          <span className={styles.ico} aria-hidden="true">
                            <Icon size={18} />
                          </span>
                          <span className={styles.tx}>
                            <b>{n.title || 'Aviso'}</b>
                            <span>{n.message}</span>
                          </span>
                          <span className={styles.end}>
                            <time className={styles.time}>{hhmm(n.createdAt)}</time>
                            {!n.read && (
                              <span className={styles.dot}>
                                <span className={styles.srOnly}>Não lida</span>
                              </span>
                            )}
                          </span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>
        )}
        <section className={styles.prefs} aria-label="Preferências">
          {push.supported ? (
            <Switch
              label="Avisos no celular"
              description={push.error || (push.permission === 'denied' ? push.blockedText : 'Avisamos cada passo do pedido, mesmo com o app fechado.')}
              checked={push.subscribed}
              disabled={push.busy || push.permission === 'denied'}
              onChange={(on) => (on ? push.enable() : push.disable())}
            />
          ) : (
            <p className={styles.note}>Este aparelho não recebe avisos fora do app.</p>
          )}
          {push.subscribed && <PushTestButton sendTest={push.sendTest} />}
        </section>
      </main>
    </ProtectedRoute>
  );
}
