import { prisma } from '../lib/prisma';
import userRepository from '../repositories/user.repository';
import { isClientVerified } from './clientVerification';
import env from '../config/env';
import { ensureStoreSubaccount } from '../services/asaas/subaccount';
import logger from '../config/logger';
import { getSaasConfig, SettlementMode } from './settlement';

export type MissingStoreVerification = 'owner' | 'facial' | 'cnpj' | 'address';

/**
 * O que falta para a loja estar verificada:
 *  - owner: dono com Fase 1 completa (email+telefone+documento)
 *  - facial: selfie do dono aprovada
 *  - cnpj / address: aprovados pelo admin
 */
export function missingStoreVerifications(store: any, owner: any, mode: SettlementMode = 'custodia'): MissingStoreVerification[] {
  const missing: MissingStoreVerification[] = [];
  if (!isClientVerified(owner)) missing.push('owner');
  // Modo direto: a conta Asaas da própria loja já faz o KYC dela; a DROP exige só o dono.
  if (mode === 'direto') return missing;
  if (owner?.verification?.facial?.status !== 'approved') missing.push('facial');
  if (store?.verification?.cnpj?.status !== 'approved') missing.push('cnpj');
  if (store?.verification?.address?.status !== 'approved') missing.push('address');
  return missing;
}

export function computeStoreVerified(store: any, owner: any, mode: SettlementMode = 'custodia'): boolean {
  return missingStoreVerifications(store, owner, mode).length === 0;
}

/** Recalcula e grava Store.isVerified. Chamar após cada aprovação/rejeição. */
export async function recomputeStoreVerification(storeId: string): Promise<boolean> {
  const store: any = await prisma.store.findUnique({ where: { id: String(storeId) } });
  if (!store) return false;
  const owner = await userRepository.findById(String(store.ownerId)) as any;
  const { settlementMode } = await getSaasConfig();
  const verified = computeStoreVerified(store, owner, settlementMode);
  if (store.isVerified !== verified) {
    await prisma.store.update({ where: { id: store.id }, data: { isVerified: verified } });
    // Ao virar verificada, cria a subconta Asaas (gated — inerte até PAYMENT_GATEWAY=asaas).
    // No modo direto não há subconta: a loja usa a própria conta Asaas.
    if (verified && settlementMode !== 'direto' && env.PAYMENT_GATEWAY === 'asaas') {
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

/** Recalcula todas as lojas (ex.: após trocar o modo de liquidação). */
export async function recomputeAllStores(): Promise<void> {
  const stores = await prisma.store.findMany({ select: { id: true, isVerified: true } });
  let changed = 0;
  for (const s of stores) {
    const verified = await recomputeStoreVerification(s.id);
    if (verified !== s.isVerified) changed++;
  }
  logger.info('[kyc] lojas recalculadas', { total: stores.length, changed });
}
