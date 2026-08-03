import styles from './MessageBubble.module.css';
import type { Message } from './types';

export function MessageBubble({ message, isOwn }: { message: Message; isOwn: boolean }) {
  const time = new Date(message.createdAt || message.timestamp || Date.now())
    .toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  return (
    <div className={`${styles.row} ${isOwn ? styles.rowOwn : ''}`}>
      <div className={`${styles.bubble} ${isOwn ? styles.own : styles.other}`}>
        <p className={styles.text}>{message.text}</p>
        <time className={styles.time}>{time}</time>
      </div>
    </div>
  );
}
