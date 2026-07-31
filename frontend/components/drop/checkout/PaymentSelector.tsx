import { Zap, CreditCard, Banknote } from 'lucide-react';
import { Chip } from '../../ui/Chip';
import { ICON_STROKE_WIDTH } from '../../ui/Icon';
import type { PaymentMethod } from '../../../types/checkout';
import styles from './PaymentSelector.module.css';

/**
 * Catálogo de métodos de pagamento suportados no checkout. `cash_on_delivery`
 * fica de fora de propósito: descontinuado e rejeitado com 400 pelo backend
 * (ver `frontend/types/checkout.ts`) — não deve nem aparecer como opção.
 */
const CATALOG: Record<PaymentMethod, { label: string; icon: typeof Zap }> = {
  pix: { label: 'PIX', icon: Zap },
  credit_card: { label: 'Cartão', icon: CreditCard },
  money: { label: 'Dinheiro', icon: Banknote },
};

export interface PaymentSelectorProps {
  value: PaymentMethod;
  onChange: (method: PaymentMethod) => void;
  methods?: PaymentMethod[];
}

/**
 * Seletor de método de pagamento em chips (ícone + texto), via `Chip` do DS —
 * mesmo padrão de `CategoryRail`. Default `['pix', 'credit_card']` cobre o
 * checkout principal (Plano 2/3); a vitrine (Plano 1) pode reusar com
 * `['pix', 'credit_card', 'money']`.
 */
export function PaymentSelector({ value, onChange, methods = ['pix', 'credit_card'] }: PaymentSelectorProps) {
  return (
    <div className={styles.selector}>
      {methods.map((method) => {
        const { label, icon: MethodIcon } = CATALOG[method];
        return (
          <Chip
            key={method}
            icon={<MethodIcon size={16} strokeWidth={ICON_STROKE_WIDTH} />}
            label={label}
            active={method === value}
            onClick={() => onChange(method)}
          />
        );
      })}
    </div>
  );
}
