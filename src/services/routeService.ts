import axios from 'axios';
import { calculateDistance } from './routeCalculator';

/**
 * RouteService — FONTE ÚNICA de rota/distância da Drop (backend).
 *
 * Todo cálculo de distância "pelas ruas" (taxa de entrega, ETA, polyline) passa
 * por aqui. Antes existiam TRÊS implementações independentes (Directions REST no
 * backend, DirectionsService JS no checkout e no mapa do motoboy) e a taxa saía
 * de haversine (linha reta) — inconsistente com o que o cliente via. Agora:
 *
 *   checkout / dispatch / tracking  →  API da Drop  →  RouteService
 *
 * Provedor: Google **Routes API** (computeRoutes), o produto atual — não a
 * Directions API legada. Cascata de fallback resiliente:
 *   1. Routes API (rota real pelas ruas)     source: 'routes'
 *   2. Directions API legada (se ainda houver GOOGLE_MAPS_API_KEY e Routes falhar) source: 'directions'
 *   3. Haversine (linha reta) — NUNCA falha; marcado como estimativa            source: 'haversine'
 *
 * O `source` sobe junto com o resultado pra quem chama decidir (ex.: logar/
 * marcar que a taxa saiu de estimativa quando o gateway de rota estava fora).
 */

export type RouteSource = 'routes' | 'directions' | 'haversine';

export interface LatLng {
  lat: number;
  lng: number;
}

export interface RouteResultV2 {
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  polyline?: string; // encoded polyline (Google)
  source: RouteSource;
}

interface CacheEntry {
  value: RouteResultV2;
  expiresAt: number;
}

// Cache em memória (chave = coords arredondadas). Simples e suficiente: a maioria
// dos pares loja→cliente se repete (mesma loja, endereços próximos). TTL curto pra
// não servir rota velha eternamente. Trocável por Redis depois sem mudar a API.
const ROUTE_CACHE_TTL_MS = Number(process.env.ROUTE_CACHE_TTL_MS) || 10 * 60 * 1000; // 10 min
const cache = new Map<string, CacheEntry>();

// ~5 casas decimais ≈ 1 m de precisão na chave — junta pontos praticamente iguais.
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const cacheKey = (o: LatLng, d: LatLng, mode: string) =>
  `${mode}:${round5(o.lat)},${round5(o.lng)}=>${round5(d.lat)},${round5(d.lng)}`;

const validCoord = (p?: LatLng | null): p is LatLng =>
  !!p && Number.isFinite(p.lat) && Number.isFinite(p.lng) && !(p.lat === 0 && p.lng === 0);

/**
 * Modo de viagem. Moto ≈ carro; Routes API tem TWO_WHEELER, mas a cobertura é
 * regional — DRIVE é o default seguro. Configurável via ROUTE_TRAVEL_MODE.
 */
const TRAVEL_MODE = (process.env.ROUTE_TRAVEL_MODE || 'DRIVE').toUpperCase();

async function viaRoutesApi(origin: LatLng, destination: LatLng, apiKey: string): Promise<RouteResultV2 | null> {
  const resp = await axios.post(
    'https://routes.googleapis.com/directions/v2:computeRoutes',
    {
      origin: { location: { latLng: { latitude: origin.lat, longitude: origin.lng } } },
      destination: { location: { latLng: { latitude: destination.lat, longitude: destination.lng } } },
      travelMode: TRAVEL_MODE,
      // TRAFFIC_AWARE dá ETA melhor; só é aceito com DRIVE/TWO_WHEELER.
      routingPreference: TRAVEL_MODE === 'DRIVE' || TRAVEL_MODE === 'TWO_WHEELER' ? 'TRAFFIC_AWARE' : undefined,
      languageCode: 'pt-BR',
      units: 'METRIC',
    },
    {
      timeout: 8000,
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': apiKey,
        // FieldMask é OBRIGATÓRIO na Routes API — pede só o necessário (barato).
        'X-Goog-FieldMask': 'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
      },
    },
  );

  const route = resp.data?.routes?.[0];
  if (!route || route.distanceMeters == null) return null;

  // duration vem como string "123s".
  const durationSeconds = parseInt(String(route.duration || '0').replace('s', ''), 10) || 0;
  const distanceMeters = Number(route.distanceMeters);

  return {
    distanceMeters,
    distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
    durationSeconds,
    polyline: route.polyline?.encodedPolyline,
    source: 'routes',
  };
}

