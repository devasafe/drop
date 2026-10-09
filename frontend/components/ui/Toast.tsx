import {
  ReactNode,
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';
import { CheckCircle2, Info, XCircle, type LucideIcon } from 'lucide-react';
import styles from './Toast.module.css';
import { ICON_STROKE_WIDTH } from './Icon';
import { Button } from './Button';

export type ToastTone = 'success' | 'error' | 'info';

export interface ToastProps {
  message: string;
  tone?: ToastTone;
  /** Ação opcional (ex.: "Desfazer"), exibida como botão terciário. */
  action?: ToastAction;
  /** Chamado após o clique na ação, para o provedor fechar o toast. */
  onAction?: () => void;
}

export interface ToastAction {
  label: string;
  onClick: () => void;
}

export interface ToastOptions {
  action?: ToastAction;
  /** Sobrescreve a duração padrão (4 s sem ação, 6 s com ação). */
  durationMs?: number;
}

const TONE_ICON: Record<ToastTone, LucideIcon> = {
  success: CheckCircle2,
  error: XCircle,
  info: Info,
};

/**
 * Toast individual — cor por tom: `success` = `--success`, `error` =
 * `--danger`, `info` = `--info` (neutro, sem roxo). Componente
 * apresentacional puro; quem decide quando exibir/esconder é
 * `ToastProvider`/`useToast`.
 */
export function Toast({ message, tone = 'info', action, onAction }: ToastProps) {
  const ToneIcon = TONE_ICON[tone];
  return (
    <div className={[styles.toast, styles[tone]].join(' ')} role={tone === 'error' ? 'alert' : 'status'}>
      <ToneIcon className={styles.icon} size={18} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
      <span className={styles.message}>{message}</span>
      {action && (
        <Button
          variant="tertiary"
          size="sm"
          onClick={() => {
            action.onClick();
            onAction?.();
          }}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}

interface ToastEntry {
  id: number;
  message: string;
  tone: ToastTone;
  action?: ToastAction;
}

interface ToastContextValue {
  showToast: (message: string, tone?: ToastTone, opts?: ToastOptions) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const TOAST_DURATION_MS = 4000;
const TOAST_ACTION_DURATION_MS = 6000;

/** Provedor global: monta o container fixo e o stack de `Toast`. Envolva o app (ex.: `_app.tsx`). */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastEntry[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts(prev => prev.filter(t => t.id !== id));
  }, []);

  const showToast = useCallback(
    (message: string, tone: ToastTone = 'info', opts?: ToastOptions) => {
      const id = Date.now() + Math.random();
      setToasts(prev => [...prev, { id, message, tone, action: opts?.action }]);
      const duration =
        opts?.durationMs ?? (opts?.action ? TOAST_ACTION_DURATION_MS : TOAST_DURATION_MS);
      setTimeout(() => dismiss(id), duration);
    },
    [dismiss]
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className={styles.stack} aria-live="polite">
        {toasts.map(t => (
          <Toast
            key={t.id}
            message={t.message}
            tone={t.tone}
            action={t.action}
            onAction={() => dismiss(t.id)}
          />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

/** `const { showToast } = useToast();` — precisa estar dentro de `<ToastProvider>`. */
export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast deve ser usado dentro de <ToastProvider>');
  }
  return ctx;
}
