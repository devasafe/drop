import styles from './CourierCard.module.css';

export interface CourierInfo {
  name?: string | null;
  photo?: string | null;
  plate?: string | null;
  rating?: number | null;
  phone?: string | null;
}

interface Props {
  courier: CourierInfo;
  onChat?: () => void;
}

/**
 * Card do entregador (camada UI): foto, nome, veículo (placa) e nota + ações
 * de ligar/chat. Dados vêm de `delivery.motoboyObj` (enriquecido no backend).
 */
export function CourierCard({ courier, onChat }: Props) {
  const name = courier.name || 'Seu entregador';
  const initial = name.charAt(0).toUpperCase();

  return (
    <div className={styles.card}>
      {courier.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={courier.photo} alt={name} className={styles.avatar} />
      ) : (
        <div className={`${styles.avatar} ${styles.avatarFallback}`}>{initial}</div>
      )}

      <div className={styles.info}>
        <span className={styles.name}>
          <strong>{name}</strong> está chegando
        </span>
        <span className={styles.meta}>
          {courier.plate && <span>{courier.plate}</span>}
          {courier.rating != null && (
            <span className={styles.rating}>
              ★ {courier.rating.toFixed(1).replace('.', ',')}
            </span>
          )}
        </span>
      </div>

      <div className={styles.actions}>
        {onChat && (
          <button type="button" className={styles.action} onClick={onChat} aria-label="Conversar" title="Conversar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" strokeLinejoin="round" />
            </svg>
          </button>
        )}
        {courier.phone && (
          <a className={styles.action} href={`tel:${courier.phone}`} aria-label="Ligar" title="Ligar">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2 4.2 2 2 0 0 1 4 2h3a2 2 0 0 1 2 1.7c.1.9.3 1.8.6 2.6a2 2 0 0 1-.5 2.1L8 9.6a16 16 0 0 0 6 6l1.2-1.2a2 2 0 0 1 2.1-.4c.8.3 1.7.5 2.6.6a2 2 0 0 1 1.7 2z" strokeLinejoin="round" />
            </svg>
          </a>
        )}
      </div>
    </div>
  );
}

export default CourierCard;
