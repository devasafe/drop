import { ReactNode, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import { ScreenHeader } from '../drop/ScreenHeader';
import styles from './LegalPage.module.css';

/** Seção em acordeão com âncora (`/termos#cancelamento` abre direto nela). */
export function LegalSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    if (id && typeof window !== 'undefined' && window.location.hash === `#${id}` && ref.current) {
      ref.current.open = true;
      ref.current.scrollIntoView?.({ block: 'start' });
    }
  }, [id]);
  return (
    <details id={id} ref={ref} className={styles.section}>
      <summary className={styles.sectionTitle}>{title}</summary>
      <div className={styles.body}>{children}</div>
    </details>
  );
}

export default function LegalPage({
  title, version, updatedAt, summary, children,
}: { title: string; version: string; updatedAt: string; summary?: string[]; children: ReactNode }) {
  const router = useRouter();
  // Aberto por link direto (sem histórico): "voltar" não deve ficar parado.
  const goBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) router.back();
    else router.push('/inicio');
  };
  return (
    <main className={styles.page}>
      <ScreenHeader title={title} onBack={goBack} />
      <div className={styles.container}>
        {summary && summary.length > 0 && (
          <section className={styles.summary} aria-labelledby="legal-essencial">
            <h2 id="legal-essencial" className={styles.summaryTitle}>O essencial</h2>
            <ul>{summary.map((s) => <li key={s}>{s}</li>)}</ul>
          </section>
        )}
        <p className={styles.meta}>{`Versão ${version} · em vigor desde ${updatedAt}`}</p>
        {children}
      </div>
    </main>
  );
}
