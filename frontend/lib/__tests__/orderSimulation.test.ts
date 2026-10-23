import { simulateOrder } from '../orderSimulation';

const CFG = {
  commissionPlan1: 10, commissionPlan2: 15, commissionPlan3: 5,
  motoboyCutPerDelivery: 5, motoboyCutPerKm: 1, motoboyCommissionPercent: 20,
};

describe('simulateOrder (mesma conta de walletCalculations.ts)', () => {
  it('R$ 100 a 3 km no plano 2 (exemplo do protótipo): DROP fica com R$ 16,60', () => {
    expect(simulateOrder(CFG, { productTotal: 100, distanceKm: 3, plan: 2 })).toEqual({
      deliveryFee: 8, clientPays: 108, storeReceives: 85, storeCommissionPercent: 15,
      motoboyReceives: 6.4, motoboySharePercent: 80, dropKeeps: 16.6,
    });
  });

  it('plano 2 com 12%: DROP fica com R$ 13,60 e a loja com R$ 88,00', () => {
    const r = simulateOrder({ ...CFG, commissionPlan2: 12 }, { productTotal: 100, distanceKm: 3, plan: 2 });
    expect(r.dropKeeps).toBe(13.6);
    expect(r.storeReceives).toBe(88);
  });

  it('plano 1 (vitrine): sem taxa de entrega e sem motoboy', () => {
    expect(simulateOrder(CFG, { productTotal: 100, distanceKm: 3, plan: 1 })).toEqual({
      deliveryFee: 0, clientPays: 100, storeReceives: 90, storeCommissionPercent: 10,
      motoboyReceives: 0, motoboySharePercent: 80, dropKeeps: 10,
    });
  });

  it('valores ausentes caem nos padrões do servidor (5 fixo, 1 por km, 20%)', () => {
    const r = simulateOrder({ commissionPlan2: 15 }, { productTotal: 100, distanceKm: 3, plan: 2 });
    expect(r.deliveryFee).toBe(8);
    expect(r.motoboySharePercent).toBe(80);
  });

  // D3b-4a: 0 vale 0 (antes o || trocava por 5, 1 e 20)
  it('valores zerados valem zero', () => {
    const r = simulateOrder({ commissionPlan2: 15, motoboyCutPerDelivery: 0, motoboyCutPerKm: 0, motoboyCommissionPercent: 0 },
      { productTotal: 100, distanceKm: 3, plan: 2 });
    expect(r.deliveryFee).toBe(0);
    expect(r.motoboyReceives).toBe(0);
    expect(r.motoboySharePercent).toBe(100);
  });

  it('distância negativa conta como zero', () => {
    expect(simulateOrder(CFG, { productTotal: 50, distanceKm: -2, plan: 2 }).deliveryFee).toBe(5);
  });
});
