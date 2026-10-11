import { ReactNode } from 'react';
import { Button } from '../ui/Button';
import styles from './ErrorScreen.module.css';

export interface ErrorScreenProps {
  icon: ReactNode;
  title: string;
  description: string;
  primary: { label: string; onClick: () => void };
  secondary?: { label: string; onClick: () => void };
}

/** Nunca um beco sem saída (protótipo "Sem acesso, erro e offline"): o que houve + o próximo passo. */
export function ErrorScreen({ icon, title, description, primary, secondary }: ErrorScreenProps) {
  return (
    <main className={styles.page}>
      <div className={styles.inner}>
        <span className={styles.ico} aria-hidden="true">{icon}</span>
        <h1 className={styles.title}>{title}</h1>
        <p className={styles.text}>{description}</p>
        <div className={styles.actions}>
          <Button onClick={primary.onClick}>{primary.label}</Button>
          {secondary && <Button variant="secondary" onClick={secondary.onClick}>{secondary.label}</Button>}
        </div>
      </div>
    </main>
  );
}
