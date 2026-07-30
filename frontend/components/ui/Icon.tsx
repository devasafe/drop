/**
 * Icon — padrão de uso de ícones no DROP.
 *
 * Não existe um componente `<Icon>` wrapper: os ícones vêm direto de
 * `lucide-react`, importados por nome.
 *
 *   import { ShoppingBag } from 'lucide-react';
 *   <ShoppingBag size={18} strokeWidth={ICON_STROKE_WIDTH} />
 *
 * Convenções do produto:
 *   - `strokeWidth={1.7}` (== ICON_STROKE_WIDTH) é o traço padrão — mais fino
 *     que o default do lucide (2), lê como desenhado para o produto em vez de
 *     "ícone de biblioteca" genérico. Use em texto corrido, listas, inputs.
 *   - Dentro de `IconButton` (`brand`/`soft`), o traço é mais grosso (2.6),
 *     como no mock canônico (`.of .add svg`, `.rep .add svg`) — passe
 *     `strokeWidth={2.6}` explicitamente ao ícone nesse contexto.
 *   - `size`: 14–16 inline com texto, 17–20 padrão em botões/linhas de lista,
 *     22–24 para destaque pontual. Não fixar tamanho em CSS — sempre via prop.
 *   - Cor: nunca hex fixo no ícone. Deixe herdar `currentColor` do elemento
 *     pai (texto/botão) para acompanhar variant/estado automaticamente.
 *   - Zero emoji em qualquer lugar da UI — ícone sempre via lucide-react.
 *
 * Este arquivo reexporta os tipos usados pelos primitivos do design system
 * (`Button`, `IconButton`) para quem for tipar props que aceitam ícone.
 */
import type { LucideIcon, LucideProps } from 'lucide-react';

export type { LucideIcon, LucideProps };

/** Traço padrão dos ícones do produto (ver convenções acima). */
export const ICON_STROKE_WIDTH = 1.7;

/** Traço dos ícones dentro de IconButton (`brand`/`soft`), como no mock canônico. */
export const ICON_BUTTON_STROKE_WIDTH = 2.6;
