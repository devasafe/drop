import { useEffect, useState } from 'react';
import { Alert } from '../../ui/Alert';
import { useToast } from '../../ui/Toast';
import { usePushNotifications } from '../../../hooks/usePushNotifications';
import styles from './OrderPushPrompt.module.css';

/** "Agora não" fica lembrado no aparelho; o interruptor de Conta → Notificações continua lá. */
export const PUSH_PROMPT_DISMISS_KEY = 'drop.cliente.pushPromptDismissed';

function readDismissed(): boolean {
  try {
    return window.localStorage.getItem(PUSH_PROMPT_DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}

/**
 * Convite para ativar o push na tela do pedido em andamento: é quando o cliente quer saber
 * do pedido com o app fechado. Some se o aparelho já está inscrito, não suporta push, negou
 * a permissão ou o cliente dispensou.
 */
export function OrderPushPrompt() {
  const push = usePushNotifications();
  const { showToast } = useToast();
  const [dismissed, setDismissed] = useState(true);

  useEffect(() => { setDismissed(readDismissed()); }, []);

  if (dismissed || !push.supported || push.subscribed || push.permission === 'denied') return null;

  const enable = async () => {
    const ok = await push.enable();
    if (ok) showToast('Avisos ativados', 'success');
    else if (push.permission === 'denied' || (typeof Notification !== 'undefined' && Notification.permission === 'denied')) {
      showToast('Avisos bloqueados neste navegador. Libere as notificações nas configurações do site.', 'error');
    } else showToast('Não foi possível ativar os avisos agora.', 'error');
  };

  const dismiss = () => {
    try {
      window.localStorage.setItem(PUSH_PROMPT_DISMISS_KEY, '1');
    } catch {
      /* sem armazenamento: some só nesta visita */
    }
    setDismissed(true);
  };

  return (
    <div className={styles.wrap}>
      <Alert tone="info" title="Ative os avisos do pedido" action={{ label: push.busy ? 'Ativando…' : 'Ativar avisos', onClick: enable }}>
        Saiba quando a loja aceitar e quando seu pedido sair para entrega, mesmo com o app fechado.
      </Alert>
      <button type="button" className={styles.dismiss} onClick={dismiss}>Agora não</button>
    </div>
  );
}
