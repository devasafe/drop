import { RadioRow } from '../../ui/RadioRow';
import { formatMoney } from '../../../lib/money';
import type { InstallmentOption } from '../../../lib/cardInstallments';
import styles from './InstallmentList.module.css';

export interface InstallmentListProps { options: InstallmentOption[]; base: number; value: number; onChange: (count: number) => void }

/** Parcelas com o custo real de cada uma (spec §7.1): o cliente paga o custo do cartão (gross-up). */
export function InstallmentList({ options, base, value, onChange }: InstallmentListProps) {
  return (
    <fieldset className={styles.list}>
      <legend className={styles.legend}>Parcelas</legend>
      {options.map((o) => {
        const extra = Math.max(0, Math.round((o.total - base) * 100) / 100);
        return (
          <RadioRow key={o.count} name="parcelas" value={String(o.count)} checked={value === o.count} onChange={() => onChange(o.count)}
            label={o.count === 1 ? `À vista · ${formatMoney(o.total)}` : `${o.count}x de ${formatMoney(o.installmentValue)}`}
            description={o.count === 1 ? `+ ${formatMoney(extra)} da operadora` : `total ${formatMoney(o.total)} · + ${formatMoney(extra)}`} />
        );
      })}
      <p className={styles.note}>O acréscimo é a taxa da operadora do cartão. No Pix você paga {formatMoney(base)}.</p>
    </fieldset>
  );
}
