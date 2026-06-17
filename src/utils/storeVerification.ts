import Store from '../models/Store';
import User from '../models/User';
import { isClientVerified } from './clientVerification';

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
  const store = await Store.findById(storeId);
  if (!store) return false;
  const owner = await User.findById(store.ownerId).select('verification');
  const verified = computeStoreVerified(store, owner);
  if (store.isVerified !== verified) {
    store.isVerified = verified;
    await store.save();
  }
  return verified;
}

/** Recalcula todas as lojas de um dono (ex.: quando a facial/Fase 1 do dono muda). */
export async function recomputeStoresForOwner(ownerId: string): Promise<void> {
  const stores = await Store.find({ ownerId }).select('_id');
  for (const s of stores) await recomputeStoreVerification(String(s._id));
}
