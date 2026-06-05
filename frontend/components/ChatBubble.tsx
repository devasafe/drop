import React, { useEffect } from 'react';
import Icon from './Icon';
import styles from './ChatBubble.module.css';

interface Message {
  _id: string;
  senderId: string;
  senderName: string;
  senderRole: string;
  text: string;
  status: 'sent' | 'delivered' | 'read';
  createdAt: Date;
  attachments?: any[];
}

interface ChatBubbleProps {
  message: Message;
  isOwn: boolean;
  onMarkAsRead?: (messageId: string) => void;
}

export const ChatBubble: React.FC<ChatBubbleProps> = ({ message, isOwn, onMarkAsRead }) => {
  const bubbleRef = React.useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onMarkAsRead || isOwn || message.status === 'read') return;

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            const timer = setTimeout(() => onMarkAsRead(message._id), 500);
            return () => clearTimeout(timer);
          }
        });
      },
      { threshold: 0.5 }
    );

    if (bubbleRef.current) observer.observe(bubbleRef.current);
    return () => observer.disconnect();
  }, [message._id, message.status, isOwn, onMarkAsRead]);

  const formatTime = (date: Date) =>
    new Date(date).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

  const roleMap: Record<string, { label: string; cls: string }> = {
    loja:    { label: 'Loja',    cls: styles.roleBadgeLoja },
    lojista: { label: 'Loja',    cls: styles.roleBadgeLoja },
    cliente: { label: 'Cliente', cls: styles.roleBadgeCliente },
    motoboy: { label: 'Motoboy', cls: styles.roleBadgeMotoboy },
    suporte: { label: 'Suporte', cls: styles.roleBadgeSupporte },
  };
  const role = roleMap[message.senderRole] ?? { label: message.senderRole, cls: styles.roleBadgeSupporte };

  const statusIcon = message.status === 'read' ? '✓✓' : message.status === 'delivered' ? '✓✓' : '✓';
  const statusCls  = message.status === 'read' ? styles.statusRead : message.status === 'delivered' ? styles.statusDelivered : styles.statusSent;

  return (
    <div ref={bubbleRef} className={`${styles.bubble} ${isOwn ? styles.bubbleOwn : styles.bubbleOther}`}>
      <div className={`${styles.content} ${isOwn ? styles.contentOwn : styles.contentOther}`}>
        {/* Nome + role */}
        {!isOwn && (
          <div className={styles.header}>
            <span>{message.senderName}</span>
            <span className={`${styles.roleBadge} ${role.cls}`}>{role.label}</span>
          </div>
        )}

        {/* Bolha de mensagem */}
        <div className={`${styles.message} ${isOwn ? styles.messageOwn : styles.messageOther}`}>
          {message.text}

          {message.attachments && message.attachments.length > 0 && (
            <div className={styles.attachments}>
              {message.attachments.map((att: any, idx: number) => (
                <div key={idx} className={styles.attachment}>
                  {att.type === 'image' && <img src={att.url} alt="Imagem" />}
                  {att.type === 'location' && <span><Icon name="map-pin" size={14} /> Localização</span>}
                  {att.type === 'file' && <span><Icon name="file-text" size={14} /> {att.metadata?.fileName || 'Arquivo'}</span>}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Hora + status */}
        <div className={styles.footer}>
          <span className={styles.timestamp}>{formatTime(message.createdAt)}</span>
          {isOwn && <span className={`${styles.status} ${statusCls}`}>{statusIcon}</span>}
        </div>
      </div>
    </div>
  );
};

export default ChatBubble;
