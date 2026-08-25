import { formatBRL } from '../ui/PriceTag';
import styles from './WalletMetrics.module.css';

export interface StoreFinancialSummary {
  pending: number;
  available: number;
  requested: number;
  paid: number;
  netEarned: number;
  netThisMonth: number;
  netToday: number;
  grossSales: number;
  grossThisMonth: number;
  grossToday: number;
  cancelledValue: number;
  commission: number;
  commissionPercent: number;
  retainPercent: number;
  plan: number;
}

type Tone = 'brand' | 'warn' | 'success';

/** Métricas financeiras da loja — líquido (payouts) + bruto (vendas) + taxas. */
export default function StoreWalletMetrics({ summary }: { summary: StoreFinancialSummary }) {
  const cards: { label: string; value: number; desc: string; tone: Tone }[] = [
    { label: 'Pendente', value: summary.pending, desc: 'A liberar', tone: 'warn' },
    { label: 'Saque solicitado', value: summary.requested, desc: 'Em processamento', tone: 'warn' },
    { label: 'Total já sacado', value: summary.paid, desc: 'Transferido via PIX', tone: 'success' },
    { label: 'Vendas brutas', value: summary.grossSales, desc: 'Total vendido (produtos)', tone: 'brand' },
    { label: 'Total líquido ganho', value: summary.netEarned, desc: 'Receita líquida da loja', tone: 'success' },
    { label: 'Taxas e comissões', value: summary.commission, desc: `Custos da plataforma · ${summary.commissionPercent}%`, tone: 'warn' },
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
