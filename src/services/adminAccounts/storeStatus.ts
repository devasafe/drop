/**
 * D3b-2a · situação da loja para as leituras do admin. "Aberta" é a do GET público
 * (isStoreOpenWithHoursNow: toggle, pausa do lojista, horário e "abrir fora do horário"); a pausa do
 * admin vem antes de tudo.
 */
import { Prisma } from '@prisma/client';
import { isStoreOpenWithHoursNow, isStorePaused } from '../../utils/storeOpen';
import { isAdminPaused } from './storePause';
import { StoreSituation } from './types';

export const STORE_SITUATION_SELECT = Prisma.validator<Prisma.StoreSelect>()({
  isOpen: true,
  pausedUntil: true,
  openOverrideUntil: true,
  operatingHours: true,
  adminPausedAt: true,
});

export interface StoreSituationInput {
  isOpen: boolean;
  pausedUntil: Date | null;
  openOverrideUntil: Date | null;
  operatingHours: Prisma.JsonValue | null;
  adminPausedAt: Date | null;
}

export function storeSituation(store: StoreSituationInput, now: Date = new Date()): StoreSituation {
  if (isAdminPaused(store)) return 'admin_paused';
  if (isStorePaused(store, now)) return 'paused';
  return isStoreOpenWithHoursNow(store, now) ? 'open' : 'closed';
}
