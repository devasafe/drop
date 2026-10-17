import { Prisma, Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ALL_ROLES, getEffectivePermissions } from '../controllers/rolePermissionsController';

/**
 * D3b-3 · spec 4.5 — "quem aprova a retirada do caixa não é quem pediu", ligada sozinha
 * quando existe outra pessoa apta. Pessoa apta = usuário não bloqueado, diferente de quem
 * pediu, com algum papel (em `roles`) cujas permissões efetivas incluem
 * cashbox:approve_withdrawal (o CEO tem '*').
 */
export const CASHBOX_APPROVE_PERMISSION = 'cashbox:approve_withdrawal';

export async function cashboxApproverRoles(): Promise<Role[]> {
  const out: Role[] = [];
  for (const role of ALL_ROLES) {
    const { permissions } = await getEffectivePermissions(role);
    if (permissions.includes('*') || permissions.includes(CASHBOX_APPROVE_PERMISSION)) out.push(role as Role);
  }
  return out;
}

export function cashboxApproverWhere(roles: Role[], requesterId: string): Prisma.UserWhereInput {
  return {
    id: { not: requesterId },
    status: { not: 'blocked' },
    roles: { hasSome: roles },
  };
}

export async function hasOtherCashboxApprover(
  db: Prisma.TransactionClient | typeof prisma,
  requesterId: string,
): Promise<boolean> {
  const roles = await cashboxApproverRoles();
  if (roles.length === 0) return false;
  const other = await db.user.findFirst({ where: cashboxApproverWhere(roles, requesterId), select: { id: true } });
  return !!other;
}
