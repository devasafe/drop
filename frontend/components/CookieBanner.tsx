import { useEffect, useState } from 'react';
import styles from './CookieBanner.module.css';

const KEY = 'drop_cookie_consent';

export default function CookieBanner() {
  const [visible, setVisible] = useState(false);
  useEffect(() => { setVisible(!localStorage.getItem(KEY)); }, []);
  if (!visible) return null;
  const choose = (v: 'all' | 'essential') => { localStorage.setItem(KEY, v); setVisible(false); };
  return (
    <div className={styles.banner} role="dialog" aria-label="Aviso de cookies">
      <p className={styles.text}>
        Usamos cookies essenciais para manter sua sessão. <a href="/cookies">Saiba mais</a>.
      </p>
      <div className={styles.actions}>
        <button type="button" className={styles.secondary} onClick={() => choose('essential')}>Só essenciais</button>
        <button type="button" className={styles.primary} onClick={() => choose('all')}>Aceitar</button>
      </div>
    </div>
  );
}
