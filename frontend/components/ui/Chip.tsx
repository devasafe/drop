import { MouseEventHandler, ReactNode } from 'react';
import styles from './Chip.module.css';

export interface ChipProps {
  icon?: ReactNode;
  label: string;
  active?: boolean;
  onClick?: MouseEventHandler<HTMLButtonElement>;
}

/**
 * Categoria inline em pílula (ícone + texto), como `.chip`/`.chip.on` do
 * mock canônico. Não é icon-box (spec §3.1-F): o ícone é pequeno e vive ao
 * lado do texto dentro da mesma pílula, nunca num quadrado separado.
 * `active` = fundo roxo sólido; inativo = fundo neutro translúcido.
 */
export function Chip({ icon, label, active = false, onClick }: ChipProps) {
  return (
    <button
      type="button"
      className={[styles.chip, active && styles.on].filter(Boolean).join(' ')}
      aria-pressed={active}
      onClick={onClick}
    >
      {icon && <span className={styles.icon}>{icon}</span>}
      {label}
    </button>
  );
}
