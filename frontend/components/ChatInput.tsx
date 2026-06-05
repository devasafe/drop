import React, { useState, useRef } from 'react';
import Icon from './Icon';
import styles from './ChatInput.module.css';

interface ChatInputProps {
  onSendMessage: (text: string, attachments?: any[]) => void;
  onTyping?: (isTyping: boolean) => void;
  disabled?: boolean;
  placeholder?: string;
}

/**
 * Input de chat com suporte a anexos
 *
 * @example
 * <ChatInput
 *   onSendMessage={handleSendMessage}
 *   onTyping={handleTyping}
 *   placeholder="Digite sua mensagem..."
 * />
 */
export const ChatInput: React.FC<ChatInputProps> = ({
  onSendMessage,
  onTyping,
  disabled = false,
  placeholder = 'Digite uma mensagem...'
}) => {
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<any[]>([]);
  const [isComposing, setIsComposing] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Lidar com digitação
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    setText(value);

    // Enviar indicador de digitação
    if (onTyping) {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }

      if (value.length > 0) {
        onTyping(true);

        // Auto-parar de digitar após 3 segundos
        typingTimeoutRef.current = setTimeout(() => {
          onTyping(false);
        }, 3000);
      }
    }
  };

  /**
   * Enviar mensagem
   */
  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();

    if (!text.trim()) return;

    onSendMessage(text, attachments.length > 0 ? attachments : undefined);
    setText('');
    setAttachments([]);

    if (onTyping) {
      onTyping(false);
    }
  };

  /**
   * Lidar com anexos
   */
  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.currentTarget.files;
    if (!files) return;

    for (let i = 0; i < files.length; i++) {
      const file = files[i];

      if (file.type.startsWith('image/')) {
        // Para imagens, ler como data URL
        const reader = new FileReader();
        reader.onload = (event) => {
          setAttachments((prev) => [
            ...prev,
            {
              type: 'image',
              url: event.target?.result as string,
              metadata: {
                fileName: file.name,
                fileSize: file.size
              }
            }
          ]);
        };
        reader.readAsDataURL(file);
      } else {
        // Para outros arquivos, apenas adicionar metadados
        setAttachments((prev) => [
          ...prev,
          {
            type: 'file',
            metadata: {
              fileName: file.name,
              fileSize: file.size,
              fileType: file.type
            }
          }
        ]);
      }
    }

    // Resetar input
    e.currentTarget.value = '';
  };

  /**
   * Remover anexo
   */
  const removeAttachment = (index: number) => {
    setAttachments((prev) => prev.filter((_, i) => i !== index));
  };

  /**
   * Enviar localização
   */
  const handleLocationShare = () => {
    if (!navigator.geolocation) {
      alert('Geolocalização não disponível');
      return;
    }

    navigator.geolocation.getCurrentPosition((position) => {
      const { latitude, longitude, accuracy } = position.coords;

      setAttachments((prev) => [
        ...prev,
        {
          type: 'location',
          metadata: {
            latitude,
            longitude,
            accuracy
          }
        }
      ]);
    });
  };

  return (
    <div className={styles.chatInput}>
      {/* Preview de anexos */}
      {attachments.length > 0 && (
        <div className={styles.attachmentsPreview}>
          {attachments.map((attachment, idx) => (
            <div key={idx} className={styles.attachmentPreview}>
              {attachment.type === 'image' && (
                <div className={styles.imagePreview}>
                  <img src={attachment.url} alt="Preview" />
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => removeAttachment(idx)}
                  >
                    ✕
                  </button>
                </div>
              )}
              {attachment.type === 'location' && (
                <div className={styles.locationPreview}>
                  <span><Icon name="map-pin" size={14} /> Localização</span>
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => removeAttachment(idx)}
                  >
                    ✕
                  </button>
                </div>
              )}
              {attachment.type === 'file' && (
                <div className={styles.filePreview}>
                  <span><Icon name="file-text" size={14} /> {attachment.metadata?.fileName}</span>
                  <button
                    type="button"
                    className={styles.removeButton}
                    onClick={() => removeAttachment(idx)}
                  >
                    ✕
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Form */}
      <form onSubmit={handleSendMessage} className={styles.form}>
        <div className={styles.inputGroup}>
          {/* Botões de ação */}
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.actionButton}
              onClick={() => fileInputRef.current?.click()}
              title="Anexar arquivo"
              disabled={disabled}
            >
              <Icon name="file-text" size={16} />
            </button>
            <button
              type="button"
              className={styles.actionButton}
              onClick={handleLocationShare}
              title="Compartilhar localização"
              disabled={disabled}
            >
              <Icon name="map-pin" size={16} />
            </button>
          </div>

          {/* Input de texto */}
          <textarea
            value={text}
            onChange={handleInputChange}
            onCompositionStart={() => setIsComposing(true)}
            onCompositionEnd={() => setIsComposing(false)}
            placeholder={placeholder}
            className={styles.textarea}
            disabled={disabled}
            rows={1}
          />

          {/* Botão enviar */}
          <button
            type="submit"
            className={styles.sendButton}
            disabled={!text.trim() || disabled || isComposing}
            title="Enviar mensagem"
          >
            <Icon name="send" size={16} />
          </button>
        </div>
      </form>

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        onChange={handleFileSelect}
        style={{ display: 'none' }}
        accept="image/*,.pdf,.doc,.docx,.txt"
      />
    </div>
  );
};

export default ChatInput;
