import { getRoute } from '../routeService';
import type { RouteResultV2 } from '../routeService';
import { prisma } from '../../lib/prisma';
import { calculateDeliveryFeeWithConfig } from '../../utils/walletCalculations';
import { isDirectMode } from '../../utils/settlement';
import { findSubByStoreId } from '../../repositories/storeSubscription.repository';
import { brazilNow, isOpenAt, nextOpeningTime } from '../../utils/storeHours';
import {
  DeliveryConfig,
  effectivePrepMinutes,
  effectiveRadiusKm,
  getDeliveryConfig,
} from './config';

export type QuoteSource = 'estimate' | 'route';
export type QuoteReason = 'OUT_OF_AREA' | 'STORE_NO_LOCATION' | 'NO_ADDRESS' | 'ROUTE_FAILED';

export interface DeliveryQuote {
  storeId: string;
  /** null = sem endereço válido. */
  inArea: boolean | null;
  reason?: QuoteReason;
  /** Rota (source 'route') ou linha reta × fator de desvio (source 'estimate'). */
  distanceKm: number | null;
  /** [min, max] = preparo + deslocamento, arredondado PARA CIMA a 5 min; max = min + 10. */
  etaMinutes: [number, number] | null;
  /** 0 no Plano 1 da custódia; null fora da área/sem endereço. */
  fee: number | null;
  freeDelivery: boolean;
  open: boolean;
  /** 'HH:MM' do próximo horário de abertura, quando fechada. */
  opensAt?: string;
  source: QuoteSource;
}

export interface QuoteStore {
  id: string;
  latitude?: string | number | null;
  longitude?: string | number | null;
  deliveryRadiusKm?: number | null;
  prepMinutes?: number | null;
  isOpen?: boolean | null;
  operatingHours?: any;
}

export interface LatLngPoint {
  lat: number;
  lng: number;
}

/**
 * `DeliveryConfig` + a decisão de plano. `plan1Free` = Plano 1 na custódia (taxa 0 e prazo sem
 * deslocamento). O modo direto ignora o plano, então ali fica false. Veja `resolvePlan1Free`.
 */
export type QuoteConfig = DeliveryConfig & { plan1Free?: boolean };

const round2 = (n: number) => Math.round(n * 100) / 100;
// Para cima: o prazo nunca sai otimista.
const roundTo5 = (n: number) => Math.ceil(n / 5) * 5;

export function validPoint(p: any): p is LatLngPoint {
  if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') return false;
  const { lat, lng } = p;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}

/** Coordenada da loja (guardada como string no banco); string vazia/NaN/0,0 = sem localização. */
export function storePoint(store: QuoteStore): LatLngPoint | null {
  const rawLat = store.latitude;
  const rawLng = store.longitude;
  if (rawLat === null || rawLat === undefined || rawLat === '' || rawLng === null || rawLng === undefined || rawLng === '') {
    return null;
  }
  const p = { lat: Number(rawLat), lng: Number(rawLng) };
  return validPoint(p) ? p : null;
}

/** Distância em linha reta (haversine), em km. */
function straightKm(a: LatLngPoint, b: LatLngPoint): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function etaFrom(prepMinutes: number, travelMinutes: number): [number, number] {
  const min = roundTo5(prepMinutes + travelMinutes);
  return [min, min + 10];
}

function openState(store: QuoteStore, now: Date): { open: boolean; opensAt?: string } {
  const { dayIndex, minutes } = brazilNow(now);
  const open = isOpenAt({ isOpen: store.isOpen, operatingHours: store.operatingHours }, dayIndex, minutes);
  if (open) return { open: true };
  // Fechada pelo toggle manual não tem hora de volta; só informa quando é o horário que fecha.
  const opensAt = store.isOpen ? nextOpeningTime(store, dayIndex, minutes) : undefined;
  return opensAt ? { open: false, opensAt } : { open: false };
}

/**
 * Plano 1 na custódia: vitrine sem motoboy. A taxa é 0 e o prazo é só o preparo (o cliente retira
 * ou a loja entrega por conta própria — o mesmo critério do `quoteDelivery`/createOrder, que
 * zeram a taxa e não roteiam). No modo direto o plano é ignorado: vale a fórmula da rota.
 */
export async function resolvePlan1Free(storeId: string): Promise<boolean> {
  if (await isDirectMode()) return false;
  const sub = await findSubByStoreId(String(storeId));
  return isPlan1(sub?.currentPlan);
}

/** Sem assinatura (ou plano desconhecido) conta como Plano 1 — o mesmo default do createOrder. */
function isPlan1(currentPlan: string | null | undefined): boolean {
  if (!currentPlan) return true;
  return (({ plan1: 1, plan2: 2, plan3: 3 } as Record<string, number>)[currentPlan] ?? 1) === 1;
}

/**
 * `resolvePlan1Free` para um lote de lojas numa consulta só (cards da vitrine).
 * Modo direto: false para todas, sem consultar assinatura.
 */
