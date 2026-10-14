import { useEffect, useState } from 'react';
import { imageUrl } from '../../lib/config';
import { initials } from '../ui/Avatar';
import styles from './StoreLogo.module.css';

export interface StoreLogoProps {
  name: string;
  /** `Store.logoUrl`. Sem ele (ou se a imagem falha) aparecem as iniciais. */
  src?: string | null;
  /** Imagem de reserva (ex.: banner da loja) se não houver logo ou ele falhar; depois, iniciais. */
  fallbackSrc?: string | null;
  /** Tamanho/forma/cor vêm da classe de quem usa (mesmo círculo/quadrado de antes). */
  className?: string;
  /** Largura de exibição em px (otimização do Cloudinary). */
  width?: number;
}

/** Logo da loja para o cliente: imagem do lojista com fallback para as iniciais. */
export function StoreLogo({ name, src, fallbackSrc, className, width = 160 }: StoreLogoProps) {
  const sources = [src, fallbackSrc].filter((x): x is string => !!x);
  const key = sources.join('|');
  const [failed, setFailed] = useState(0);
  useEffect(() => setFailed(0), [key]);
  const current = sources[failed];
  if (current) {
    const isLogo = current === src;
    // O banner de reserva é decorativo (alt vazio); só o logo tem texto alternativo.
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={[className, styles.img].filter(Boolean).join(' ')} src={imageUrl(current, { w: width })} alt={isLogo ? `Logo de ${name}` : ''} loading="lazy" onError={() => setFailed((n) => n + 1)} />;
  }
  return <span className={className} aria-hidden="true">{initials(name)}</span>;
}
