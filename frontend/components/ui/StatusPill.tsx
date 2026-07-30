import styles from './StatusPill.module.css';

export type StoreStatus = 'aberta' | 'fechada' | 'em_entrega' | 'cancelado' | 'entregue';

const STATUS_LABEL: Record<StoreStatus, string> = {
  aberta: 'Aberta',
  fechada: 'Fechada',
  em_entrega: 'Em entrega',
  cancelado: 'Cancelado',
  entregue: 'Entregue',
};

export interface StatusPillProps {
  status: StoreStatus;
}

/**
 * Selo de status semântico (loja/pedido). Cor por estado, nunca roxo:
 * `aberta`/`entregue` = `--success` (verde, como `.lrow .open`/`.feat .badge`
 * do mock canônico — "Aberta" é verde, não roxo), `em_entrega` = `--rating`
 * (âmbar, em trânsito), `fechada`/`cancelado` = `--text-subtle` (neutro).
 */
export function StatusPill({ status }: StatusPillProps) {
  return (
    <span className={[styles.pill, styles[status]].join(' ')}>
      <span className={styles.dot} />
      {STATUS_LABEL[status]}
    </span>
  );
}
