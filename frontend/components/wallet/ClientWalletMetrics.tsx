import { Clock, ArrowDownLeft, Tag } from 'lucide-react';
import { formatBRL } from '../ui/PriceTag';
import styles from './ClientWalletMetrics.module.css';

export interface ClientWalletSummary {
  available: number;
  refundPending: number;
  refundReceived: number;
  totalSaved: number;
}

/**
 * Resumo POSITIVO da carteira do cliente — benefício e economia (nunca "quanto gastou").
 * Só métricas com base real no backend: reembolso pendente, reembolsos recebidos,
 * total economizado (cupons). Cashback e crédito promocional NÃO existem → fora.
 */
export default function ClientWalletMetrics({ summary }: { summary: ClientWalletSummary }) {
  const cards = [
    { icon: Clock, label: 'Reembolso pendente', value: summary.refundPending, desc: 'Em processamento', tone: 'warn' as const },
    { icon: ArrowDownLeft, label: 'Reembolsos recebidos', value: summary.refundReceived, desc: 'Voltou para você', tone: 'success' as const },
    { icon: Tag, label: 'Total economizado', value: summary.totalSaved, desc: 'Com cupons', tone: 'brand' as const },
  ];

  return (
    <div className={styles.grid}>
      {cards.map((c) => {
        const Ico = c.icon;
        return (
          <div key={c.label} className={`${styles.card} ${styles[c.tone]}`}>
            <span className={styles.top}>
              <span className={styles.iconBox}><Ico size={15} aria-hidden="true" /></span>
              <span className={styles.label}>{c.label}</span>
            </span>
            <span className={styles.value}>{formatBRL(Number(c.value) || 0)}</span>
            <span className={styles.desc}>{c.desc}</span>
          </div>
        );
      })}
    </div>
  );
}
