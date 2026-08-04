import { ReactNode } from 'react';
import styles from './LegalPage.module.css';

export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <div className={styles.body}>{children}</div>
    </section>
  );
}

export default function LegalPage({
  title, version, updatedAt, children,
}: { title: string; version: string; updatedAt: string; children: ReactNode }) {
  return (
    <div className={styles.page}>
      <div className={styles.container}>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.meta}>Versão {version} — atualizado em {updatedAt}</p>
        {children}
      </div>
    </div>
  );
}
