import { useState } from 'react';
import { Button } from '../ui/Button';
import styles from './PushTestButton.module.css';

const DELAY_SECONDS = 10;

/**
 * "Testar com o app fechado": manda um aviso daqui a 10 s, tempo de fechar o app (ou bloquear
 * a tela) e ver chegar como chegaria um pedido ou uma corrida. Só aparece com os avisos ligados.
 */
export function PushTestButton({ sendTest }: { sendTest: (delaySeconds?: number) => Promise<void> }) {
  const [sent, setSent] = useState(false);
  const send = async () => {
    setSent(true);
    await sendTest(DELAY_SECONDS);
  };
  return (
    <div className={styles.wrap}>
      <Button variant="secondary" size="sm" onClick={send} disabled={sent}>Testar com o app fechado</Button>
      <p className={styles.hint} role="status">
        {sent
          ? `Feche o app ou bloqueie a tela agora. O aviso chega em uns ${DELAY_SECONDS} segundos.`
          : 'Mandamos um aviso de teste para você conferir que ele chega mesmo com o app fechado.'}
      </p>
    </div>
  );
}
