import { ReactNode } from 'react';
import styles from './Tag.module.css';

export interface TagProps {
  children: ReactNode;
}

/**
 * Texto de categoria/loja sem caixa (ex.: "Games & Cia" em `.of .stx` do
 * mock canônico) — apenas texto mudo, sem fundo/borda/pílula.
 */
export function Tag({ children }: TagProps) {
  return <span className={styles.tag}>{children}</span>;
}
