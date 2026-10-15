/**
 * Regra do saque (antes dentro da SellerWithdrawSheet, D1), usada por ela e pela
 * WithdrawPixSheet do motoboy (D2) — uma regra só. O servidor continua decidindo de verdade.
 * Comparações em centavos inteiros (sem erro de ponto flutuante), com a mesma folga de 0,005 da D1.
 */
import { parseMoneyInput } from '../../lib/sellerApi';

/** Falha fechado: NaN em "1.000", "1,000,5", vazio e texto; "50.5" vale 50,50. */
export const parseWithdrawInput = (s: string): number => parseMoneyInput(s);

export const toWithdrawInput = (n: number): string => n.toFixed(2).replace('.', ',');

export interface WithdrawCheck {
  value: number;
  /** Digitou algo, mas o valor é ambíguo ou não é número. */
  invalid: boolean;
  valid: boolean;
  isAll: boolean;
  overAvailable: boolean;
  belowMinimum: boolean;
}

const cents = (n: number): number => Math.round(n * 100);

export function checkWithdraw(raw: string, available: number, minimum: number | null = null): WithdrawCheck {
  const value = parseWithdrawInput(raw);
  const invalid = String(raw ?? '').trim() !== '' && !Number.isFinite(value);
  const has = Number.isFinite(value) && value > 0;
  const overAvailable = has && cents(value) > cents(available);
  const belowMinimum = has && minimum !== null && cents(value) < cents(minimum);
  const valid = has && !overAvailable && !belowMinimum;
  const isAll = valid && cents(value) >= cents(available);
  return { value, invalid, valid, isAll, overAvailable, belowMinimum };
}

/** 'all' quando o valor é o disponível; senão o número com 2 casas. */
export const withdrawPayload = (c: WithdrawCheck): number | 'all' => (c.isAll ? 'all' : Math.round(c.value * 100) / 100);