export async function resolvePlan1FreeMany(storeIds: string[]): Promise<Map<string, boolean>> {
  const ids = storeIds.map(String);
  if (await isDirectMode()) return new Map(ids.map((id) => [id, false]));
  const subs = await prisma.storeSubscription.findMany({
    where: { storeId: { in: ids } },
    select: { storeId: true, currentPlan: true },
  });
  const planByStore = new Map(subs.map((s) => [s.storeId, s.currentPlan as string]));
  return new Map(ids.map((id) => [id, isPlan1(planByStore.get(id))]));
}

function baseQuote(store: QuoteStore, now: Date): DeliveryQuote {
  return {
    storeId: String(store.id),
    inArea: null,
    distanceKm: null,
    etaMinutes: null,
    fee: null,
    freeDelivery: false,
    source: 'estimate',
    ...openState(store, now),
  };
}

/** Estimativa grátis (cards da vitrine): pura, sem I/O. Distância = reta × fator de desvio. */
export function estimateQuote(
  store: QuoteStore,
  point: LatLngPoint | null,
  cfg: QuoteConfig,
  now: Date = new Date(),
): DeliveryQuote {
  const q = baseQuote(store, now);
  if (!validPoint(point)) return { ...q, reason: 'NO_ADDRESS' };
  const origin = storePoint(store);
  if (!origin) return { ...q, inArea: false, reason: 'STORE_NO_LOCATION' };

  const straight = straightKm(origin, point);
  if (straight > effectiveRadiusKm(store, cfg)) return { ...q, inArea: false, reason: 'OUT_OF_AREA' };

  const prep = effectivePrepMinutes(store, cfg);
  if (cfg.plan1Free) {
    return {
      ...q,
      inArea: true,
      distanceKm: round2(straight * cfg.detourFactor),
      etaMinutes: etaFrom(prep, 0),
      fee: 0,
      freeDelivery: true,
    };
  }
  const distanceKm = round2(straight * cfg.detourFactor);
  const travelMinutes = (distanceKm / cfg.avgSpeedKmh) * 60;
  const fee = round2(cfg.base + cfg.perKm * distanceKm);
  return {
    ...q,
    inArea: true,
    distanceKm,
    etaMinutes: etaFrom(prep, travelMinutes),
    fee,
    freeDelivery: fee === 0,
  };
}

export interface RouteQuoteResult {
  quote: DeliveryQuote;
  /** A rota consultada (null quando não roteou: sem endereço, fora pela reta, Plano 1, falha). */
  route: RouteResultV2 | null;
}

/**
 * Cotação por rota real (sacola/pedido), devolvendo também a rota usada (polyline, duração),
 * para quem precisa dela sem rotear de novo. Cai na estimativa com ROUTE_FAILED se não houver rota.
 *
 * Área: a reta filtra antes de rotear (barato); com a rota em mãos, a distância DA ROTA também
 * precisa caber no raio efetivo — a mesma regra que o createOrder impõe, para a sacola nunca
 * dizer "entrega" num endereço que o pedido vai recusar.
 */
export async function routeQuoteWithRoute(
  store: QuoteStore,
  point: LatLngPoint | null,
  now: Date = new Date(),
): Promise<RouteQuoteResult> {
  const [deliveryCfg, plan1Free] = await Promise.all([getDeliveryConfig(), resolvePlan1Free(store.id)]);
  const cfg: QuoteConfig = { ...deliveryCfg, plan1Free };
  const est = estimateQuote(store, point, cfg, now);
  // Sem endereço / fora da área / Plano 1 (não roteia, taxa 0): a estimativa já é a resposta.
  if (est.inArea !== true || cfg.plan1Free) return { quote: est, route: null };

  const origin = storePoint(store)!;
  const route = await getRoute({ origin, destination: point! });
  if (!route) return { quote: { ...est, reason: 'ROUTE_FAILED' }, route: null };

  if (route.distanceKm > effectiveRadiusKm(store, cfg)) {
    return {
      quote: { ...est, inArea: false, reason: 'OUT_OF_AREA', distanceKm: null, etaMinutes: null, fee: null, freeDelivery: false },
      route,
    };
  }

  const distanceKm = round2(route.distanceKm);
  // Taxa sobre a distância crua da rota: o mesmo número que o createOrder cobra.
  const fee = round2(await calculateDeliveryFeeWithConfig(route.distanceKm));
  return {
    quote: {
      ...est,
      distanceKm,
      etaMinutes: etaFrom(effectivePrepMinutes(store, cfg), route.durationSeconds / 60),
      fee,
      freeDelivery: fee === 0,
      // Haversine do routeService é a própria estimativa (gateway de rota fora), não rota real.
      source: route.source === 'haversine' ? 'estimate' : 'route',
    },
    route,
  };
}

/** Cotação por rota real (sacola/pedido). Cai na estimativa com ROUTE_FAILED se não houver rota. */
export async function routeQuote(
  store: QuoteStore,
  point: LatLngPoint | null,
  now: Date = new Date(),
): Promise<DeliveryQuote> {
  return (await routeQuoteWithRoute(store, point, now)).quote;
}
