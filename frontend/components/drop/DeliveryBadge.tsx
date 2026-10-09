import { Bike, CalendarClock, MapPin, MapPinOff, Truck, Zap } from 'lucide-react';
import { formatMoney } from '../../lib/money';
import styles from './DeliveryBadge.module.css';

export type DeliveryState =
  | { kind: 'fast'; minutes: number }
  | { kind: 'today'; until: string }
  | { kind: 'tomorrow' }
  | { kind: 'free' }
  | { kind: 'fee'; fee: number }
  | { kind: 'noAddress'; onSetAddress: () => void }
  | { kind: 'loading' }
  | { kind: 'outOfArea'; address: string; onChangeAddress: () => void };

export interface DeliveryBadgeProps {
  state: DeliveryState;
}

/**
 * Linguagem de entrega do DROP (DS v2, spec §7.1). Ícone + texto; a cor diz
 * a qualidade da entrega, não enfeita: verde = rápido/grátis, neutro =
 * normal, link = falta uma ação, erro = não entrega.
 *
 * Enquanto o backend não cota prazo/frete antes do checkout, as telas usam
 * `noAddress` ou `loading` — nunca um prazo inventado.
 */
export function DeliveryBadge({ state }: DeliveryBadgeProps) {
  switch (state.kind) {
    case 'fast':
      return <Line tone="fast" icon={<Zap size={16} strokeWidth={1.75} />}>Chega em ~{state.minutes} min</Line>;
    case 'today':
      return <Line tone="fast" icon={<Bike size={16} strokeWidth={1.75} />}>Chega hoje até {state.until}</Line>;
    case 'tomorrow':
      return <Line tone="normal" icon={<CalendarClock size={16} strokeWidth={1.75} />}>Chega amanhã</Line>;
    case 'free':
      return <Line tone="fast" icon={<Truck size={16} strokeWidth={1.75} />}>Frete grátis</Line>;
    case 'fee':
      return <Line tone="normal" icon={<Truck size={16} strokeWidth={1.75} />}>Frete {formatMoney(state.fee)}</Line>;
    case 'noAddress':
      return (
        <button type="button" className={[styles.line, styles.link].join(' ')} onClick={state.onSetAddress}>
          <MapPin size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Informe o endereço para ver prazo e frete</span>
        </button>
      );
    case 'loading':
      return (
        <span className={[styles.line, styles.muted].join(' ')} role="status">
          <span className={styles.shimmer} aria-hidden="true" />
          <span>Calculando entrega…</span>
        </span>
      );
    case 'outOfArea':
      return (
        <span className={[styles.line, styles.error].join(' ')}>
          <MapPinOff size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>Não entrega em {state.address}</span>
          <button type="button" className={styles.action} onClick={state.onChangeAddress}>
            Trocar endereço
          </button>
        </span>
      );
  }
}

function Line({ tone, icon, children }: { tone: 'fast' | 'normal'; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <span className={[styles.line, styles[tone]].join(' ')}>
      <span className={styles.icon} aria-hidden="true">{icon}</span>
      <span>{children}</span>
    </span>
  );
}
