import { useId } from 'react';
import ui from './Dinheiro.module.css';

export interface TextAreaFieldProps {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  hint?: string;
  rows?: number;
}

/** Campo de texto longo (motivo, nota da conferência) com rótulo ligado ao campo. */
export function TextAreaField({ label, value, onChange, placeholder, hint, rows = 3 }: TextAreaFieldProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  return (
    <div className={ui.field}>
      <label htmlFor={id} className={ui.fieldLabel}>{label}</label>
      <textarea
        id={id}
        className={ui.textarea}
        value={value}
        placeholder={placeholder}
        rows={rows}
        aria-describedby={hint ? hintId : undefined}
        onChange={(e) => onChange(e.target.value)}
      />
      {hint && <p id={hintId} className={ui.hint}>{hint}</p>}
    </div>
  );
}

export default TextAreaField;
