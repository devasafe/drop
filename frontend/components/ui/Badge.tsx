import { ReactNode } from 'react';
import styles from './Badge.module.css';

export type BadgeTone = 'discount' | 'count' | 'seal';

export interface BadgeProps {
  children: ReactNode;
  tone?: BadgeTone;
}

/**
 * Selo compacto sobreposto a uma imagem/card (ex.: "20% OFF" em `.of .disc`
 * no mock canônico). `discount` = fundo roxo sólido + texto branco (única
 * pílula com fundo cheio de marca fora de CTA/ativo). `count` = contador
 * neutro (ex.: itens no carrinho), sem roxo. `seal` = selo circular roxo
 * (ex.: desconto no `PromoHero`), mesma cor de `discount` em forma de círculo.
 */
export function Badge({ children, tone = 'discount' }: BadgeProps) {
  return <span className={[styles.badge, styles[tone]].join(' ')}>{children}</span>;
}
