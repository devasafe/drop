// Localização aproximada do motoboy (Android "Aproximada" erra alguns km): o despacho por raio
// mediria a partir do lugar errado. A última posição guarda a margem de erro; acima do limite,
// o motoboy não vê, não é avisado e não aceita corrida nova até ligar a localização precisa.
// Corrida já aceita segue normal.
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

/** Margem de erro (m) acima da qual a posição conta como aproximada. */
export const IMPRECISE_ACCURACY_M = 500;

export const LOCATION_IMPRECISE = 'LOCATION_IMPRECISE';
export const IMPRECISE_LOCATION_BODY = {
  error: 'Sua localização está aproximada. Ative a localização precisa para pegar corridas.',
  code: LOCATION_IMPRECISE,
} as const;

/** A margem enviada pelo celular passa do limite? Sem margem (app antigo) não conta como aproximada. */
export const isImpreciseAccuracy = (accuracy: unknown): boolean => {
  const n = Number(accuracy);
  return accuracy != null && Number.isFinite(n) && n > IMPRECISE_ACCURACY_M;
};

/** User.currentLocation marcada como aproximada no último envio. */
export const isImpreciseLocation = (loc: unknown): boolean =>
  !!loc && typeof loc === 'object' && (loc as { imprecise?: unknown }).imprecise === true;

/** Filtro de motoboy cuja última posição foi aproximada. */
export const IMPRECISE_COURIER_WHERE: Prisma.UserWhereInput = {
  currentLocation: { path: ['imprecise'], equals: true },
};

/** Motoboys online com a localização aproximada (não recebem aviso de corrida nova). */
export async function impreciseOnlineCouriers(): Promise<string[]> {
  const rows = await prisma.user.findMany({
    where: { role: 'motoboy', isOnline: true, ...IMPRECISE_COURIER_WHERE },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}
