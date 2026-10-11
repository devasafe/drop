import { ReactNode } from 'react';

const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();

/** Destaca o primeiro trecho de `text` que casa com `term` (sem acento/maiúscula). NFD de letra latina não muda o tamanho depois de tirar os acentos, então o índice vale para o texto original. */
export function highlight(text: string, term: string): ReactNode {
  const t = fold(term.trim());
  if (!t) return text;
  const i = fold(text).indexOf(t);
  if (i < 0) return text;
  return <>{text.slice(0, i)}<strong>{text.slice(i, i + t.length)}</strong>{text.slice(i + t.length)}</>;
}
