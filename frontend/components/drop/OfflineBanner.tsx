import { useEffect, useState } from 'react';
import { WifiOff } from 'lucide-react';
import styles from './OfflineBanner.module.css';

/** Faixa fixa "Sem conexão" (spec §6.4): toda tela do cliente prevê o offline. */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);
  useEffect(() => {
    const sync = () => setOffline(typeof navigator !== 'undefined' && navigator.onLine === false);
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);
  if (!offline) return null;
  return (
    <div className={styles.banner} role="status">
      <WifiOff size={16} strokeWidth={1.75} aria-hidden="true" />
      <span>Sem conexão. Mostrando o que já estava salvo.</span>
    </div>
  );
}
