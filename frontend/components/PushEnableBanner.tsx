import { Bell, BellRing, TriangleAlert } from 'lucide-react';
import { Button } from './ui/Button';
import { useToast } from './ui/Toast';
import { usePushNotifications } from '../hooks/usePushNotifications';
import styles from './PushEnableBanner.module.css';

interface Props {
  title?: string;
  description?: string;
}

/**
 * Banner reutilizável de "Ativar notificações" (Web Push). Mostra-se sozinho
 * conforme o estado: oferece ativar, confirma ativo, ou avisa se bloqueado.
 * Genérico — serve pra lojista, admin ou qualquer usuário logado.
 */
export default function PushEnableBanner({ title, description }: Props) {
  const { showToast } = useToast();
  const push = usePushNotifications();

  if (!push.supported) return null;

  const enable = async () => {
    const ok = await push.enable();
    if (ok) { showToast('Notificações ativadas!', 'success'); push.sendTest(); }
    else if (push.permission === 'denied') showToast('Notificações bloqueadas. Libere nas configurações do navegador.', 'error');
    else showToast('Não foi possível ativar as notificações agora.', 'error');
  };

  if (push.subscribed) {
    return (
      <div className={styles.ok}>
        <BellRing size={14} aria-hidden="true" />
        <span>Notificações ativas</span>
        <button className={styles.test} onClick={() => push.sendTest()}>enviar teste</button>
      </div>
    );
  }

  if (push.permission === 'denied') {
    return (
      <div className={`${styles.banner} ${styles.warn}`}>
        <TriangleAlert size={16} aria-hidden="true" />
        <span>Notificações bloqueadas neste navegador. Libere a permissão de notificações nas configurações do site.</span>
      </div>
    );
  }

  return (
    <div className={styles.banner}>
      <Bell size={18} aria-hidden="true" />
      <div className={styles.text}>
        <strong>{title || 'Ative as notificações'}</strong>
        <span>{description || 'Seja avisado mesmo com o app fechado ou o celular bloqueado.'}</span>
      </div>
      <Button onClick={enable} size="sm" disabled={push.busy}>
        {push.busy ? 'Ativando…' : 'Ativar'}
      </Button>
    </div>
  );
}
