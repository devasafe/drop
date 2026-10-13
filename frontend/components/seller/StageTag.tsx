// frontend/components/seller/StageTag.tsx
import type { StageTone } from '../../lib/sellerOrders';
import styles from './StageTag.module.css';

const TONE: Record<StageTone, string> = {
  brand: styles.brand,
  info: styles.info,
  success: styles.success,
  warning: styles.warning,
  danger: styles.danger,
  neutral: styles.neutral,
};

/** Etiqueta de estado da loja: sempre texto + tom, nunca só cor. */
export function StageTag({ label, tone }: { label: string; tone: StageTone }) {
  return <span className={[styles.tag, TONE[tone]].join(' ')}>{label}</span>;
}
