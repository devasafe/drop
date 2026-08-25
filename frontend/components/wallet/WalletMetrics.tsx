import { formatBRL } from '../ui/PriceTag';
import styles from './WalletMetrics.module.css';

export interface EarningsSummary {
  pending: number;
  available: number;
  requested: number;
  paid: number;
  totalEarned: number;
  earnedThisMonth: number;
  earnedToday: number;
}

type Tone = 'brand' | 'warn' | 'success';

const MONTHS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];

/** Grade de métricas financeiras (tudo agregado no backend — sem soma no front). */
export default function WalletMetrics({ summary }: { summary: EarningsSummary }) {
  const now = new Date();
  const monthLabel = `${MONTHS[now.getMonth()]}/${now.getFullYear()}`;
  const todayLabel = now.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });

  const cards: { label: string; value: number; desc: string; tone: Tone }[] = [
    { label: 'Pendente', value: summary.pending, desc: 'A liberar', tone: 'brand' },
    { label: 'Saque solicitado', value: summary.requested, desc: 'Em processamento', tone: 'warn' },
    { label: 'Total já sacado', value: summary.paid, desc: 'Valor transferido', tone: 'success' },
    { label: 'Total ganho', value: summary.totalEarned, desc: 'Histórico completo', tone: 'brand' },
    { label: 'Ganhos do mês', value: summary.earnedThisMonth, desc: monthLabel, tone: 'brand' },
    { label: 'Ganhos hoje', value: summary.earnedToday, desc: todayLabel, tone: 'success' },
  ];

  return (
    <div className={styles.grid}>
      {cards.map((c) => (
        <div key={c.label} className={`${styles.card} ${styles[c.tone]}`}>
          <span className={styles.label}>{c.label}</span>
          <span className={styles.value}>{formatBRL(c.value)}</span>
          <span className={styles.desc}>{c.desc}</span>
        </div>
      ))}
    </div>
  );
}
