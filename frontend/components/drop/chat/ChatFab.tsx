import styles from './ChatFab.module.css';
import Icon from '../../Icon';

export interface ChatFabProps {
  unreadTotal?: number;
  onOpen: () => void;
}

/**
 * Aparência do botão flutuante de abrir o chat: botão redondo + ícone + badge
 * de não-lidas. O posicionamento/arrasto (useDraggableFab, movedRef, style de
 * posição) fica no container — este componente não tem posicionamento fixo
 * próprio, é só a aparência.
 */
export function ChatFab({ unreadTotal = 0, onOpen }: ChatFabProps) {
  return (
    <button type="button" className={styles.fab} onClick={onOpen} aria-label="Abrir chat" title="Abrir chat">
      <Icon name="chat" size={24} />
      {unreadTotal > 0 && (
        <span className={styles.badge}>{unreadTotal > 99 ? '99+' : unreadTotal}</span>
      )}
    </button>
  );
}
