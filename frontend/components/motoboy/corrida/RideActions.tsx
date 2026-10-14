import { MapPinned, MessageCircle, Phone } from 'lucide-react';
import styles from './Corrida.module.css';

export interface RideActionsProps {
  maps: string | null;
  tel: string | null;
  onChat?: () => void;
  chatLabel: string;
  callLabel: string;
  /** Botões com texto ("Ligar para a loja", "Mensagem") em vez de só ícone (retirada atrasada). */
  withText?: boolean;
}

/** "Abrir no mapa" (app externo), ligar e mensagem, 48 px (protótipo `.u-btns`). */
export function RideActions({ maps, tel, onChat, chatLabel, callLabel, withText }: RideActionsProps) {
  const iconCls = withText ? styles.action : `${styles.action} ${styles.actionIcon}`;
  return (
    <div className={styles.actions}>
      {maps && (
        <a className={styles.action} href={maps} target="_blank" rel="noopener noreferrer">
          <MapPinned size={18} aria-hidden="true" /> Abrir no mapa
        </a>
      )}
      {tel && (
        <a className={iconCls} href={tel} aria-label={callLabel}>
          <Phone size={18} aria-hidden="true" />{withText && <span aria-hidden="true">{callLabel}</span>}
        </a>
      )}
      {onChat && (
        <button type="button" className={iconCls} onClick={onChat} aria-label={chatLabel}>
          <MessageCircle size={18} aria-hidden="true" />{withText && <span aria-hidden="true">Mensagem</span>}
        </button>
      )}
    </div>
  );
}

export default RideActions;
