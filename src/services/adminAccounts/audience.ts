/**
 * Permissões por público (22/10) em Usuários: quem tem só `user:view_motoboys` vê e age só sobre
 * motoboys. A chave "de tudo" (`user:view_all`, `user:block` ou '*') mantém o comportamento de antes.
 * Conta da equipe só aparece para quem tem a chave "de tudo".
 */
import { prisma } from '../../lib/prisma';
import { getAccountPermissions } from '../../controllers/rolePermissionsController';
import {
  AUDIENCE_FORBIDDEN, AudienceAccess, AudienceFamily, allowedAudiences, canReachUser,
} from '../permissions/catalog';
import { AccountActionError } from './errors';
import { accountRoles } from './users';

type Viewer = { activeRole?: string; role?: string; roles?: string[] } | undefined;

export const audienceForbidden = (what = 'Esta pessoa está fora do público que você pode ver.') =>
  new AccountActionError(403, AUDIENCE_FORBIDDEN, what);

/** Públicos que a conta alcança numa família (lê as permissões uma vez). */
export async function audienceAccessOf(viewer: Viewer, family: AudienceFamily): Promise<AudienceAccess> {
  return allowedAudiences(await getAccountPermissions(viewer), family);
}

/**
 * Recusa (403 AUDIENCE_FORBIDDEN) quando a pessoa está fora do público. Pessoa que não existe passa:
 * quem chama responde o 404 de sempre.
 */
export async function assertUserInAudience(viewer: Viewer, userId: string, family: AudienceFamily): Promise<void> {
  const access = await audienceAccessOf(viewer, family);
  if (access.all) return;
  const target = await prisma.user.findUnique({ where: { id: userId }, select: { roles: true, role: true, activeRole: true } });
  if (target && !canReachUser(access, accountRoles(target))) throw audienceForbidden();
}
