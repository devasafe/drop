import { ReactNode } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import styles from './Alert.module.css';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';

export interface AlertProps {
  tone: AlertTone;
  title?: string;
  children?: ReactNode;
  /** Como resolver, em uma ação: "Trocar endereço", "Informar CPF". */
  action?: { label: string; onClick: () => void };
  className?: string;
}

const ICON = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle };

/**
 * Aviso inline (DS v2): fora da área, CPF faltando, aviso de taxa.
 * Estado nunca só por cor: sempre ícone + texto. O erro diz o que houve e
 * como resolver (de preferência com `action`). `error` interrompe o leitor
 * de tela (role=alert); os demais tons são anunciados com calma (status).
 */
export function Alert({ tone, title, children, action, className }: AlertProps) {
  const Icon = ICON[tone];
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={[styles.alert, styles[tone], className].filter(Boolean).join(' ')}
    >
      <Icon className={styles.icon} size={20} strokeWidth={1.75} aria-hidden="true" />
      <div className={styles.body}>
        {title && <p className={styles.title}>{title}</p>}
        {children && <div className={styles.text}>{children}</div>}
        {action && (
          <button type="button" className={styles.action} onClick={action.onClick}>
            {action.label}
          </button>
        )}
      </div>
    </div>
  );
}
