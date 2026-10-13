// Topo da aba Agora (protótipo, telas 1 e 13): avatar com as iniciais da loja e sino com as não lidas.
import Link from 'next/link';
import { Bell } from 'lucide-react';
import { imageUrl } from '../../../lib/config';
import { useUnreadNotifications } from '../../../hooks/useUnreadNotifications';
import { SELLER_ROUTES } from '../../../lib/sellerRoutes';
import styles from './AgoraTop.module.css';

export const storeInitials = (name?: string | null) =>
  (name || 'Loja').trim().split(/\s+/).slice(0, 2).map((w) => w[0] || '').join('').toUpperCase();

export function StoreAvatar({ name, logoUrl }: { name?: string | null; logoUrl?: string | null }) {
  return (
    <span className={styles.avatar} aria-hidden="true">
      {logoUrl ? <img src={imageUrl(logoUrl)} alt="" /> : storeInitials(name)}
    </span>
  );
}

export function NotificationBell() {
  const unread = useUnreadNotifications();
  const label = unread > 0 ? `Notificações, ${unread} ${unread === 1 ? 'não lida' : 'não lidas'}` : 'Notificações';
  return (
    <Link href={SELLER_ROUTES.notificacoes} className={styles.bell} aria-label={label}>
      <Bell size={20} aria-hidden="true" />
      {unread > 0 && <span className={styles.badge} aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}
