// Pedido mínimo (só produtos, sem frete). Abaixo dele a taxa fixa do Pix come a venda e não
// sobra saldo para pagar o motoboy. A plataforma define o piso; a loja pode subir o dela.
import { getPlatformConfig } from '../repositories/platformConfig.repository';
import { AppError } from '../utils/AppError';

const toCents = (v: unknown) => Math.round((Number(v) || 0) * 100);

/** Pedido mínimo da plataforma, em reais. Sem config, R$ 5 (o padrão do schema). */
export async function platformMinOrder(): Promise<number> {
  const cfg = await getPlatformConfig();
  const n = Number(cfg?.minOrderValue);
  return Number.isFinite(n) && n >= 0 ? n : 5;
}

/** O que vale para a loja: o maior entre o da plataforma e o dela. */
export function effectiveMinOrder(storeMin: unknown, platformMin: number): number {
  const own = storeMin == null ? 0 : toCents(storeMin);
  return Math.max(own, toCents(platformMin)) / 100;
}

const brl = (v: number) => v.toFixed(2).replace('.', ',');

/** 409 MIN_ORDER_NOT_REACHED quando os produtos não chegam ao mínimo da loja. */
export function assertMinOrder(subtotal: number, minimum: number): void {
  if (toCents(subtotal) >= toCents(minimum)) return;
  const missing = (toCents(minimum) - toCents(subtotal)) / 100;
  throw new AppError(
    `O pedido mínimo desta loja é R$ ${brl(minimum)} em produtos. Faltam R$ ${brl(missing)}.`,
    409, true, 'MIN_ORDER_NOT_REACHED',
  );
}
