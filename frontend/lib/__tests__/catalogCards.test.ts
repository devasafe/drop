import { productCardData } from '../catalogCards';
import { mapStore } from '../mapStore';

const q = { storeId: 's1', inArea: true, distanceKm: 2, etaMinutes: [25, 35] as [number, number], fee: 6.2, freeDelivery: false, open: true, source: 'estimate' as const };

it('productCardData: preço, desconto real, estoque e entrega', () => {
  const d = productCardData({ _id: 'p1', name: 'Fone', price: '229.90', oldPrice: 289.9, quantity: 2, storeName: 'Eletro' }, q);
  expect(d).toMatchObject({ name: 'Fone', price: 229.9, oldPrice: 289.9, discountPercent: 21, stock: 2, etaMinutes: 35, store: 'Eletro' });
  expect(productCardData({ name: 'x', price: 10, oldPrice: 5 }).oldPrice).toBeUndefined();
  expect(productCardData({ name: 'x', price: 10 }, { ...q, inArea: false, reason: 'OUT_OF_AREA' }).outOfArea).toBe(true);
});

it('mapStore com cotação: status pela cotação, prazo, frete e fora da área', () => {
  expect(mapStore({ name: 'L', isOpen: true }, q)).toMatchObject({ status: 'aberta', etaMin: [25, 35], fee: 6.2 });
  expect(mapStore({ name: 'L', isOpen: true }, { ...q, open: false, opensAt: '09:00' })).toMatchObject({ status: 'fechada', opensAt: '09:00' });
  expect(mapStore({ name: 'L' }, { ...q, inArea: false, reason: 'OUT_OF_AREA' }).outOfArea).toBe(true);
  expect(mapStore({ name: 'L' }, { ...q, freeDelivery: true, fee: 0 })).toMatchObject({ freeDelivery: true });
});

it('loja fechada (com ou sem opensAt): sem prazo, frete nem frete grátis', () => {
  for (const extra of [{ opensAt: '09:00' }, {}]) {
    const quote = { ...q, open: false, freeDelivery: true, fee: 0, ...extra };
    const s = mapStore({ name: 'L' }, quote);
    expect(s.status).toBe('fechada');
    expect(s.etaMin).toBeUndefined();
    expect(s.fee).toBeUndefined();
    expect(s.freeDelivery).toBeUndefined();
    const d = productCardData({ name: 'x', price: 10 }, quote);
    expect(d.etaMinutes).toBeUndefined();
    expect(d.freeDelivery).toBe(false);
  }
});