async function viaDirectionsLegacy(origin: LatLng, destination: LatLng, apiKey: string): Promise<RouteResultV2 | null> {
  const resp = await axios.get('https://maps.googleapis.com/maps/api/directions/json', {
    timeout: 8000,
    params: {
      origin: `${origin.lat},${origin.lng}`,
      destination: `${destination.lat},${destination.lng}`,
      mode: 'driving',
      key: apiKey,
      language: 'pt-BR',
    },
  });
  if (resp.data?.status !== 'OK') return null;
  const leg = resp.data.routes?.[0]?.legs?.[0];
  if (!leg) return null;
  const distanceMeters = leg.distance?.value || 0;
  return {
    distanceMeters,
    distanceKm: Math.round((distanceMeters / 1000) * 100) / 100,
    durationSeconds: leg.duration?.value || 0,
    polyline: resp.data.routes[0].overview_polyline?.points,
    source: 'directions',
  };
}

function viaHaversine(origin: LatLng, destination: LatLng): RouteResultV2 {
  const distanceKm = calculateDistance(origin.lat, origin.lng, destination.lat, destination.lng);
  const distanceMeters = Math.round(distanceKm * 1000);
  // ETA grosseiro só pra não devolver 0: ~25 km/h médios em cidade.
  const durationSeconds = Math.round((distanceKm / 25) * 3600);
  return { distanceMeters, distanceKm, durationSeconds, source: 'haversine' };
}

/**
 * Retorna a rota entre dois pontos. NUNCA lança: se tudo falhar, cai no haversine
 * (source='haversine'), que é sempre calculável. Retorna null só quando as
 * coordenadas em si são inválidas (0,0 / NaN) — aí não há o que rotear.
 */
export async function getRoute(params: {
  origin: LatLng;
  destination: LatLng;
  skipCache?: boolean;
}): Promise<RouteResultV2 | null> {
  const { origin, destination, skipCache } = params;
  if (!validCoord(origin) || !validCoord(destination)) return null;

  const key = cacheKey(origin, destination, TRAVEL_MODE);
  if (!skipCache) {
    const hit = cache.get(key);
    if (hit && hit.expiresAt > Date.now()) return hit.value;
  }

  const apiKey = process.env.GOOGLE_MAPS_API_KEY;
  let result: RouteResultV2 | null = null;

  if (apiKey) {
    // 1. Routes API (produto atual)
    try {
      result = await viaRoutesApi(origin, destination, apiKey);
    } catch (err: any) {
      console.warn('⚠️ [routeService] Routes API falhou, tentando Directions legada:', err?.response?.status || err?.message);
    }
    // 2. Directions legada
    if (!result) {
      try {
        result = await viaDirectionsLegacy(origin, destination, apiKey);
      } catch (err: any) {
        console.warn('⚠️ [routeService] Directions legada falhou, caindo no haversine:', err?.message);
      }
    }
  } else {
    console.warn('⚠️ [routeService] GOOGLE_MAPS_API_KEY não configurada — usando haversine (estimativa).');
  }

  // 3. Fallback final: haversine (nunca falha).
  if (!result) result = viaHaversine(origin, destination);

  // Só cacheia rota "de verdade" — não vale cachear estimativa haversine (quando a
  // API voltar, queremos a rota real na próxima).
  if (result.source !== 'haversine') {
    cache.set(key, { value: result, expiresAt: Date.now() + ROUTE_CACHE_TTL_MS });
  }
  return result;
}

/** Limpa o cache (usado em testes). */
export function _clearRouteCache() {
  cache.clear();
}

export default { getRoute, _clearRouteCache };
