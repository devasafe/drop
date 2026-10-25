import { useState } from 'react';
import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { RadioRow } from '../../ui/RadioRow';
import { formatMoney } from '../../../lib/money';
import { refundChannel } from './CourierTimeoutCard';
import styles from './OrderDecision.module.css';

export type ReturnChoice = 'reentrega' | 'reembolso';

export interface ReturnDecisionCardProps {
  courierName?: string;
  storeName: string;
  refundAmount: number;
  paymentMethod?: string;
  /** `Delivery.pendingReturnAction`: 'reassign' = nova entrega já escolhida. */
  chosen?: string | null;
  busy?: boolean;
  onConfirm: (choice: ReturnChoice) => void;
}

/**
 * O motoboy desistiu depois de retirar (DS v2, "Pedido · entrega não concluída"): o pacote volta
 * para a loja e o cliente escolhe nova entrega (já marcada) ou reembolso. Sem escolha, a loja
 * confirma o pacote e o pedido é cancelado com reembolso.
 */
export function ReturnDecisionCard({ courierName, storeName, refundAmount, paymentMethod, chosen, busy, onConfirm }: ReturnDecisionCardProps) {
  const [choice, setChoice] = useState<ReturnChoice>('reentrega');
  const who = String(courierName || '').split(' ')[0] || 'O entregador';
  const story = `${who} teve um problema depois de retirar. O pacote está voltando para a ${storeName}.`;

  if (chosen === 'reassign') {
    return (
      <Alert tone="info" title="Nova entrega confirmada">
        Assim que a loja receber o pacote, procuramos outro motoboy.
      </Alert>
    );
  }

  return (
    <section className={styles.card} aria-label="Entrega interrompida">
      <h2 className={styles.title}>O motoboy não conseguiu concluir</h2>
      <p className={styles.text}>{story}</p>
      <p className={styles.cap}>Como você quer seguir?</p>
      <div className={styles.choices} role="radiogroup" aria-label="Como seguir com o pedido">
        <RadioRow
          name="decisao-devolucao"
          value="reentrega"
          checked={choice === 'reentrega'}
          onChange={() => setChoice('reentrega')}
          label="Nova entrega"
          description="Outro motoboy busca na loja e leva até você"
          disabled={busy}
        />
        <RadioRow
          name="decisao-devolucao"
          value="reembolso"
          checked={choice === 'reembolso'}
          onChange={() => setChoice('reembolso')}
          label={`Reembolso de ${formatMoney(refundAmount)}`}
          description={`Cancela o pedido · volta ${refundChannel(paymentMethod)}`}
          disabled={busy}
        />
      </div>
      <div className={styles.option}>
        <Button onClick={() => onConfirm(choice)} loading={busy}>
          {choice === 'reentrega' ? 'Confirmar nova entrega' : 'Confirmar reembolso'}
        </Button>
        {choice === 'reentrega' && <p className={styles.hint}>Sem custo para você</p>}
      </div>
      <p className={styles.note}>Se não escolher, o pedido é cancelado e o valor volta quando a loja receber o pacote.</p>
    </section>
  );
}
