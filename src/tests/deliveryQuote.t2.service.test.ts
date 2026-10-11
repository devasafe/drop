import { estimateQuote, routeQuote, QuoteConfig } from '../services/deliveryQuote/quote';
import { getRoute } from '../services/routeService';
import { isDirectMode } from '../utils/settlement';
import { findSubByStoreId } from '../repositories/storeSubscription.repository';

jest.mock('../services/routeService', () => ({ getRoute: jest.fn() }));
jest.mock('../utils/settlement', () => ({ isDirectMode: jest.fn() }));
jest.mock('../repositories/storeSubscription.repository', () => ({ findSubByStoreId: jest.fn() }));
jest.mock('../services/deliveryQuote/config', () => ({
  ...jest.requireActual('../services/deliveryQuote/config'),
  getDeliveryConfig: jest.fn(async () => ({
    defaultRadiusKm: 12, defaultPrepMinutes: 15, avgSpeedKmh: 25, detourFactor: 1.3, base: 5, perKm: 1,
  })),
}));
jest.mock('../utils/walletCalculations', () => ({
  calculateDeliveryFeeWithConfig: jest.fn(async (km: number) => 5 + 1 * Math.max(0, km)),
}));

const cfg: QuoteConfig = {
  defaultRadiusKm: 12, defaultPrepMinutes: 15, avgSpeedKmh: 25, detourFactor: 1.3, base: 5, perKm: 1,
};
const store: any = { id: 's1', latitude: '-23.5505', longitude: '-46.6333', isOpen: true };
// ~1 grau de latitude = 111,19 km
const north = (km: number) => ({ lat: -23.5505 + km / 111.19, lng: -46.6333 });

// Segunda-feira 12:00 no Brasil (UTC-3).
const NOW = new Date('2026-10-12T15:00:00Z');

