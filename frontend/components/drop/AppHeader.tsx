import { Bell } from 'lucide-react';
import { Logo } from './Logo';
import { Badge } from '../ui/Badge';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import styles from './AppHeader.module.css';

export interface AppHeaderProps {
  notifications?: number;
  avatarUrl?: string;
  onBell?: () => void;
  onAvatar?: () => void;
}

/**
 * Cabeçalho do app: marca (`Logo`) + sino de notificações com contador
 * (`Badge`) + avatar. Replica `.hd` do mock canônico. O contador só aparece
 * quando `notifications > 0` — sino sem pendência não carrega selo.
 */
export function AppHeader({ notifications = 0, avatarUrl, onBell, onAvatar }: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <Logo />
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.bell}
          aria-label={notifications > 0 ? `Notificações, ${notifications} novas` : 'Notificações'}
          onClick={onBell}
        >
          <Bell size={22} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
          {notifications > 0 && (
            <span className={styles.dot} aria-hidden="true">
              <Badge tone="discount">{notifications}</Badge>
            </span>
          )}
        </button>
        <button
          type="button"
          className={styles.avatar}
          aria-label="Perfil"
          onClick={onAvatar}
          style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
        />
      </div>
    </header>
  );
}
