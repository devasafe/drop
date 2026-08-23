import { useState } from 'react';
import styles from './NavCard.module.css';

interface Props {
  instruction: string;
  etaText: string;
  distanceText?: string;
  address?: string;
  pinLabel: string;
  /** PIN a EXIBIR (perna de retirada: motoboy mostra à loja). */
  pin?: string | null;
  target?: { lat: number; lng: number } | null;
  /** Perna de entrega: motoboy DIGITA o PIN do cliente pra confirmar. */
  onConfirm?: (pin: string) => Promise<{ ok: boolean; error?: string }>;
}

/**
 * Card de navegação do motoboy (camada UI): instrução da perna atual, ETA/distância,
 * endereço, e ou o PIN de retirada (exibido, pra mostrar à loja) ou o campo de PIN
 * de entrega (digitado — o cliente passa o PIN). Atalhos p/ Google Maps / Waze.
 */
export function NavCard({ instruction, etaText, distanceText, address, pinLabel, pin, target, onConfirm }: Props) {
  const [pinInput, setPinInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gmaps = target
    ? `https://www.google.com/maps/dir/?api=1&destination=${target.lat},${target.lng}&travelmode=driving`
    : null;
  const waze = target ? `https://waze.com/ul?ll=${target.lat},${target.lng}&navigate=yes` : null;

  const submit = async () => {
    if (!onConfirm || submitting || pinInput.trim().length < 4) return;
    setSubmitting(true);
    setError(null);
    const r = await onConfirm(pinInput.trim());
    setSubmitting(false);
    if (r && !r.ok) setError(r.error || 'PIN inválido');
  };

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <div>
          <div className={styles.instruction}>{instruction}</div>
          {address && <div className={styles.address}>{address}</div>}
        </div>
        <div className={styles.eta}>
          <div className={styles.etaTime}>{etaText}</div>
          {distanceText && <div className={styles.etaDist}>{distanceText}</div>}
        </div>
      </div>

      {onConfirm ? (
        <div className={styles.confirm}>
          <span className={styles.confirmLabel}>{pinLabel} — peça ao cliente</span>
          <div className={styles.confirmRow}>
            <input
              className={styles.pinInput}
              inputMode="numeric"
              placeholder="• • • • •"
              value={pinInput}
              maxLength={8}
              onChange={(e) => { setPinInput(e.target.value.toUpperCase()); setError(null); }}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); }}
            />
            <button
              type="button"
              className={styles.confirmBtn}
              onClick={submit}
              disabled={submitting || pinInput.trim().length < 4}
            >
              {submitting ? 'Confirmando…' : 'Confirmar entrega'}
            </button>
          </div>
          {error && <div className={styles.error}>{error}</div>}
        </div>
      ) : pin ? (
        <div className={styles.pinRow}>
          <span className={styles.pinLabel}>{pinLabel}</span>
          <span className={styles.pinValue}>{pin}</span>
        </div>
      ) : null}

      {target && (
        <div className={styles.actions}>
          {gmaps && (
            <a className={`${styles.navBtn} ${styles.primary}`} href={gmaps} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
                <path d="M3 11l19-9-9 19-2-8-8-2z" />
              </svg>
              Google Maps
            </a>
          )}
          {waze && (
            <a className={styles.navBtn} href={waze} target="_blank" rel="noopener noreferrer">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2">
                <circle cx="12" cy="11" r="8" />
                <path d="M8 20l2-3M16 20l-2-3M9 10h.01M15 10h.01M9 13c1 1 5 1 6 0" strokeLinecap="round" />
              </svg>
              Waze
            </a>
          )}
        </div>
      )}
    </div>
  );
}

export default NavCard;
