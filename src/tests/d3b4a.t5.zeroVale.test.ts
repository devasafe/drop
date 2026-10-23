/** D3b-4a · T5 (spec 5.3): taxa 0 vale 0 — antes `|| 5`, `|| 1` e `|| 20` trocavam o 0 pelo padrão. */
jest.mock('../repositories/platformConfig.repository', () => ({
  ...jest.requireActual('../repositories/platformConfig.repository'),
  getPlatformConfig: jest.fn(),
}));
jest.mock('../repositories/storeSubscription.repository', () => ({
  ...jest.requireActual('../repositories/storeSubscription.repository'),
  findSubByStoreId: jest.fn(),
}));
import { getPlatformConfig } from '../repositories/platformConfig.repository';
import { findSubByStoreId } from '../repositories/storeSubscription.repository';
import { prisma } from '../lib/prisma';
import {
  calculateDeliveryFeeWithConfig,
  calculateMotoboyEarningsWithConfig,
  calculateOrderDistribution,
} from '../utils/walletCalculations';
import { getDeliveryConfig } from '../services/deliveryQuote/config';

const cfg = getPlatformConfig as jest.Mock;

afterEach(() => jest.restoreAllMocks());

it('taxa fixa 0 e por km 0 dão frete 0', async () => {
  cfg.mockResolvedValue({ motoboyCutPerDelivery: 0, motoboyCutPerKm: 0 });
  expect(await calculateDeliveryFeeWithConfig(10)).toBe(0);
  expect(await calculateMotoboyEarningsWithConfig(10)).toBe(0);
  expect(await getDeliveryConfig()).toMatchObject({ base: 0, perKm: 0 });
});

it('sem config continua no padrão (5 + 1/km)', async () => {
  cfg.mockResolvedValue(null);
  expect(await calculateDeliveryFeeWithConfig(2)).toBe(7);
  expect(await getDeliveryConfig()).toMatchObject({ base: 5, perKm: 1 });
});

it('comissão do motoboy 0 deixa a entrega toda com o motoboy', async () => {
  cfg.mockResolvedValue({ motoboyCommissionPercent: 0 });
  (findSubByStoreId as jest.Mock).mockResolvedValue({ commissionRate: 15, currentPlan: 'x' });
  jest.spyOn(prisma.store, 'findUnique').mockResolvedValue({ plan: 2 } as any);
  const r = await calculateOrderDistribution(100, 10, 'store-1');
  expect(r.delivery?.commissionPercent).toBe(0);
  expect(r.motoboyAmount).toBe(10);
  expect(r.appTotalCommission).toBe(15);
  expect(r.storeAmount).toBe(85);
});
