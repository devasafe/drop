import { Clock } from 'lucide-react';
import styles from './ComingSoon.module.css';

/** Placeholder "Em breve" para funções pausadas (ex.: benefícios, prêmios). */
export default function ComingSoon({ title = 'Em breve', description }: { title?: string; description?: string }) {
  return (
    <div className={styles.wrap}>
      <span className={styles.icon}><Clock size={22} aria-hidden="true" /></span>
      <span className={styles.title}>{title}</span>
      {description && <span className={styles.desc}>{description}</span>}
    </div>
  );
}
