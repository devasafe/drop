import { useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { Input } from '../ui/Input';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import styles from './PasswordField.module.css';

export interface PasswordFieldProps {
  id?: string; label: string; ariaLabel?: string; value: string; onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password'; hint?: string; error?: string;
}

/** Senha com "olho" (o protótipo tira o "confirmar senha": ver o que digitou resolve). */
export function PasswordField({ id, label, ariaLabel, value, onChange, autoComplete, hint, error }: PasswordFieldProps) {
  const [shown, setShown] = useState(false);
  return (
    <div className={styles.wrap}>
      <Input id={id} label={label} aria-label={ariaLabel} type={shown ? 'text' : 'password'} value={value}
        onChange={onChange} autoComplete={autoComplete} hint={hint} error={error} />
      <button type="button" className={styles.toggle} aria-label={shown ? 'Ocultar senha' : 'Mostrar senha'}
        aria-pressed={shown} onClick={() => setShown((v) => !v)}>
        {shown
          ? <EyeOff size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
          : <Eye size={20} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />}
      </button>
    </div>
  );
}
