import Link from 'next/link';
import { ReactNode } from 'react';
import styles from './AdminBlocks.module.css';

/**
 * Número grande com rótulo e dica opcional (protótipo .u-kpis). Valor de dinheiro vem formatado da tela.
 * Com `href` o cartão inteiro é um link para a aba dele (Visão geral do Dinheiro, D3b-3).
 */
export function Kpi({ label, value, hint, href }: { label: string; value: ReactNode; hint?: string; href?: string }) {
  const body = (
    <>
      <span className={styles.kpiLabel}>{label}</span>
      <strong className={styles.kpiValue}>{value}</strong>
      {hint && <em className={styles.kpiHint}>{hint}</em>}
    </>
  );
  if (href) return <Link href={href} className={`${styles.kpi} ${styles.kpiLink}`}>{body}</Link>;
  return <div className={styles.kpi}>{body}</div>;
}

export default Kpi;
