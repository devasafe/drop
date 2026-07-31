import styles from './DeliveryPin.module.css';

export interface DeliveryPinProps {
  pin: string;
}

/**
 * PIN de confirmação de entrega em destaque — o cliente informa esse código
 * ao motoboy na hora da entrega. Bloco único (sem card-em-card): fundo
 * `--surface-2` + borda `--line` é a mesma fronteira já usada em `.code`
 * de `PixPaymentSheet` pra blocos de código em destaque.
 */
export function DeliveryPin({ pin }: DeliveryPinProps) {
  return (
    <div className={styles.wrap}>
      <span className={styles.pin}>{pin}</span>
      <p className={styles.hint}>Compartilhe com o motoboy</p>
    </div>
  );
}
