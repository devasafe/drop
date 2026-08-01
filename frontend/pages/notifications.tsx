import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { Package, MessageSquare, Megaphone, Bell, BellOff, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import { useNotifications } from '../hooks/useSync';
import { groupByDay } from '../lib/groupNotifications';
import LoadingSkeleton from '../components/LoadingSkeleton';
import styles from './Notifications.module.css';

interface Notification {
  _id: string;
  title?: string;
  message: string;
  type: 'system' | 'broadcast' | 'order' | 'chat';
  read: boolean;
  createdAt: string;
}

const TypeIcon = ({ type }: { type: string }) => {
  const size = 17;
  if (type === 'order') return <Package size={size} />;
  if (type === 'chat') return <MessageSquare size={size} />;
  if (type === 'broadcast') return <Megaphone size={size} />;
  return <Bell size={size} />;
};

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr);
  const diff = Date.now() - d.getTime();
  if (diff < 60000) return 'Agora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min atrás`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h atrás`;
  return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
};

export default function Notifications() {
  const { user, loading } = useAuth() || {};
  const router = useRouter();
  const { notifications: rawNotifications, loading: notifLoading } = useNotifications();
  const notifications: Notification[] = (rawNotifications ?? []).filter(
    (n): n is Notification => typeof n?._id === 'string',
  );

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    if (user) api.patch('/notifications/read-all').catch(() => {});
  }, [user, loading, router]);

  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const remove = async (id: string) => {
    setRemovedIds((prev) => new Set([...prev, id]));
    try {
      await api.delete(`/notifications/${id}`);
      setRemovedIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
    } catch { /* mantém escondido */ }
  };

  const visible = notifications.filter((n) => !removedIds.has(n._id));

  if (!user || notifLoading) return (
    <div className={styles.loadingScreen}>
      <LoadingSkeleton variant="list" count={5} />
    </div>
  );

  const unreadCount = visible.filter((n) => !n.read).length;
  const groups = groupByDay(visible);

  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <div className={styles.header}>
          <h1 className={styles.title}>Notificações</h1>
          <p className={styles.subtitle}>
            {unreadCount > 0 ? `${unreadCount} não lida${unreadCount !== 1 ? 's' : ''}` : 'Tudo em dia'}
          </p>
        </div>

        {visible.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}><BellOff size={40} strokeWidth={1.5} /></div>
            <p className={styles.emptyTitle}>Nenhuma notificação</p>
            <p className={styles.emptySubtitle}>Você está atualizado!</p>
          </div>
        ) : (
          groups.map((group) => (
            <section key={group.label} className={styles.group}>
              <h2 className={styles.groupLabel}>{group.label}</h2>
              <div className={styles.list}>
                {group.items.map((notif) => (
                  <div
                    key={notif._id}
                    className={`${styles.item} ${!notif.read ? styles.itemUnread : ''} ${notif.type === 'broadcast' ? styles.itemBroadcast : ''}`}
                  >
                    <div className={`${styles.itemIcon} ${notif.type === 'broadcast' ? styles.itemIconBroadcast : ''}`}>
                      <TypeIcon type={notif.type} />
                    </div>
                    <div className={styles.itemContent}>
                      <div className={styles.itemHeader}>
                        {notif.title && <h3 className={styles.itemTitle}>{notif.title}</h3>}
                        {notif.type === 'broadcast' && <span className={styles.broadcastBadge}>ANÚNCIO</span>}
                      </div>
                      <p className={styles.itemMessage}>{notif.message}</p>
                      <p className={styles.itemTime}>{formatTime(notif.createdAt)}</p>
                    </div>
                    <button onClick={() => remove(notif._id)} className={styles.btnDelete} aria-label="Remover">
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>
            </section>
          ))
        )}
      </div>
    </div>
  );
}
