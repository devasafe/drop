import { ReactNode, useEffect, useId, useState } from 'react';
import { useRouter } from 'next/router';
import { Menu } from 'lucide-react';
import { AdminSidebar } from './AdminSidebar';
import { ScreenErrorBoundary } from '../seller/panel/ScreenErrorBoundary';
import AccountMenuButton from '../nav/AccountMenuButton';
import { useAdminNav } from '../../hooks/useAdminNav';
import styles from './AdminShell.module.css';

const WEEKDAYS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "Quinta, 15 de outubro · 15:42" (cabeçalho do protótipo). */
export function formatAdminNow(d: Date): string {
  const hh = String(d.getHours()).padStart(2, '0');
  const mm = String(d.getMinutes()).padStart(2, '0');
  return `${WEEKDAYS[d.getDay()]}, ${d.getDate()} de ${MONTHS[d.getMonth()]} · ${hh}:${mm}`;
}

/** Só no cliente (o servidor não sabe a hora de quem vê): evita diferença de hidratação. */
function useNowLabel(): string | null {
  const [label, setLabel] = useState<string | null>(null);
  useEffect(() => {
    const tick = () => setLabel(formatAdminNow(new Date()));
    tick();
    const t = setInterval(tick, 30_000);
    return () => clearInterval(t);
  }, []);
  return label;
}

export interface AdminShellProps {
  title: string;
  /** Ações da tela, à direita do título (no celular, numa linha abaixo). */
  actions?: ReactNode;
  children: ReactNode;
}

/**
 * Casca das telas do admin (DS v2, D3a; spec 3.1): menu lateral (gaveta no celular), cabeçalho com título,
 * data e hora, ações e conta, e o corpo com fundo gelo dentro de um ScreenErrorBoundary.
 */
export function AdminShell({ title, actions, children }: AdminShellProps) {
  const router = useRouter();
  const nav = useAdminNav();
  const sideId = useId();
  const now = useNowLabel();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const asPath = router?.asPath;

  // Navegou: a gaveta fecha (nunca fica presa aberta por cima da tela nova).
  useEffect(() => { setDrawerOpen(false); }, [asPath]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setDrawerOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  const close = () => setDrawerOpen(false);

  return (
    <div className={styles.shell}>
      <AdminSidebar
        id={sideId}
        areas={nav.areas}
        open={drawerOpen}
        onClose={close}
        modeError={nav.modeError}
        onRetryMode={nav.retryMode}
      />
      {drawerOpen && <div className={styles.scrim} data-testid="admin-scrim" aria-hidden="true" onClick={close} />}
      <div className={styles.main}>
        <header className={styles.top}>
          <button
            type="button"
            className={styles.menuBtn}
            aria-label="Abrir menu"
            aria-expanded={drawerOpen}
            aria-controls={sideId}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu size={22} aria-hidden="true" />
          </button>
          <h1 className={styles.title}>{title}</h1>
          {now && <span className={styles.now}>{now}</span>}
          <div className={styles.account}><AccountMenuButton /></div>
          {actions && <div className={styles.actions}>{actions}</div>}
        </header>
        <div className={styles.body}>
          {/* Exceção de render no conteúdo: erro com "Tentar de novo"; menu e cabeçalho continuam. */}
          <ScreenErrorBoundary resetKey={asPath}>{children}</ScreenErrorBoundary>
        </div>
      </div>
    </div>
  );
}

export default AdminShell;
