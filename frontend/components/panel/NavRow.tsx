// frontend/components/panel/NavRow.tsx (bloco de painel compartilhado: loja e motoboy)
import { ReactNode } from 'react';
import { ChevronRight } from 'lucide-react';
import blocks from './PanelBlocks.module.css';

export interface NavRowProps {
  icon: ReactNode;
  label: string;
  sub?: string;
  onClick: () => void;
  /** Substitui a seta (ex.: selo "atual"). */
  end?: ReactNode;
  /** Classe extra do ícone (blocks.icoOk, blocks.icoBrand…). */
  iconClassName?: string;
  current?: boolean;
}

/** Uma linha tocável de uma lista `blocks.list` (protótipo `.u-row` + `.chev`). */
export function NavRow({ icon, label, sub, onClick, end, iconClassName, current }: NavRowProps) {
  return (
    <li>
      <button
        type="button"
        className={[blocks.row, blocks.rowButton, current && blocks.rowCurrent].filter(Boolean).join(' ')}
        aria-current={current ? 'true' : undefined}
        onClick={onClick}
      >
        <span className={[blocks.ico, iconClassName].filter(Boolean).join(' ')} aria-hidden="true">{icon}</span>
        <span className={blocks.tx}>
          <b>{label}</b>
          {sub && <span>{sub}</span>}
        </span>
        {end ?? <ChevronRight size={18} className={blocks.chev} aria-hidden="true" />}
      </button>
    </li>
  );
}

export default NavRow;
