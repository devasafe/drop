import { routeQuote, estimateQuote } from '../services/deliveryQuote/quote';
import { calculateDeliveryFeeWithConfig } from '../utils/walletCalculations';
import { getRoute } from '../services/routeService';

// NÃO mocka walletCalculations: a taxa da cotação tem que bater com a função real.
jest.mock('../services/routeService', () => ({ getRoute: jest.fn() }));
jest.mock('../utils/settlement', () => ({ isDirectMode: jest.fn(async () => true) }));
jest.mock('../repositories/storeSubscription.repository', () => ({ findSubByStoreId: jest.fn() }));
jest.mock('../repositories/platformConfig.repository', () => ({
  getPlatformConfig: jest.fn(async () => ({ motoboyCutPerDelivery: 7, motoboyCutPerKm: 2 })),
}));

const store: any = { id: 's1', latitude: '-23.5505', longitude: '-46.6333', isOpen: true };
const point = { lat: -23.5505 + 5 / 111.19, lng: -46.6333 };

describe('cotação x fórmula real da taxa', () => {
  it('routeQuote cobra exatamente calculateDeliveryFeeWithConfig(distância da rota)', async () => {
    (getRoute as jest.Mock).mockResolvedValue({ distanceKm: 6.5, distanceMeters: 6500, durationSeconds: 900, source: 'routes' });
    const q = await routeQuote(store, point);
    const real = await calculateDeliveryFeeWithConfig(6.5);
    expect(real).toBe(7 + 2 * 6.5);
    expect(q.fee).toBe(real);
  });

  it('estimateQuote com a mesma config bate com a fórmula real sobre a distância estimada', async () => {
    const cfg = { defaultRadiusKm: 12, defaultPrepMinutes: 15, avgSpeedKmh: 25, detourFactor: 1.3, base: 7, perKm: 2 };
    const q = estimateQuote(store, point, cfg);
    expect(q.fee).toBeCloseTo(await calculateDeliveryFeeWithConfig(q.distanceKm!), 2);
  });
});
