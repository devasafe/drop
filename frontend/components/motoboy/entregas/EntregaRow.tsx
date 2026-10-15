import { CheckCircle2, XCircle } from 'lucide-react';
import { deliveryDate, moneyBadge, type MoneyInfo } from '../../../lib/motoboyMoney';
import { formatMoney } from '../../../lib/money';
import { shortOrderCode } from '../../../lib/customerOrder';
import { formatHour } from '../../../lib/sellerApi';
import { moneyTagClass } from '../moneyTag';
import blocks from '../../panel/PanelBlocks.module.css';
import styles from './Entregas.module.css';

const km = (d: any): string | null => {
  const n = Number(d?.distance);
  return Number.isFinite(n) && n > 0 ? `${n.toFixed(1).replace('.', ',')} km` : null;
};

/** Linha de uma corrida concluída: status, hora, km, nota e — só se o servidor tiver — valor e badge. */
export function EntregaRow({ delivery: d, money, onOpen }: { delivery: any; money: MoneyInfo | null; onOpen: () => void }) {
  const delivered = d?.status === 'delivered';
  const rating = typeof d?.rating === 'number' && d.rating > 0 ? `★ ${d.rating.toFixed(1).replace('.', ',')}` : 'sem nota';
  const sub = [delivered ? 'Entregue' : 'Cancelada', formatHour(deliveryDate(d)), delivered ? km(d) : null, delivered ? rating : null]
    .filter(Boolean)
    .join(' · ');
  const badge = money ? moneyBadge(money) : null;
  return (
    <li>
      <button type="button" className={[blocks.row, blocks.rowButton].join(' ')} onClick={onOpen}>
        <span className={[blocks.ico, delivered ? blocks.icoOk : blocks.icoWarn].join(' ')} aria-hidden="true">
          {delivered ? <CheckCircle2 size={18} /> : <XCircle size={18} />}
        </span>
        <span className={blocks.tx}>
          <b>{`#${shortOrderCode(d?.orderId || d?._id)}`}</b>
          <span>{sub}</span>
        </span>
        {money && badge && (
          <span className={blocks.end}>
            <b className={styles.amount}>{formatMoney(money.amount)}</b>
            <span className={moneyTagClass(badge.tone)}>{badge.label}</span>
          </span>
        )}
      </button>
    </li>
  );
}