describe('estimateQuote', () => {
  it('dentro do raio: taxa pela fórmula sobre a distância estimada', () => {
    const q = estimateQuote(store, north(5), cfg, NOW);
    expect(q.inArea).toBe(true);
    expect(q.source).toBe('estimate');
    expect(q.distanceKm).toBeCloseTo(5 * 1.3, 1);
    expect(q.fee).toBeCloseTo(5 + 1 * q.distanceKm!, 2);
    expect(q.freeDelivery).toBe(false);
    expect(q.reason).toBeUndefined();
  });

  it('fora do raio: OUT_OF_AREA, sem taxa nem prazo', () => {
    const q = estimateQuote(store, north(15), cfg, NOW);
    expect(q).toMatchObject({ inArea: false, reason: 'OUT_OF_AREA', fee: null, etaMinutes: null, distanceKm: null });
  });

  it('o raio é na linha reta, não na rota: reta 11 km (rota 14,3) ainda está dentro', () => {
    const q = estimateQuote(store, north(11), cfg, NOW);
    expect(q.inArea).toBe(true);
    expect(q.distanceKm).toBeGreaterThan(12);
  });

  it('borda: no raio entra; um pouco além sai', () => {
    const c = { ...cfg, defaultRadiusKm: 5 };
    expect(estimateQuote(store, north(4.99), c, NOW).inArea).toBe(true);
    expect(estimateQuote(store, north(5.05), c, NOW).inArea).toBe(false);
  });

  it('a loja só diminui o raio, nunca amplia', () => {
    expect(estimateQuote({ ...store, deliveryRadiusKm: 3 }, north(5), cfg, NOW).reason).toBe('OUT_OF_AREA');
    expect(estimateQuote({ ...store, deliveryRadiusKm: 50 }, north(15), cfg, NOW).reason).toBe('OUT_OF_AREA');
  });

  it.each([
    ['null', null],
    ['NaN', { lat: NaN, lng: -46 }],
    ['0,0', { lat: 0, lng: 0 }],
    ['lat > 90', { lat: 91, lng: -46 }],
    ['lng > 180', { lat: -23, lng: 181 }],
    ['string vazia', { lat: '' as any, lng: '' as any }],
  ])('NO_ADDRESS para coordenada inválida (%s)', (_n, p) => {
    const q = estimateQuote(store, p as any, cfg, NOW);
    expect(q).toMatchObject({ inArea: null, reason: 'NO_ADDRESS', fee: null, etaMinutes: null });
  });

  it('STORE_NO_LOCATION quando a loja não tem lat/lng', () => {
    for (const s of [{ ...store, latitude: null }, { ...store, longitude: '' }, { ...store, latitude: '0', longitude: '0' }]) {
      expect(estimateQuote(s, north(2), cfg, NOW)).toMatchObject({ inArea: false, reason: 'STORE_NO_LOCATION', fee: null });
    }
  });

  it('prazo = preparo + deslocamento arredondado a 5 min; max = min + 10', () => {
    // 5 km reta -> 6,5 km a 25 km/h = 15,6 min; + 15 de preparo = 30,6 -> 35 (para cima)
    expect(estimateQuote(store, north(5), cfg, NOW).etaMinutes).toEqual([35, 45]);
    // preparo da loja 20 + 0 km -> 20 (já múltiplo de 5)
    expect(estimateQuote({ ...store, prepMinutes: 20 }, north(0), cfg, NOW).etaMinutes).toEqual([20, 30]);
    // 8 km reta -> 10,4 km = 24,96 min + 15 = 39,96 -> 40
    expect(estimateQuote(store, north(8), cfg, NOW).etaMinutes).toEqual([40, 50]);
  });

  it('arredonda o prazo para cima: 30,6 -> 35 e 35,1 -> 40', () => {
    expect(estimateQuote(store, north(5), cfg, NOW).etaMinutes![0]).toBe(35); // 30,6
    expect(estimateQuote({ ...store, prepMinutes: 19 }, north(0), { ...cfg }, NOW).etaMinutes![0]).toBe(20); // 19 -> 20
    expect(estimateQuote({ ...store, prepMinutes: 21 }, north(0), { ...cfg }, NOW).etaMinutes![0]).toBe(25); // 21 -> 25
  });

  it('Plano 1 na custódia: taxa 0, frete grátis e prazo sem deslocamento', () => {
    const q = estimateQuote(store, north(8), { ...cfg, plan1Free: true }, NOW);
    expect(q).toMatchObject({ inArea: true, fee: 0, freeDelivery: true, etaMinutes: [15, 25] });
  });

  it('modo direto (plan1Free false): cobra a fórmula normalmente', () => {
    const q = estimateQuote(store, north(8), { ...cfg, plan1Free: false }, NOW);
    expect(q.fee).toBeGreaterThan(5);
    expect(q.freeDelivery).toBe(false);
  });

  it('loja fechada pelo horário informa opensAt', () => {
    const s = { ...store, operatingHours: { monday: { open: '18:00', close: '23:00' } } };
    expect(estimateQuote(s, north(2), cfg, NOW)).toMatchObject({ open: false, opensAt: '18:00' });
  });

  it('fechada depois do expediente: opensAt aponta o próximo dia com horário', () => {
    const s = { ...store, operatingHours: { monday: { open: '08:00', close: '10:00' }, tuesday: { open: '09:30', close: '20:00' } } };
    expect(estimateQuote(s, north(2), cfg, NOW)).toMatchObject({ open: false, opensAt: '09:30' });
  });

  it('dia seguinte sem configuração conta como aberto o dia todo: opensAt 00:00', () => {
    const s = { ...store, operatingHours: { monday: { open: '08:00', close: '10:00' } } };
    expect(estimateQuote(s, north(2), cfg, NOW)).toMatchObject({ open: false, opensAt: '00:00' });
  });

  it('virada de dia: 01:30Z ainda é sexta 22:30 em Brasília (dia da semana e opensAt seguem BRT)', () => {
    const late = new Date('2026-10-10T01:30:00Z');
    const s = {
      ...store,
      operatingHours: { friday: { open: '23:00', close: '23:59' }, saturday: { open: '09:00', close: '18:00' } },
    };
    // Em UTC seria sábado 01:30 e a abertura seria 09:00; em BRT abre hoje (sexta) às 23:00.
    expect(estimateQuote(s, north(2), cfg, late)).toMatchObject({ open: false, opensAt: '23:00' });
    // E 23:30 BRT (02:30Z) já está aberta (sexta 23:00-23:59).
    expect(estimateQuote(s, north(2), cfg, new Date('2026-10-10T02:30:00Z')).open).toBe(true);
  });

  it('aberta no horário; toggle manual desligado fecha sem opensAt', () => {
    const s = { ...store, operatingHours: { monday: { open: '08:00', close: '23:00' } } };
    expect(estimateQuote(s, north(2), cfg, NOW)).toMatchObject({ open: true });
    const off = estimateQuote({ ...s, isOpen: false }, north(2), cfg, NOW);
    expect(off.open).toBe(false);
    expect(off.opensAt).toBeUndefined();
  });

  it('NO_ADDRESS ainda informa se a loja está aberta', () => {
    expect(estimateQuote({ ...store, isOpen: false }, null, cfg, NOW).open).toBe(false);
  });
});

