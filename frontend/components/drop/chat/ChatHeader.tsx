import styles from './ChatHeader.module.css';
import Icon from '../../Icon';

export interface ChatHeaderProps {
  title: string;
  subtitle?: string;
  onMinimize: () => void;
  onClose?: () => void;
  onBack?: () => void;
}

/**
 * Cabeçalho do widget de chat: título/subtítulo (calculados pelo container a
 * partir da aba ativa) + ação de minimizar, com botões opcionais de voltar e
 * fechar (só aparecem quando `onBack`/`onClose` são passados).
 */
export function ChatHeader({ title, subtitle, onMinimize, onClose, onBack }: ChatHeaderProps) {
  return (
    <div className={styles.header}>
      <div className={styles.titleGroup}>
        {onBack && (
          <button
            type="button"
            className={styles.iconButton}
            onClick={onBack}
            aria-label="voltar"
            title="Voltar para conversas"
          >
            <Icon name="arrow-left" size={16} />
          </button>
        )}
        <div className={styles.texts}>
          <div className={styles.title}>{title}</div>
          {subtitle && <div className={styles.subtitle}>{subtitle}</div>}
        </div>
      </div>
      <div className={styles.actions}>
        <button
          type="button"
          className={styles.iconButton}
          onClick={onMinimize}
          aria-label="minimizar"
          title="Minimizar"
        >
          <Icon name="minus" size={16} />
        </button>
        {onClose && (
          <button
            type="button"
            className={styles.iconButton}
            onClick={onClose}
            aria-label="fechar"
            title="Fechar"
          >
            <Icon name="x" size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
