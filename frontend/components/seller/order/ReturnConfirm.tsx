import { useId, useRef, useState } from 'react';
import api from '../../../lib/api';
import { Button } from '../../ui/Button';
import { apiError } from '../../../lib/sellerApi';
import styles from './ReturnConfirm.module.css';

/** O motoboy volta com o produto e mostra o PIN de devolução; a loja confirma o recebimento. */
export function ReturnConfirm({ deliveryId, onDone }: { deliveryId: string; onDone: () => void }) {
  const id = useId();
  const [pin, setPin] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);

  const submit = async () => {
    if (pin.length !== 6 || sending.current) return;
    sending.current = true;
    setBusy(true);
    setError(null);
    try {
      await api.post(`/deliveries/${deliveryId}/confirm-return`, { pinDevolucao: pin });
      setPin('');
      onDone();
    } catch (err) {
      const e = apiError(err);
      setError(e.status === 400 && /pin|inválido/i.test(e.message || '')
        ? 'PIN de devolução não confere. Confira com o motoboy.'
        : e.message || 'Não deu para confirmar agora. Tente de novo.');
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };

  return (
    <div className={styles.wrap}>
      <label htmlFor={id} className={styles.label}>PIN de devolução (6 dígitos)</label>
      <div className={styles.row}>
        <input
          id={id}
          className={styles.input}
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
          disabled={busy}
        />
        <Button onClick={submit} disabled={pin.length !== 6} loading={busy}>Confirmar devolução</Button>
      </div>
      {error && <p role="alert" className={styles.error}>{error}</p>}
    </div>
  );
}
