import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PauseCircle, AlertTriangle, Info } from 'lucide-react';
import api from '../../../lib/api';
import { formatMoney } from '../../../lib/money';
import { unwrap, formatFullDate } from '../../../lib/sellerApi';
import { formatDayMonth, saasCancelledEndedMessage, saasCancelledSellsUntil, saasStoreBlocked } from '../../../lib/saasBilling';
import styles from './SaasPausedCard.module.css';

export type BillingStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled';

/**
 * Mensalidade do modo SaaS no Agora: pausada (vermelho), atrasada (âmbar) ou cancelada.
 * Pedidos já pagos seguem até o fim (services/saasBilling/gate.ts); só a vitrine e o checkout param.
 * D3b-2b (ruling 8): cancelada dentro do período continua vendendo e o cartão diz até quando. Depois do período o
 * cartão só informa ("vendeu até"): a loja é pausada pelo DROP, e quem avisa é a faixa dessa pausa. `onStatus`
 * recebe também `blocked` (só `paused`), que o painel usa para travar a abertura da loja.
 */
export function SaasPausedCard({ storeId, onStatus }: {
  storeId: string;
  onStatus?: (s: BillingStatus | null, blocked: boolean) => void;
}) {
  const [b, setB] = useState<any>(null);
  const onStatusRef = useRef(onStatus);
  onStatusRef.current = onStatus;

  useEffect(() => {
    let off = false;
    api.get(`/stores/${storeId}/saas-billing`)
      .then((r) => {
        if (off) return;
        const d = unwrap<any>(r) ?? null;
        setB(d);
        onStatusRef.current?.((d?.status as BillingStatus) ?? null, d ? saasStoreBlocked(d) : false);
      })
      .catch(() => { if (!off) onStatusRef.current?.(null, false); });
    return () => { off = true; };
  }, [storeId]);

  if (!b) return null;
  const pay = b.nextPayment || null;
  const payLink = pay?.invoiceUrl ? (
    <a className={styles.pay} href={pay.invoiceUrl} target="_blank" rel="noopener noreferrer">
      {`Pagar ${formatMoney(Number(pay.value) || 0)} e voltar`}
    </a>
  ) : (
    <Link className={styles.pay} href="/seller/assinatura">Ver assinatura</Link>
  );

  if (b.status === 'paused') {
    const due = formatFullDate(pay?.dueDate);
    return (
      <section className={[styles.card, styles.paused].join(' ')} aria-label="Loja pausada">
        <h2 className={styles.title}><PauseCircle size={22} aria-hidden="true" /> Sua loja está pausada</h2>
        <p className={styles.text}>
          {`A mensalidade${due ? ` de ${due}` : ''} não foi paga. Clientes não veem seus produtos e o seu link não aceita pedidos.`}
        </p>
        <p className={styles.text}>Os pedidos já pagos continuam normalmente até a entrega. Reabrir a loja não tira a pausa: só o pagamento.</p>
        {payLink}
      </section>
    );
  }
  if (b.status === 'past_due') {
    const until = formatFullDate(b.blockAt);
    return (
      <section className={[styles.card, styles.late].join(' ')} aria-label="Mensalidade atrasada">
        <h2 className={styles.title}><AlertTriangle size={22} aria-hidden="true" /> Mensalidade atrasada</h2>
        <p className={styles.text}>
          {until ? `Pague até ${until} para a loja não ser pausada.` : 'Pague a fatura para a loja não ser pausada.'}
        </p>
        {payLink}
      </section>
    );
  }
  if (b.status === 'cancelled') {
    const until = saasCancelledSellsUntil(b);
    if (until) {
      return (
        <section className={[styles.card, styles.late].join(' ')} aria-label="Mensalidade cancelada">
          <h2 className={styles.title}><AlertTriangle size={22} aria-hidden="true" /> Mensalidade cancelada</h2>
          <p className={styles.text}>{`Você vende até ${formatDayMonth(until)}. Depois disso a loja sai da vitrine e não recebe pedidos novos.`}</p>
          <Link className={styles.pay} href="/suporte">Falar com o suporte</Link>
        </section>
      );
    }
    return (
      <section className={[styles.card, styles.info].join(' ')} aria-label="Mensalidade cancelada">
        <h2 className={styles.title}><Info size={22} aria-hidden="true" /> {saasCancelledEndedMessage(b)}</h2>
        <Link className={styles.pay} href="/suporte">Falar com o suporte</Link>
      </section>
    );
  }
  return null;
}
