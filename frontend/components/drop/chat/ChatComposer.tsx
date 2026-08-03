import styles from './ChatComposer.module.css';

export interface ChatComposerProps {
  value: string;
  onChange: (text: string) => void;
  onSend: () => void;
  disabled?: boolean;
}

/**
 * Composer do widget de chat: campo de texto + botão "Enviar". Enter (sem
 * shift) dispara o envio; o botão desabilita quando o texto está vazio (ou
 * quando `disabled` é forçado pelo container).
 */
export function ChatComposer({ value, onChange, onSend, disabled }: ChatComposerProps) {
  const isDisabled = disabled ?? !value.trim();

  return (
    <div className={styles.composer}>
      <input
        type="text"
        className={styles.input}
        placeholder="Sua mensagem..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <button
        type="button"
        className={styles.send}
        onClick={onSend}
        disabled={isDisabled}
        title="Enviar (Enter)"
      >
        Enviar
      </button>
    </div>
  );
}
