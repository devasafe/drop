import Link from 'next/link';
import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import api from '../lib/api';
import styles from './Notifications.module.css';
import { useNotifications } from '../hooks/useSync';
import LoadingSkeleton from '../components/LoadingSkeleton';

interface Notification {
  _id: string;
  title?: string;
  message: string;
  type: 'system' | 'broadcast' | 'order' | 'chat';
  read: boolean;
  createdAt: string;
}

const TypeIcon = ({ type }: { type: string }) => {
  switch (type) {
    case 'order': return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
      </svg>
    );
    case 'chat': return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    );
    case 'broadcast': return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
      </svg>
    );
    default: return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    );
  }
};

const formatTime = (dateStr: string) => {
  const d = new Date(dateStr);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 60000) return 'Agora';
  if (diff < 3600000) return `${Math.floor(diff / 60000)}min atrás`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h atrás`;
  if (diff < 604800000) return `${Math.floor(diff / 86400000)}d atrás`;
  return d.toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' });
};

export default function Notifications() {
  const { user, loading } = useAuth() || {};
  const router = useRouter();
  const { notifications: rawNotifications, loading: notifLoading } = useNotifications();
  const notifications: Notification[] = (rawNotifications ?? []).filter(
    (n): n is Notification => typeof n?._id === 'string'
  );
  const fetching = notifLoading;
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !user) { router.push('/login'); return; }
    // Marca todas como lidas ao abrir a página
    if (user) {
      api.patch('/notifications/read-all').catch(() => {});
    }
  }, [user, loading, router]);

  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());

  const remove = async (id: string) => {
    setRemovedIds(prev => new Set([...prev, id]));
    try {
      await api.delete(`/notifications/${id}`);
      // Remove do Set após confirmação — o item foi deletado no servidor
      setRemovedIds(prev => { const next = new Set(prev); next.delete(id); return next; });
    } catch { }
  };

  const visibleNotifications = notifications.filter(n => !removedIds.has(n._id));

  if (!user || fetching) return (
    <div className={styles.loadingScreen}>
      <LoadingSkeleton variant="list" count={5} />
    </div>
  );

  const unreadCount = visibleNotifications.filter(n => !n.read).length;

  return (
    <div className={styles.page}>
      <div className={styles.container}>

        <div className={styles.header}>
          <div className={styles.titleGroup}>
            <h1 className={styles.title}>Notificações</h1>
            <p className={styles.subtitle}>
              {unreadCount > 0
                ? <><span className={styles.unreadCount}>{unreadCount}</span> não lida{unreadCount !== 1 ? 's' : ''}</>
                : 'Tudo em dia'
              }
            </p>
          </div>
          <Link href="/inicio" className={styles.backLink}>← Voltar</Link>
        </div>

        {error && <p className={styles.errorMsg}>{error}</p>}

        {visibleNotifications.length === 0 ? (
          <div className={styles.emptyState}>
            <div className={styles.emptyIcon}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                <line x1="2" y1="2" x2="22" y2="22"/>
              </svg>
            </div>
            <p className={styles.emptyTitle}>Nenhuma notificação</p>
            <p className={styles.emptySubtitle}>Você está atualizado!</p>
          </div>
        ) : (
          <div className={styles.list}>
            {visibleNotifications.map((notif, idx) => (
              <div
                key={notif._id}
                className={`${styles.item} ${!notif.read ? styles.itemUnread : ''} ${notif.type === 'broadcast' ? styles.itemBroadcast : ''}`}
                style={{ animationDelay: `${idx * 0.04}s` }}
              >
                <div className={`${styles.itemIcon} ${!notif.read ? styles.itemIconUnread : ''} ${notif.type === 'broadcast' ? styles.itemIconBroadcast : ''}`}>
                  <TypeIcon type={notif.type} />
                </div>

                <div className={styles.itemContent}>
                  <div className={styles.itemHeader}>
                    {notif.title && (
                      <h3 className={`${styles.itemTitle} ${!notif.read ? styles.itemTitleUnread : ''}`}>
                        {notif.title}
                      </h3>
                    )}
                    {notif.type === 'broadcast' && (
                      <span className={styles.broadcastBadge}>ANÚNCIO</span>
                    )}
                  </div>
                  <p className={styles.itemMessage}>{notif.message}</p>
                  <p className={styles.itemTime}>{formatTime(notif.createdAt)}</p>
                </div>

                <div className={styles.itemActions}>
                  <button onClick={() => remove(notif._id)} className={styles.btnDelete} title="Remover">
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
