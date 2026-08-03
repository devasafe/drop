import styles from './ChatTabBar.module.css';
import type { ChatTab } from './types';

export interface ChatTabBarProps {
  tabs: ChatTab[];
  activeTabId: string | null;
  onSelect: (id: string) => void;
  onClose: (id: string) => void;
}

/**
 * Barra de abas das conversas abertas no widget de chat: aba ativa
 * destacada, badge de mensagens não lidas e botão para fechar cada aba.
 */
export function ChatTabBar({ tabs, activeTabId, onSelect, onClose }: ChatTabBarProps) {
  if (tabs.length === 0) return null;

  return (
    <div className={styles.tabBar}>
      {tabs.map((tab) => (
        <div
          key={tab._id}
          className={`${styles.tab} ${activeTabId === tab._id ? styles.tabActive : ''}`}
          onClick={() => onSelect(tab._id)}
        >
          <span>
            {tab.otherParticipantName.substring(0, 12)}
            {tab.unreadCount > 0 && (
              <span className={styles.badge}>{tab.unreadCount}</span>
            )}
          </span>
          <button
            type="button"
            className={styles.closeButton}
            onClick={(e) => {
              e.stopPropagation();
              onClose(tab._id);
            }}
            aria-label="Fechar aba"
            title="Fechar aba"
          >
            ✕
          </button>
        </div>
      ))}
    </div>
  );
}
