import { useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { ChevronDown } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useOverlay } from '../../contexts/OverlayContext';
import { imageUrl } from '../../lib/config';
import AccountMenu from './AccountMenu';
import styles from './AccountMenuButton.module.css';

/**
 * Avatar que abre o AccountMenu (identidade + troca de role + Conta) num
 * popover, via o OverlayProvider (um overlay por vez). Deslogado → /login.
 * Reutilizável (usado no AppHeader da home; futura migração do Nav global).
 */
export default function AccountMenuButton() {
  const { user } = useAuth() || {};
  const overlay = useOverlay();
  const router = useRouter();
  const ref = useRef<HTMLDivElement>(null);
  const open = overlay.isOpen('account');

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) overlay.close('account');
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [overlay]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') overlay.close(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [overlay]);

  if (!user) {
    return (
      <button type="button" className={styles.trigger} aria-label="Entrar na conta" onClick={() => router.push('/login')}>
        <span className={styles.avatar} aria-hidden="true">?</span>
      </button>
    );
  }

  const initial = user.name?.charAt(0).toUpperCase() || '?';

  return (
    <div className={styles.wrap} ref={ref}>
      <button
        type="button"
        className={styles.trigger}
        aria-label="Abrir menu da conta"
        aria-expanded={open}
        onClick={() => overlay.toggle('account')}
      >
        <span className={styles.avatar}>
          {user.photo ? (
            <img src={imageUrl(user.photo)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: 'inherit' }} />
          ) : (
            initial
          )}
        </span>
        <ChevronDown size={16} className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} aria-hidden="true" />
      </button>
      {open && (
        <div className={styles.popover}>
          <AccountMenu onNavigate={() => overlay.close('account')} />
        </div>
      )}
    </div>
  );
}
