import { useEffect, useState } from 'react';

/** true enquanto o navegador diz que há conexão (no SSR: true). */
export function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    const sync = () => setOnline(!(typeof navigator !== 'undefined' && navigator.onLine === false));
    sync();
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    return () => { window.removeEventListener('online', sync); window.removeEventListener('offline', sync); };
  }, []);
  return online;
}
