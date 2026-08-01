import React from 'react';
import { Bell } from 'lucide-react';
import { Badge } from '../ui/Badge';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import styles from './AppHeader.module.css';

export interface AppHeaderProps {
  notifications?: number;
  avatarUrl?: string;
  onBell?: () => void;
  onAvatar?: () => void;
  /** Substitui o avatar padrão (ex.: <AccountMenuButton/>). */
  accountSlot?: React.ReactNode;
}

/**
 * Cabeçalho do app: marca (imagem `logog_png`) + sino de notificações com
 * contador (`Badge`) + avatar (ou `accountSlot`). O contador só aparece
 * quando `notifications > 0` — sino sem pendência não carrega selo.
 */
export function AppHeader({ notifications = 0, avatarUrl, onBell, onAvatar, accountSlot }: AppHeaderProps) {
  return (
    <header className={styles.header}>
      <img src="/images/logog_png.png" alt="DROP" className={styles.logoImg} />
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
        {accountSlot ?? (
          <button
            type="button"
            className={styles.avatar}
            aria-label="Perfil"
            onClick={onAvatar}
            style={avatarUrl ? { backgroundImage: `url(${avatarUrl})` } : undefined}
          />
        )}
      </div>
    </header>
  );
}
