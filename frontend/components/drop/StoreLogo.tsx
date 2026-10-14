import { useEffect, useState } from 'react';
import { imageUrl } from '../../lib/config';
import { initials } from '../ui/Avatar';
import styles from './StoreLogo.module.css';

export interface StoreLogoProps {
  name: string;
  /** `Store.logoUrl`. Sem ele (ou se a imagem falha) aparecem as iniciais. */
  src?: string | null;
  /** Tamanho/forma/cor vêm da classe de quem usa (mesmo círculo/quadrado de antes). */
  className?: string;
  /** Largura de exibição em px (otimização do Cloudinary). */
  width?: number;
}

/** Logo da loja para o cliente: imagem do lojista com fallback para as iniciais. */
export function StoreLogo({ name, src, className, width = 160 }: StoreLogoProps) {
  const [broken, setBroken] = useState(false);
  useEffect(() => setBroken(false), [src]);
  const url = src ? imageUrl(src, { w: width }) : '';
  if (url && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={[className, styles.img].filter(Boolean).join(' ')} src={url} alt={`Logo de ${name}`} loading="lazy" onError={() => setBroken(true)} />;
  }
  return <span className={className} aria-hidden="true">{initials(name)}</span>;
}
