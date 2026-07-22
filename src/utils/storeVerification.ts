import { prisma } from '../lib/prisma';
import userRepository from '../repositories/user.repository';
import { isClientVerified } from './clientVerification';
import env from '../config/env';
import { ensureStoreSubaccount } from '../services/asaas/subaccount';
import logger from '../config/logger';

export type MissingStoreVerification = 'owner' | 'facial' | 'cnpj' | 'address';

/**
 * O que falta para a loja estar verificada:
 *  - owner: dono com Fase 1 completa (email+telefone+documento)
 *  - facial: selfie do dono aprovada
 *  - cnpj / address: aprovados pelo admin
 */
export function missingStoreVerifications(store: any, owner: any): MissingStoreVerification[] {
  const missing: MissingStoreVerification[] = [];
  if (!isClientVerified(owner)) missing.push('owner');
  if (owner?.verification?.facial?.status !== 'approved') missing.push('facial');
  if (store?.verification?.cnpj?.status !== 'approved') missing.push('cnpj');
  if (store?.verification?.address?.status !== 'approved') missing.push('address');
  return missing;
}

export function computeStoreVerified(store: any, owner: any): boolean {
  return missingStoreVerifications(store, owner).length === 0;
}

/** Recalcula e grava Store.isVerified. Chamar após cada aprovação/rejeição. */
export async function recomputeStoreVerification(storeId: string): Promise<boolean> {
  const store: any = await prisma.store.findUnique({ where: { id: String(storeId) } });
  if (!store) return false;
  const owner = await userRepository.findById(String(store.ownerId)) as any;
  const verified = computeStoreVerified(store, owner);
  if (store.isVerified !== verified) {
    await prisma.store.update({ where: { id: store.id }, data: { isVerified: verified } });
    // Ao virar verificada, cria a subconta Asaas (gated — inerte até PAYMENT_GATEWAY=asaas).
    if (verified && env.PAYMENT_GATEWAY === 'asaas') {
      try {
        await ensureStoreSubaccount(store.id);
      } catch (err) {
        logger.error('Falha ao garantir subconta da loja na verificação', err as Error, { storeId });
      }
    }
  }
  return verified;
}

/** Recalcula todas as lojas de um dono (ex.: quando a facial/Fase 1 do dono muda). */
export async function recomputeStoresForOwner(ownerId: string): Promise<void> {
  const stores = await prisma.store.findMany({ where: { ownerId }, select: { id: true } });
  for (const s of stores) await recomputeStoreVerification(s.id);
}