describe('routeQuote', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (isDirectMode as jest.Mock).mockResolvedValue(false);
    (findSubByStoreId as jest.Mock).mockResolvedValue({ currentPlan: 'plan2' });
  });

  it('usa a distância e a duração da rota + preparo', async () => {
    (getRoute as jest.Mock).mockResolvedValue({ distanceKm: 7, distanceMeters: 7000, durationSeconds: 1200, source: 'routes' });
    const q = await routeQuote(store, north(5), NOW);
    expect(q).toMatchObject({ inArea: true, source: 'route', distanceKm: 7, fee: 12 });
    // 15 + 20 = 35
    expect(q.etaMinutes).toEqual([35, 45]);
    expect(q.reason).toBeUndefined();
  });

  it('getRoute null: ROUTE_FAILED, inArea pela reta, taxa pela estimativa, source estimate', async () => {
    (getRoute as jest.Mock).mockResolvedValue(null);
    const q = await routeQuote(store, north(5), NOW);
    expect(q).toMatchObject({ inArea: true, reason: 'ROUTE_FAILED', source: 'estimate' });
    expect(q.fee).toBeCloseTo(5 + q.distanceKm!, 2);
    expect(q.etaMinutes).toEqual([35, 45]);
  });

  it('fora da área ou sem endereço: não chama a rota', async () => {
    expect((await routeQuote(store, north(20), NOW)).reason).toBe('OUT_OF_AREA');
    expect((await routeQuote(store, null, NOW)).reason).toBe('NO_ADDRESS');
    expect(getRoute).not.toHaveBeenCalled();
  });

  it('Plano 1 na custódia: taxa 0, sem rotear', async () => {
    (findSubByStoreId as jest.Mock).mockResolvedValue({ currentPlan: 'plan1' });
    const q = await routeQuote(store, north(5), NOW);
    expect(q).toMatchObject({ fee: 0, freeDelivery: true, etaMinutes: [15, 25] });
    expect(getRoute).not.toHaveBeenCalled();
  });

  it('modo direto ignora o plano: cobra pela rota mesmo no Plano 1', async () => {
    (isDirectMode as jest.Mock).mockResolvedValue(true);
    (findSubByStoreId as jest.Mock).mockResolvedValue({ currentPlan: 'plan1' });
    (getRoute as jest.Mock).mockResolvedValue({ distanceKm: 4, distanceMeters: 4000, durationSeconds: 600, source: 'routes' });
    const q = await routeQuote(store, north(3), NOW);
    expect(q).toMatchObject({ fee: 9, freeDelivery: false, source: 'route' });
  });
});
