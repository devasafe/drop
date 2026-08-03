import styles from './ConversationList.module.css';
import Icon from '../../Icon';
import { Button } from '../../ui/Button';
import { EmptyState } from '../../ui/EmptyState';
import type { Conversation } from './types';

export interface ConversationListProps {
  conversations: Conversation[];
  loading: boolean;
  onSelect: (conversation: Conversation) => void;
  onNew: () => void;
  onRemove: (conversation: Conversation) => void;
}

/**
 * Lista de conversas do widget de chat: botão "Nova conversa", loading,
 * estado vazio (`EmptyState`) ou itens com nome, prévia da última mensagem,
 * badge de mensagens não lidas e botão para remover a conversa.
 */
export function ConversationList({ conversations, loading, onSelect, onNew, onRemove }: ConversationListProps) {
  return (
    <div className={styles.wrapper}>
      <Button variant="primary" size="sm" className={styles.newButton} onClick={onNew}>
        + Nova conversa
      </Button>
      {loading ? (
        <div className={styles.status}>
          <span className={styles.spinner} />
          Carregando conversas...
        </div>
      ) : conversations.length === 0 ? (
        <EmptyState
          icon={<Icon name="chat" size={28} />}
          title="Nenhuma conversa"
          description='Clique em "Chat com a loja" nos produtos'
        />
      ) : (
        <div className={styles.list}>
          <div className={styles.sectionLabel}>Conversas</div>
          {conversations.map((conv) => {
            const hasUnread = conv.unreadCount > 0;
            return (
              <div
                key={conv._id}
                className={`${styles.item} ${hasUnread ? styles.itemUnread : ''}`}
                onClick={() => onSelect(conv)}
              >
                <div className={styles.itemMain}>
                  <div className={styles.name}>{conv.otherParticipantName}</div>
                  <div className={styles.preview}>
                    {conv.lastMessage?.text
                      ? conv.lastMessage.text.substring(0, 45) +
                        (conv.lastMessage.text.length > 45 ? '...' : '')
                      : 'Nenhuma mensagem'}
                  </div>
                  {hasUnread && (
                    <div className={styles.badge}>
                      {conv.unreadCount} nova{conv.unreadCount !== 1 ? 's' : ''}
                    </div>
                  )}
                </div>
                <button
                  type="button"
                  className={styles.removeButton}
                  onClick={(e) => {
                    e.stopPropagation();
                    onRemove(conv);
                  }}
                  aria-label="remover conversa"
                  title="Remover conversa"
                >
                  ✕
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
