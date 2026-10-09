import { useState } from 'react';
import styles from './Avatar.module.css';

export type AvatarSize = 'sm' | 'md' | 'lg';

export interface AvatarProps {
  name: string;
  src?: string | null;
  size?: AvatarSize;
}

/** "Ana Souza" → "AS"; "Bruno" → "B". */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/**
 * Avatar (DS v2): conta, motoboy no tracking, chat. Sem foto (ou se a foto
 * falha), mostra as iniciais. O nome é sempre o texto alternativo.
 * Tamanhos: sm 32 · md 40 · lg 56.
 */
export function Avatar({ name, src, size = 'md' }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const cls = [styles.avatar, styles[size]].join(' ');

  if (src && !broken) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img className={cls} src={src} alt={name} onError={() => setBroken(true)} />;
  }
  return (
    <span className={cls} role="img" aria-label={name}>
      <span aria-hidden="true">{initials(name)}</span>
    </span>
  );
}
