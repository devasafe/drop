import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import Icon from '../Icon';
import { useAuth } from '../../contexts/AuthContext';
import { useBadgeCounts } from '../../hooks/useSync';
import { ADMIN_GROUPS, adminAreaForPath, adminAreaHref, adminRoleLabel, type AdminArea } from '../../lib/adminNav';
import styles from './AdminSidebar.module.css';

export interface AdminSidebarProps {
  /** id do <aside> (o botão "Abrir menu" aponta para ele em aria-controls). */
  id: string;
  areas: AdminArea[];
  /** Gaveta aberta (só tem efeito abaixo de 1024 px; no computador o menu é fixo). */
  open: boolean;
  onClose: () => void;
  modeError?: boolean;
  onRetryMode?: () => void;
}

const initials = (name?: string) =>
  (name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p.charAt(0).toUpperCase()).join('') || '?';

/** Menu do admin (protótipo .u-side): marca, grupos, itens com contador e rodapé com nome e papel. */
export function AdminSidebar({ id, areas, open, onClose, modeError, onRetryMode }: AdminSidebarProps) {
  const { user } = useAuth();
  const router = useRouter();
  const badges = useBadgeCounts();
  const closeRef = useRef<HTMLButtonElement>(null);
  const activeArea = adminAreaForPath(router?.pathname ?? '');
  const role: string | undefined = user?.activeRole || user?.role;

  // Gaveta aberta: o foco vai para o "Fechar menu" (no computador a gaveta nunca abre).
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  return (
    <aside id={id} className={open ? `${styles.side} ${styles.open}` : styles.side} aria-label="Menu do admin">
      <div className={styles.brandRow}>
        <span className={styles.brand}>
          DROP<span className={styles.dot}>·</span>admin
        </span>
        <button ref={closeRef} type="button" className={styles.close} aria-label="Fechar menu" onClick={onClose}>
          <X size={20} aria-hidden="true" />
        </button>
      </div>

      <nav className={styles.nav} aria-label="Áreas do admin">
        {ADMIN_GROUPS.map((group) => {
          const items = areas.filter((a) => a.group === group);
          if (items.length === 0) return null;
          return (
            <div key={group} className={styles.group}>
              <p className={styles.groupLabel}>{group}</p>
              {items.map((a) => {
                const active = a.key === activeArea;
                const count = a.badge === 'verifications' ? badges.verifications : 0;
                return (
                  <Link
                    key={a.key}
                    href={adminAreaHref(a)}
                    className={active ? `${styles.item} ${styles.itemActive}` : styles.item}
                    aria-current={active ? 'page' : undefined}
                    onClick={onClose}
                  >
                    <Icon name={a.icon} size={17} className={styles.icon} />
                    <span className={styles.itemLabel}>{a.label}</span>
                    {count > 0 && <span className={styles.count}>{count > 99 ? '99+' : count}</span>}
                  </Link>
                );
              })}
            </div>
          );
        })}
        {modeError && (
          <div className={styles.modeError} role="alert">
            <p className={styles.modeErrorText}>Não deu para ler o modo da plataforma. As áreas de dinheiro ficam escondidas até a leitura voltar.</p>
            {onRetryMode && (
              <button type="button" className={styles.retry} onClick={onRetryMode}>Tentar de novo</button>
            )}
          </div>
        )}
      </nav>

      <div className={styles.footer}>
        <span className={styles.avatar} aria-hidden="true">{initials(user?.name)}</span>
        <span className={styles.who}>
          <span className={styles.name}>{user?.name || 'Equipe'}</span>
          <span className={styles.role}>{adminRoleLabel(role)}</span>
        </span>
      </div>
    </aside>
  );
}

export default AdminSidebar;
