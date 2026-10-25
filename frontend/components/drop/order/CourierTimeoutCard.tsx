import { Button } from '../../ui/Button';
import { formatMoney } from '../../../lib/money';
import styles from './OrderDecision.module.css';

/** Por onde o reembolso integral volta, no texto do cliente. */
export function refundChannel(paymentMethod?: string): string {
  if (paymentMethod === 'pix') return 'pelo Pix que você usou';
  if (paymentMethod === 'credit_card' || paymentMethod === 'debit_card') return 'no cartão';
  return 'para você';
}

export interface CourierTimeoutCardProps {
  storeName: string;
  /** Minutos desde que a entrega entrou no pool; null quando não dá para saber. */
  searchingMin: number | null;
  refundAmount: number;
  paymentMethod?: string;
  busy?: boolean;
  onWait: () => void;
  onCancel: () => void;
}

/**
 * Nenhum motoboy aceitou dentro do prazo do pool (DS v2, "Pedido · sem motoboy"): a decisão
 * volta ao cliente. "Continuar esperando" em destaque; cancelar traz o valor no botão.
 */
export function CourierTimeoutCard({ storeName, searchingMin, refundAmount, paymentMethod, busy, onWait, onCancel }: CourierTimeoutCardProps) {
  const searched = searchingMin && searchingMin > 0 ? `Procuramos por ${searchingMin} min perto da ${storeName}` : `Procuramos perto da ${storeName}`;
  return (
    <section className={styles.card} aria-label="Sem motoboy por enquanto">
      <h2 className={styles.title}>Nenhum motoboy aceitou ainda</h2>
      <p className={styles.text}>{`${searched}. A loja já separou o seu pedido.`}</p>
      <p className={styles.cap}>O que você prefere?</p>
      <div className={styles.option}>
        <Button onClick={onWait} disabled={busy}>Continuar esperando</Button>
        <p className={styles.hint}>Seguimos procurando e avisamos quando alguém aceitar.</p>
      </div>
      <div className={styles.option}>
        <Button variant="secondary" onClick={onCancel} disabled={busy}>{`Cancelar e receber ${formatMoney(refundAmount)}`}</Button>
        <p className={styles.hint}>{`Sem taxa: o valor volta inteiro ${refundChannel(paymentMethod)}.`}</p>
      </div>
    </section>
  );
}
