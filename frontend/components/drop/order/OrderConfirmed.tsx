import { Check, Lock } from 'lucide-react';
import { Button } from '../../ui/Button';
import { formatMoney } from '../../../lib/money';
import { isPlan1Order, shortOrderCode } from '../../../lib/customerOrder';
import styles from './OrderConfirmed.module.css';

/** "Pedido confirmado" (protótipo): dá certeza de que deu certo e diz o que acontece agora. */
export function OrderConfirmed({ order, onTrack, onContinue }: { order: any; onTrack: () => void; onContinue: () => void }) {
  const plan1 = isPlan1Order(order);
  const card = order.paymentMethod === 'credit_card';
  const paid = card && order.cardChargedTotal ? Number(order.cardChargedTotal) : Math.max(0, Number(order.totalValue) - Number(order.walletApplied || 0));
  const store = order.storeName || 'a loja';
  return (
    <section className={styles.wrap} aria-labelledby="confirmado-titulo">
      <div className={styles.hero}>
        <span className={styles.ok} aria-hidden="true"><Check size={28} /></span>
        <h1 id="confirmado-titulo" className={styles.title}>Pagamento aprovado</h1>
        <p className={styles.lead}>{`Avisamos a ${store}. Ela tem até 5 minutos para aceitar.`}</p>
      </div>
      <div className={styles.block}>
        <div className={styles.blockHead}><span className={styles.cap}>Próximos passos</span><span className={styles.code}>{`#${shortOrderCode(order._id)}`}</span></div>
        <ol className={styles.steps}>
          <li className={styles.done}><span>{card ? 'Cartão aprovado' : 'Pix recebido'}</span><small>{formatMoney(paid)}</small></li>
          <li className={styles.current}><span>Loja aceita o pedido</span><small>Se não aceitar em 5 min, o valor volta para você</small></li>
          <li><span>{plan1 ? 'Combine a entrega com a loja' : 'Motoboy retira e leva'}</span></li>
        </ol>
      </div>
      {!plan1 && (
        <div className={styles.pinNote}>
          <Lock size={18} aria-hidden="true" />
          <p>Seu <b>código de entrega</b> aparece no pedido: compartilhe com o motoboy quando receber o pacote.</p>
        </div>
      )}
      <div className={styles.actions}>
        <Button onClick={onTrack}>Acompanhar pedido</Button>
        <Button variant="secondary" onClick={onContinue}>Continuar comprando</Button>
      </div>
    </section>
  );
}
