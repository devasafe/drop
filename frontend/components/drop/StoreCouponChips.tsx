import { useEffect, useState } from 'react';
import { TicketPercent } from 'lucide-react';
import api from '../../lib/api';
import { formatMoney } from '../../lib/money';
import { ICON_STROKE_WIDTH } from '../ui/Icon';
import styles from './StoreCouponChips.module.css';

export interface PublicCoupon {
  _id: string;
  code: string;
  discountType: 'percent' | 'fixed';
  discountValue: number;
  minOrderValue?: number | null;
  validUntil: string;
}

/** "10% de desconto acima de R$ 50,00" · "R$ 5,00 de desconto". */
export function couponLabel(c: PublicCoupon): string {
  const value = c.discountType === 'percent'
    ? `${String(c.discountValue).replace('.', ',')}% de desconto`
    : `${formatMoney(Number(c.discountValue))} de desconto`;
  return c.minOrderValue ? `${value} acima de ${formatMoney(Number(c.minOrderValue))}` : value;
}

/** Cupons públicos da loja (GET /stores/:id → publicCoupons). Sem cupom: nada. */
export function StoreCouponChips({ storeId }: { storeId: string }) {
  const [coupons, setCoupons] = useState<PublicCoupon[]>([]);

  useEffect(() => {
    let off = false;
    api.get(`/stores/${storeId}`)
      .then((r) => { if (!off) setCoupons(Array.isArray(r?.data?.publicCoupons) ? r.data.publicCoupons : []); })
      .catch(() => { if (!off) setCoupons([]); });
    return () => { off = true; };
  }, [storeId]);

  if (coupons.length === 0) return null;

  return (
    <section className={styles.block} aria-labelledby="loja-cupons">
      <h2 id="loja-cupons" className={styles.title}>Cupons da loja</h2>
      <ul className={styles.list}>
        {coupons.map((c) => (
          <li key={c._id} className={styles.chip}>
            <TicketPercent size={16} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
            <span className={styles.code}>{c.code}</span>
            <span className={styles.desc}>{couponLabel(c)}</span>
          </li>
        ))}
      </ul>
      <p className={styles.hint}>Use o código na sacola.</p>
    </section>
  );
}
