import { haversineKm } from '../geo';
import { rankStores, rankPremiumProducts, isPremium } from '../catalogRanking';

const coords = { lat: -22.9, lng: -43.2 }; // Rio
const near = { latitude: '-22.91', longitude: '-43.21' };
const far = { latitude: '-23.55', longitude: '-46.63' }; // SP (~360km)

describe('geo/catalogRanking', () => {
  it('haversineKm: Rio→SP > 300km; ponto próximo < 5km', () => {
    expect(haversineKm(coords, { lat: -23.55, lng: -46.63 })).toBeGreaterThan(300);
    expect(haversineKm(coords, { lat: -22.91, lng: -43.21 })).toBeLessThan(5);
  });
  it('rankStores: premium antes; filtra fora do raio', () => {
    const stores = [
      { _id: 'a', plan: 1, ...near },
      { _id: 'b', plan: 3, ...near },
      { _id: 'c', plan: 3, ...far },
    ];
    expect(rankStores(stores, coords, { radiusKm: 20 }).map((s) => s._id)).toEqual(['b', 'a']);
  });
  it('rankStores premiumOnly: descarta loja não-premium', () => {
    const stores = [
      { _id: 'a', plan: 1, ...near },
      { _id: 'b', plan: 3, ...near },
      { _id: 'c', plan: 3, ...near },
    ];
    expect(rankStores(stores, coords, { radiusKm: 20, premiumOnly: true }).map((s) => s._id)).toEqual(['b', 'c']);
  });
  it('rankStores: sem coords do usuário não filtra por proximidade', () => {
    const stores = [{ _id: 'a', plan: 1, ...far }, { _id: 'b', plan: 3, ...far }];
    expect(rankStores(stores, null, { radiusKm: 20 }).map((s) => s._id)).toEqual(['b', 'a']);
  });
  it('rankPremiumProducts: só premium no raio, mantém ordem de vendas', () => {
    const prods = [
      { _id: 'p1', storePlan: 3, storeId: 's-near' },
      { _id: 'p2', storePlan: 1, storeId: 's-near' },
      { _id: 'p3', storePlan: 3, storeId: 's-far' },
    ];
    const coordsByStore = new Map<string, any>([
      ['s-near', near],
      ['s-far', far],
    ]);
    expect(rankPremiumProducts(prods, coordsByStore, coords, { radiusKm: 20 }).map((p) => p._id)).toEqual(['p1']);
  });
  it('isPremium', () => {
    expect(isPremium({ plan: 3 })).toBe(true);
    expect(isPremium({ plan: 1 })).toBe(false);
  });
});
