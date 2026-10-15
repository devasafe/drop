import { ReactNode, useEffect, useRef, useState } from 'react';
import { Sheet } from '../ui/Sheet';
import { Button } from '../ui/Button';
import { adminErrorMessage } from '../../lib/adminErrors';
import styles from './AdminSheet.module.css';

export interface AdminSheetPrimary {
  label: string;
  /** Pode devolver Promise: enquanto roda, o botão mostra "Enviando…" e nada fecha. Erro → aparece dentro. */
  onClick: () => void | Promise<void>;
  tone?: 'danger' | 'default';
  disabled?: boolean;
}

export interface AdminSheetProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  primary?: AdminSheetPrimary;
  /** Rótulo do botão que fecha (padrão "Cancelar"). */
  secondaryLabel?: string;
}

/**
 * Confirmação e formulário curto do admin (spec D3a 4), no lugar de prompt/confirm/alert.
 * Sobe de baixo no celular e é painel lateral no computador (Sheet 'side'); foco preso e Esc vêm do Sheet.
 * Quem fecha no sucesso é a tela (open={false}).
 */
export function AdminSheet({ open, title, onClose, children, primary, secondaryLabel = 'Cancelar' }: AdminSheetProps) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const close = () => {
    if (!busy) onClose();
  };

  const run = async () => {
    if (!primary || busy || primary.disabled) return;
    setBusy(true);
    setError(null);
    try {
      await primary.onClick();
    } catch (err) {
      if (alive.current) setError(adminErrorMessage(err));
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <Sheet open={open} onClose={close} title={title} presentation="side">
      <div className={styles.body}>{children}</div>
      {error && <p className={styles.error} role="alert">{error}</p>}
      <div className={styles.footer}>
        <Button variant="secondary" className={styles.btn} onClick={close} disabled={busy}>
          {secondaryLabel}
        </Button>
        {primary && (
          <Button
            variant={primary.tone === 'danger' ? 'danger' : 'primary'}
            className={styles.btn}
            onClick={run}
            disabled={busy || !!primary.disabled}
          >
            {busy ? 'Enviando…' : primary.label}
          </Button>
        )}
      </div>
    </Sheet>
  );
}

export default AdminSheet;
