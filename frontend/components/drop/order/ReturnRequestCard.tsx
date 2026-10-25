import { Alert } from '../../ui/Alert';
import { Button } from '../../ui/Button';
import { RadioRow } from '../../ui/RadioRow';
import { formatMoney } from '../../../lib/money';
import { refundChannel } from './CourierTimeoutCard';
import styles from './OrderDecision.module.css';

/** Pedido de reembolso como vem de GET /orders/:id/return-request (o PIN só para o cliente, devolvendo). */
export interface ReturnRequestView {
  _id: string;
  orderId: string;
  status: 'aguardando_loja' | 'aprovado' | 'recusado' | 'devolvendo' | 'concluido';
  reason: string;
  amount: number;
  includesDeliveryFee: boolean;
  mode?: string | null;
  pin?: string;
  rejectReasonText?: string | null;
}

export interface ReturnRequestCardProps {
  request: ReturnRequestView;
  storeName: string;
  storeAddress?: string;
  paymentMethod?: string;
  busy?: boolean;
  onChooseStore: () => void;
  onSupport: () => void;
}

/**
 * Acompanhamento do reembolso de um pedido entregue (DS v2, caso B): aguardando a loja, recusado,
 * aprovado (como devolver), devolvendo (código para a loja) e concluído. O dinheiro só sai quando
 * a loja digita o código.
 */
export function ReturnRequestCard({ request, storeName, storeAddress, paymentMethod, busy, onChooseStore, onSupport }: ReturnRequestCardProps) {
  const amount = formatMoney(Number(request.amount) || 0);

  if (request.status === 'aguardando_loja') {
    return <Alert tone="warning" title="Reembolso pedido">{`A ${storeName} está analisando. Avisamos aqui e no push.`}</Alert>;
  }
  if (request.status === 'recusado') {
    return (
      <Alert tone="error" title="Reembolso recusado" action={{ label: 'Falar com o suporte', onClick: onSupport }}>
        {`${request.rejectReasonText || 'A loja recusou'}. Se não concordar, fale com o suporte.`}
      </Alert>
    );
  }
  if (request.status === 'concluido') {
    return <Alert tone="success" title="Produto devolvido">{`O estorno de ${amount} foi pedido e volta ${refundChannel(paymentMethod)}.`}</Alert>;
  }
  if (request.status === 'devolvendo') {
    return (
      <section className={styles.card} aria-label="Devolução">
        <div className={styles.codeBox}>
          <span className={styles.cap}>Código de devolução</span>
          <p className={styles.code}>{request.pin}</p>
          <span className={styles.hint}>Mostre este código na loja ao entregar o produto.</span>
        </div>
        {storeAddress && <p className={styles.text}>{`${storeName} · ${storeAddress}`}</p>}
        <Alert tone="info" title={`Reembolso de ${amount}`}>{`Sai quando a loja digitar o código. Volta ${refundChannel(paymentMethod)}.`}</Alert>
      </section>
    );
  }
  return (
    <section className={styles.card} aria-label="Reembolso aprovado">
      <p className={styles.cap}>{`Aprovado pela ${storeName}`}</p>
      <h2 className={styles.title}>Como você vai devolver?</h2>
      <p className={styles.text}>{`O reembolso de ${amount} sai quando a loja receber o produto.`}</p>
      <div className={styles.choices} role="radiogroup" aria-label="Como devolver">
        <RadioRow
          name="como-devolver"
          value="loja"
          checked
          onChange={() => undefined}
          label="Levo na loja"
          description={storeAddress ? `Grátis · ${storeAddress}` : 'Grátis'}
        />
      </div>
      <Button onClick={onChooseStore} loading={busy}>Continuar</Button>
    </section>
  );
}
