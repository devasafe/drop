import { ReactNode } from 'react';
import { Logo } from '../drop/Logo';
import styles from './AuthLayout.module.css';

interface AuthLayoutProps { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }

/** Casca clara de entrar (protótipo "Entrar"): marca, título, motivo, formulário e nota no pé. */
export default function AuthLayout({ title, subtitle, children, footer }: AuthLayoutProps) {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <Logo />
        <h1 className={styles.title}>{title}</h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
        {children}
      </div>
      {footer && <p className={styles.footer}>{footer}</p>}
    </main>
  );
}
