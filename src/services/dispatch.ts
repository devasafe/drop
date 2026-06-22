import { calculateDistance } from './routeCalculator';

/**
 * Motor de despacho por raio crescente.
 *
 * A entrega começa visível só para motoboys perto da loja (raio inicial). Conforme
 * o tempo passa sem ninguém aceitar, o raio cresce em degraus até um teto; depois
 * do teto fica visível para todos (fallback). Assim um pedido em São Paulo não cai
 * no pool de um motoboy de Cabo Frio, mas nunca fica preso se a região estiver vazia.
 *
 * O raio é DERIVADO da idade da entrega (createdAt) no momento da consulta — sem
 * timers em memória, então é resiliente a restart do servidor (Render).
 */
const num = (v: string | undefined, d: number) => {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : d;
};

export const DISPATCH_BASE_KM = num(process.env.DISPATCH_BASE_KM, 1);
export const DISPATCH_STEP_KM = num(process.env.DISPATCH_STEP_KM, 2);
export const DISPATCH_STEP_MS = num(process.env.DISPATCH_STEP_SECONDS, 20) * 1000;
export const DISPATCH_MAX_KM = num(process.env.DISPATCH_MAX_KM, 15);

/**
 * Raio permitido (km) para uma entrega com a idade informada.
 * Retorna Infinity quando passou do teto (visível para todos).
 */
export function radiusForAgeKm(ageMs: number): number {
  const steps = Math.max(0, Math.floor(ageMs / DISPATCH_STEP_MS));
  const radius = DISPATCH_BASE_KM + steps * DISPATCH_STEP_KM;
  return radius >= DISPATCH_MAX_KM ? Infinity : radius;
}

export interface LatLng { lat: number; lng: number }

/**
 * A entrega está dentro do raio para um motoboy nesta localização e instante?
 * - Sem coordenadas da loja → sempre visível (não dá pra filtrar).
 * - Sem localização do motoboy → caller decide; aqui retornamos true (não filtra).
 */
export function isDeliveryWithinRadius(
  delivery: { storeLatitude?: number; storeLongitude?: number; createdAt?: Date | string },
  motoboy: LatLng | null | undefined,
  now: number = Date.now(),
): boolean {
  if (delivery.storeLatitude == null || delivery.storeLongitude == null) return true;
  if (!motoboy || motoboy.lat == null || motoboy.lng == null) return true;

  const createdAt = delivery.createdAt ? new Date(delivery.createdAt).getTime() : now;
  const radius = radiusForAgeKm(now - createdAt);
  if (radius === Infinity) return true;

  const dist = calculateDistance(motoboy.lat, motoboy.lng, delivery.storeLatitude, delivery.storeLongitude);
  return dist <= radius;
}
