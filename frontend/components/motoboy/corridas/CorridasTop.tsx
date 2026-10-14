import Link from 'next/link';
import { Bell, Power } from 'lucide-react';
import { useUnreadNotifications } from '../../../hooks/useUnreadNotifications';
import { MOTOBOY_ROUTES } from '../../../lib/motoboyRoutes';
import blocks from '../../panel/PanelBlocks.module.css';
import { formatOnlineFor } from './onlineSince';
import styles from './Corridas.module.css';

export function greeting(d: Date): string {
  const h = d.getHours();
  if (h >= 5 && h < 12) return 'Bom dia';
  if (h >= 12 && h < 18) return 'Boa tarde';
  return 'Boa noite';
}

export function MotoboyBell() {
  const unread = useUnreadNotifications();
  const label = unread > 0 ? `Notificações, ${unread} ${unread === 1 ? 'não lida' : 'não lidas'}` : 'Notificações';
  return (
    <Link href={MOTOBOY_ROUTES.notificacoes} className={styles.bell} aria-label={label}>
      <Bell size={20} aria-hidden="true" />
      {unread > 0 && <span className={styles.badge} aria-hidden="true">{unread > 9 ? '9+' : unread}</span>}
    </Link>
  );
}

export function OnlineBadge({ since, now }: { since: number | null; now: number }) {
  return <span className={`${blocks.tag} ${blocks.tagOk}`}>{since ? `Online · ${formatOnlineFor(now - since)}` : 'Online'}</span>;
}

export function PowerButton({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button type="button" className={styles.power} onClick={onClick} disabled={disabled} aria-label="Ficar offline">
      <Power size={20} aria-hidden="true" />
    </button>
  );
}
