// frontend/components/seller/order/PickupPinEntry.tsx
import { useEffect, useId, useRef, useState } from 'react';
import { CheckCircle2 } from 'lucide-react';
import api from '../../../lib/api';
import { Button } from '../../ui/Button';
import { useOnline } from '../../../hooks/useOnline';
import { apiError } from '../../../lib/sellerApi';
import styles from './PickupPinEntry.module.css';

export const PIN_LENGTH = 5;

type Status = 'idle' | 'sending' | 'ok' | 'wrong' | 'locked' | 'error';

/**
 * A loja digita o PIN que o motoboy mostra. Envia sozinho ao completar os 5 dígitos, uma vez
 * por PIN: o mesmo PIN não é reenviado (o servidor trava após tentativas erradas). Nunca loga o PIN.
 */
export function PickupPinEntry({ deliveryId, onValidated }: { deliveryId: string; onValidated: () => void }) {
  const inputId = useId();
  const msgId = useId();
  const online = useOnline();
  const [pin, setPin] = useState('');
  const [status, setStatus] = useState<Status>('idle');
  const [message, setMessage] = useState('');
  const [attempt, setAttempt] = useState(0);
  const lastSent = useRef<string | null>(null);
  const pinRef = useRef(pin);
  pinRef.current = pin;
  const onValidatedRef = useRef(onValidated);
  onValidatedRef.current = onValidated;

  useEffect(() => {
    if (pin.length !== PIN_LENGTH || pin === lastSent.current || !online) return;
    const sent = pin;
    lastSent.current = sent;
    setStatus('sending');
    setMessage('');
    api.post(`/deliveries/${deliveryId}/validar-pin-retirada`, { pinRetirada: sent })
      .then(() => {
        if (pinRef.current !== sent) return;
        setStatus('ok');
        onValidatedRef.current();
      })
      .catch((err) => {
        if (pinRef.current !== sent) return;
        const e = apiError(err);
        if (e.status === 429) {
          setStatus('locked');
          // O 429 não consome tentativa (o servidor checa a trava antes de comparar): libera reenviar o mesmo PIN.
          lastSent.current = null;
          setMessage(e.message || 'Muitas tentativas de PIN. Espere alguns minutos.');
        } else if (e.status === 400 && /pin/i.test(e.message || '')) {
          setStatus('wrong');
          setMessage(e.message || 'PIN não confere.');
        } else {
          setStatus('error');
          setMessage(e.message || 'Não deu para validar agora. Confira a conexão.');
        }
      });
  }, [pin, online, deliveryId, attempt]);

  const onChange = (raw: string) => {
    const next = raw.replace(/\D/g, '').slice(0, PIN_LENGTH);
    setPin(next);
    if (status === 'wrong' || status === 'error') setStatus('idle');
  };

  // Falha de rede não é veredito do servidor: deixa reenviar o mesmo PIN.
  const retry = () => {
    lastSent.current = null;
    setAttempt((n) => n + 1);
  };

  const showError = status === 'wrong' || status === 'locked' || status === 'error';

  return (
    <div className={styles.wrap}>
      <label htmlFor={inputId} className={styles.label}>Peça o PIN de 5 dígitos ao motoboy e digite aqui:</label>
      <input
        id={inputId}
        className={[styles.input, status === 'wrong' && styles.inputError, status === 'ok' && styles.inputOk].filter(Boolean).join(' ')}
        inputMode="numeric"
        autoComplete="one-time-code"
        maxLength={PIN_LENGTH}
        value={pin}
        onChange={(e) => onChange(e.target.value)}
        disabled={!online || status === 'sending' || status === 'ok'}
        aria-invalid={status === 'wrong' || undefined}
        aria-describedby={showError ? msgId : undefined}
      />
      {!online && <p className={styles.note}>Sem conexão: o PIN fica bloqueado até a internet voltar.</p>}
      {status === 'sending' && <p role="status" className={styles.note}>Conferindo…</p>}
      {status === 'ok' && (
        <p role="status" className={styles.ok}><CheckCircle2 size={16} aria-hidden="true" /> Retirada confirmada</p>
      )}
      {showError && <p id={msgId} role="alert" className={styles.error}>{message}</p>}
      {status === 'wrong' && <p className={styles.note}>Peça de novo ao motoboy.</p>}
      {status === 'error' && <Button variant="tertiary" size="sm" onClick={retry}>Tentar de novo</Button>}
    </div>
  );
}
