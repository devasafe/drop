import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useRef } from 'react';
import { useAdminNav } from '../../hooks/useAdminNav';
import { activeAdminTabKey, type AdminAreaKey } from '../../lib/adminNav';
import styles from './AdminTabs.module.css';

/**
 * Barra de abas de uma área do admin (spec D3a 3.4): páginas irmãs, só as visíveis ao papel no modo atual.
 * Some quando sobra menos de 2 abas. No celular rola na horizontal e mantém a aba ativa à vista.
 */
export function AdminTabs({ area }: { area: AdminAreaKey }) {
  const router = useRouter();
  const { areas } = useAdminNav();
  const activeRef = useRef<HTMLAnchorElement>(null);
  const visible = areas.find((a) => a.key === area);
  const active = visible ? activeAdminTabKey(visible, router?.pathname ?? '', router?.query as Record<string, string | string[] | undefined>) : null;

  useEffect(() => {
    const el = activeRef.current;
    if (el && typeof el.scrollIntoView === 'function') el.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [active]);

  if (!visible || visible.tabs.length < 2) return null;

  return (
    <nav className={styles.tabs} aria-label={`Abas de ${visible.label}`}>
      {visible.tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={t.href}
            ref={on ? activeRef : undefined}
            className={on ? `${styles.tab} ${styles.on}` : styles.tab}
            aria-current={on ? 'page' : undefined}
          >
            {t.label}
          </Link>
        );
      })}
    </nav>
  );
}

export default AdminTabs;
