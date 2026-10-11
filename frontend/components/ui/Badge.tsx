import { ReactNode } from 'react';
import styles from './Badge.module.css';

/** `seal` é alias depreciado de `discount`. */
export type BadgeTone = 'discount' | 'count' | 'status' | 'seal';

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
}

/**
 * Selo compacto sobreposto a uma imagem/card (ex.: "20% OFF" em `.of .disc`
 * no mock canônico). `discount` = fundo roxo sólido + texto branco (única
 * pílula com fundo cheio de marca fora de CTA/ativo). `count` = contador
 * neutro (ex.: itens no carrinho), sem roxo. `status` = selo informativo
 * (azul sutil). `seal` é alias depreciado de `discount`.
 */
export function Badge({ children, tone = 'discount' }: BadgeProps) {
  const resolved = tone === 'seal' ? 'discount' : tone;
  return <span className={[styles.badge, styles[resolved]].join(' ')}>{children}</span>;
}
