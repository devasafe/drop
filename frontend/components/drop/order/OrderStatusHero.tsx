import { CheckCircle2, Clock, Info, XCircle, type LucideIcon } from 'lucide-react';
import { ICON_STROKE_WIDTH } from '../../ui/Icon';
import type { StatusTone } from '../../../hooks/useOrderTracking';
import styles from './OrderStatusHero.module.css';

export interface OrderStatusHeroProps {
  statusLabel: string;
  statusTone: StatusTone;
  message: string;
}

const TONE_ICON: Record<StatusTone, LucideIcon> = {
  info: Info,
  success: CheckCircle2,
  danger: XCircle,
  pending: Clock,
};

/**
 * Bloco dominante da tela de acompanhamento de pedido: ícone Lucide + rótulo
 * de status + mensagem grande. Cor por tom via classe CSS, nunca roxo fora de
 * `info` (spec Regra D): `success` = `--success`, `danger` = `--danger`,
 * `pending` = `--rating` (âmbar do DS, mesmo tom de `StatusPill em_entrega`).
 */
export function OrderStatusHero({ statusLabel, statusTone, message }: OrderStatusHeroProps) {
  const ToneIcon = TONE_ICON[statusTone];
  return (
    <section className={[styles.hero, styles[statusTone]].join(' ')} aria-label={`Status do pedido: ${statusLabel}`}>
      <ToneIcon className={styles.icon} size={28} strokeWidth={ICON_STROKE_WIDTH} aria-hidden="true" />
      <span className={styles.label}>{statusLabel}</span>
      <p className={styles.message}>{message}</p>
    </section>
  );
}
