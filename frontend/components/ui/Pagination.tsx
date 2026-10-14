import { ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './Pagination.module.css';

export interface PaginationProps {
  page: number;
  pages: number;
  onChange: (page: number) => void;
  label?: string;
}

/** Anterior / "Página X de N" / Próxima. Os botões desabilitam nos limites. */
export function Pagination({ page, pages, onChange, label = 'Paginação' }: PaginationProps) {
  if (pages < 1) return null;
  return (
    <nav className={styles.pagination} aria-label={label}>
      <button type="button" className={styles.button} aria-label="Página anterior" disabled={page <= 1} onClick={() => onChange(page - 1)}>
        <ChevronLeft size={20} aria-hidden="true" />
      </button>
      <span className={styles.status} aria-current="page">{`Página ${page} de ${pages}`}</span>
      <button type="button" className={styles.button} aria-label="Próxima página" disabled={page >= pages} onClick={() => onChange(page + 1)}>
        <ChevronRight size={20} aria-hidden="true" />
      </button>
    </nav>
  );
}
