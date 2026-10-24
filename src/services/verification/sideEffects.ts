import { Prisma, User } from '@prisma/client';
import env from '../../config/env';
import logger from '../../config/logger';
import { ensureMotoboySubaccount } from '../asaas/subaccount';
import { recomputeStoreVerification, recomputeStoresForOwner } from '../../utils/storeVerification';
import { isDirectMode } from '../../utils/settlement';
import type { DecidedItem } from '../verificationDecision.service';

/**
 * D3b-2b · efeitos de aprovar um item de verificação, usados pelas rotas individuais e pelo
 * aprovar tudo. Os `*Safe` nunca lançam: a decisão já foi gravada; a falha vai para o log.
 */

/** Motoboy/lojista: a facial aprovada vira o avatar da conta. Cliente não (a foto dele é livre). */
export function facialAvatarData(user: Pick<User, 'roles' | 'role'>, decided: DecidedItem): Prisma.UserUpdateInput {
  if (decided.status !== 'approved') return {};
  const roles: string[] = user.roles?.length ? user.roles : (user.role ? [user.role] : []);
  const selfieUrl = typeof decided.selfieUrl === 'string' ? decided.selfieUrl : '';
  return selfieUrl && (roles.includes('motoboy') || roles.includes('lojista')) ? { photo: selfieUrl } : {};
}

export async function recomputeOwnerStoresSafe(userId: string): Promise<void> {
  try {
    await recomputeStoresForOwner(String(userId));
  } catch (err) {
    logger.error('Falha ao recalcular lojas do dono após verificação', err as Error, { userId });
  }
}

export async function recomputeStoreVerificationSafe(storeId: string): Promise<void> {
  try {
    await recomputeStoreVerification(String(storeId));
  } catch (err) {
    logger.error('Falha ao recalcular a verificação da loja', err as Error, { storeId });
  }
}

/**
 * Ao aprovar o motoboy, cria a subconta Asaas (inerte até PAYMENT_GATEWAY=asaas). Só na custódia:
 * no modo direto (SaaS) o motoboy recebe Pix da loja na própria chave e a subconta seria uma
 * conta real aberta à toa na conta Asaas da DROP.
 */
export async function ensureCourierSubaccountSafe(userId: string): Promise<void> {
  if (env.PAYMENT_GATEWAY !== 'asaas') return;
  try {
    if (await isDirectMode()) return;
    await ensureMotoboySubaccount(String(userId));
  } catch (err) {
    logger.error('Falha ao garantir subconta do motoboy na aprovação', err as Error, { userId });
  }
}
