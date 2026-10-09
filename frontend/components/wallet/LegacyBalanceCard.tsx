import { Button } from '../ui/Button';
import { formatBRL } from '../ui/PriceTag';
import styles from './LegacyBalanceCard.module.css';

interface Props {
  /** Repasses `released` do modo anterior (custódia). Sem saldo, o cartão some. */
  amount: number;
  /** Abre o saque por payouts já existente da tela ("Sacar para meu PIX"). */
  onWithdraw: () => void;
}

/**
 * R26 (revisa R23): no modo direto, o saldo que sobrou da custódia sai pelo saque por payouts
 * (/withdrawals/request → subconta Asaas → chave Pix), não por transfer-to-owner. A tela só
 * mostra o cartão no modo direto com saldo antigo (useCustodyLeftover).
 */
export default function LegacyBalanceCard({ amount, onWithdraw }: Props) {
  if (amount <= 0) return null;
  return (
    <section className={styles.card} aria-label="Saldo do modo anterior">
      <h2 className={styles.title}>Saldo do modo anterior — saque para sua chave Pix</h2>
      <p className={styles.text}>
        Você tem <strong>{formatBRL(amount)}</strong> liberados do modo anterior. O saque cai na chave Pix cadastrada em Dados de recebimento.
      </p>
      <div className={styles.actions}>
        <Button variant="primary" size="sm" onClick={onWithdraw}>Sacar para minha chave Pix</Button>
      </div>
    </section>
  );
}
