/**
 * D3b-1 · peças comuns das leituras da Operação ao vivo (fila, resumo, pedidos, detalhe e mapa).
 * Os limites vêm da config uma vez por requisição (decisão R2 do plano).
 */
import { OrderStatus } from '@prisma/client';
import { getPlatformConfig } from '../../repositories/platformConfig.repository';
import { storeAcceptTimeoutMin } from '../../utils/acceptDeadline';
import { DEFAULT_POOL_TIMEOUT_MIN } from '../../jobs/poolTimeout.job';
import { getAccountPermissions } from '../../controllers/rolePermissionsController';

export const MIN_MS = 60_000;

/** Pedido em andamento: o mesmo conjunto do settlementSwitch e do cancelamento do cliente. */
export const ACTIVE_ORDER_STATUSES: OrderStatus[] = ['criado', 'pago', 'aguardando_motoboy', 'enviado'];
/** Pedido encerrado por cancelamento ou recusa. */
export const CANCELLED_ORDER_STATUSES: OrderStatus[] = ['cancelado', 'rejeitado'];

export interface OpsLimits {
  /** Prazo do aceite da loja (PlatformConfig.storeAcceptTimeoutMin, padrão 10). */
  storeAcceptTimeoutMin: number;
  /** Tempo no pool sem motoboy até o cliente decidir (PlatformConfig.poolTimeoutMin, padrão do job). */
  poolTimeoutMin: number;
}

export async function readOpsLimits(): Promise<OpsLimits> {
  const config = await getPlatformConfig();
  return {
    storeAcceptTimeoutMin: storeAcceptTimeoutMin(config),
    poolTimeoutMin: config?.poolTimeoutMin ?? DEFAULT_POOL_TIMEOUT_MIN,
  };
}

/** Os 6 últimos caracteres do id: o "#abc123" que as telas mostram. */
export const shortOrderId = (id: string): string => id.slice(-6);

export const round1 = (n: number): number => Math.round(n * 10) / 10;

/** Média de (fim − início) em minutos, com 1 casa. Pares incompletos ficam de fora; nenhum par → null. */
export function avgMinutes(pairs: Array<[Date | null | undefined, Date | null | undefined]>): number | null {
  const diffs = pairs
    .filter((p): p is [Date, Date] => !!p[0] && !!p[1])
    .map(([start, end]) => (end.getTime() - start.getTime()) / MIN_MS);
  if (diffs.length === 0) return null;
  return round1(diffs.reduce((sum, d) => sum + d, 0) / diffs.length);
}

/** "R$ 12,50". */
export const brl = (v: unknown): string => `R$ ${Number(v ?? 0).toFixed(2).replace('.', ',')}`;

export type PermissionCheck = (permission: string) => boolean;

/** Permissões da conta (papel ativo + papéis de equipe), lidas uma vez por requisição. CEO → tudo. */
export async function permissionCheckFor(
  user: { activeRole?: string; role?: string; roles?: string[] } | undefined,
): Promise<PermissionCheck> {
  const perms = await getAccountPermissions(user);
  return (permission) => perms.includes('*') || perms.includes(permission);
}
