import { ReactNode } from 'react';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  /** URL do asset da foto do painel. Ausente → placeholder (gradiente + scrim). */
  imageSrc?: string;
  tagline?: string;
  children: ReactNode;
}

export default function AuthLayout({ title, subtitle, imageSrc, tagline, children }: AuthLayoutProps) {
  return (
    <div className={styles.page}>
      <div className={styles.frame}>
        <aside
          className={`${styles.panel} ${imageSrc ? styles.hasPhoto : ''}`}
          style={imageSrc ? { backgroundImage: `url(${imageSrc})` } : undefined}
        >
          <span className={styles.glow} aria-hidden="true" />
          <span className={styles.scrim} aria-hidden="true" />
          <div className={styles.brand}><span className={styles.pin} aria-hidden="true" /> DROP</div>
          <div className={styles.panelBottom}>
            <h2 className={styles.tagline}>{tagline || 'Do desejo à sua porta.'}</h2>
            <p className={styles.taglineSub}>Gadgets, presentes, beleza, games e mais — das lojas perto de você, entregues rápido.</p>
          </div>
        </aside>
        <main className={styles.formCol}>
          <div className={styles.formInner}>
            <h1 className={styles.title}>{title}</h1>
            {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
