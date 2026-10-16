import { ReactNode } from 'react';
import styles from './StatusTag.module.css';

export type StatusTone = 'ok' | 'warn' | 'bad' | 'info' | 'neutral';

/** Selo de situação das telas de Pessoas (D3a): "Ativo", "Bloqueado", "Atrasada"… Cor só por token, sempre com texto. */
export function StatusTag({ tone, children }: { tone: StatusTone; children: ReactNode }) {
  return <span className={`${styles.tag} ${styles[tone]}`}>{children}</span>;
}

export default StatusTag;
