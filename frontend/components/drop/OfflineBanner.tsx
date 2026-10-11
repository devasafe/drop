import { WifiOff } from 'lucide-react';
import { useOnline } from '../../hooks/useOnline';
import styles from './OfflineBanner.module.css';

/** Faixa fixa "Sem conexão" (spec §6.4): toda tela do cliente prevê o offline. */
export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className={styles.banner} role="status">
      <WifiOff size={16} strokeWidth={1.75} aria-hidden="true" />
      <span>Sem conexão. Mostrando o que já estava salvo.</span>
    </div>
  );
}
