import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { PauseCircle, AlertTriangle } from 'lucide-react';
import api from '../../../lib/api';
import { formatMoney } from '../../../lib/money';
import { unwrap, formatFullDate } from '../../../lib/sellerApi';
import styles from './SaasPausedCard.module.css';

export type BillingStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'cancelled';

/**
 * Mensalidade do modo SaaS no Agora: pausada (vermelho), atrasada (âmbar) ou cancelada.
 * Pedidos já pagos seguem até o fim (services/saasBilling/gate.ts); só a vitrine e o checkout param.
 */
export function SaasPausedCard({ storeId, onStatus }: { storeId: string; onStatus?: (s: BillingStatus | null) => void }) {
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
        onStatusRef.current?.((d?.status as BillingStatus) ?? null);
      })
      .catch(() => { if (!off) onStatusRef.current?.(null); });
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
    return (
      <section className={[styles.card, styles.paused].join(' ')} aria-label="Assinatura cancelada">
        <h2 className={styles.title}><PauseCircle size={22} aria-hidden="true" /> Assinatura cancelada</h2>
        <p className={styles.text}>Fale com a DROP para voltar a vender.</p>
        <Link className={styles.pay} href="/suporte">Falar com o suporte</Link>
      </section>
    );
  }
  return null;
}
