import Icon from '../Icon';
import styles from './ContactInfo.module.css';

interface Message {
  _id: string;
  conversationId: string;
  senderId: string;
  senderRole: string;
  senderName: string;
  text: string;
  attachments?: any[];
  status: 'sent' | 'delivered' | 'read';
  readAt?: Date;
  createdAt: Date;
}

interface ContactInfoProps {
  name: string;
  email?: string;
  phone?: string;
  label?: string;
  onChatClick?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
  conversationId?: string;
  userId?: string;
  messages?: Message[];
  typingUsers?: { userId: string; userName: string; }[];
  onSendMessage?: (text: string, attachments?: any[]) => Promise<void>;
  onMarkAsRead?: (messageId: any) => Promise<void>;
  onUserTyping?: (isTyping: boolean) => void;
  isConnected?: boolean;
  isLoading?: boolean;
  chatError?: string | null;
}

export default function ContactInfo({
  name,
  email,
  phone,
  label,
  onChatClick,
  isOpen = false,
  onClose,
}: ContactInfoProps) {
  return (
    <div className={styles.container}>
      {label && <div className={styles.label}>{label}</div>}
      <div className={styles.name}>{name}</div>

      <div className={styles.infoList}>
        {email && email !== '-' && (
          <div className={styles.infoRow}>
            <span className={styles.infoKey}>
              <Icon name="mail" size={16} style={{ marginRight: '6px' }} />
              Email:
            </span>
            <span className={styles.infoVal}>{email}</span>
          </div>
        )}
        {phone && phone !== '-' && (
          <div className={styles.infoRow}>
            <span className={styles.infoKey}>
              <Icon name="headphones" size={16} style={{ marginRight: '6px' }} />
              Telefone:
            </span>
            <span className={styles.infoVal}>{phone}</span>
          </div>
        )}
      </div>

      <button
        onClick={isOpen ? onClose : onChatClick}
        className={`${styles.chatBtn} ${isOpen ? styles.chatBtnClose : ''}`}
      >
        {isOpen ? (
          <>
            <Icon name="x" size={16} style={{ marginRight: '6px' }} />
            Fechar Chat
          </>
        ) : (
          <>
            <Icon name="chat" size={16} style={{ marginRight: '6px' }} />
            Abrir Chat
          </>
        )}
      </button>
    </div>
  );
}
