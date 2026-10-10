import { deliveryStates, formatEtaRange } from '../deliveryView';
import type { DeliveryQuote } from '../../types/delivery';

const base: DeliveryQuote = { storeId: 's1', inArea: true, distanceKm: 2.4, etaMinutes: [25, 35], fee: 7.4, freeDelivery: false, open: true, source: 'estimate' };
const input = (quote: Partial<DeliveryQuote> | null, extra: Partial<{ loading: boolean; hasPoint: boolean }> = {}) => ({
  quote: quote ? { ...base, ...quote } : null,
  loading: false, hasPoint: true, address: 'Av. Paulista, 1578',
  onSetAddress: jest.fn(), onChangeAddress: jest.fn(), ...extra,
});
const kinds = (s: any[]) => s.map((x) => x.kind);

describe('deliveryStates', () => {
  it('sem ponto pede o endereço', () => expect(kinds(deliveryStates(input(base, { hasPoint: false })))).toEqual(['noAddress']));
  it('sem cotação: calculando ou nada', () => {
    expect(kinds(deliveryStates(input(null, { loading: true })))).toEqual(['loading']);
    expect(deliveryStates(input(null))).toEqual([]);
  });
  it('endereço inválido no servidor (inArea null) pede o endereço', () => expect(kinds(deliveryStates(input({ inArea: null, reason: 'NO_ADDRESS' })))).toEqual(['noAddress']));
  it('loja sem localização: não afirma nada', () => expect(deliveryStates(input({ inArea: false, reason: 'STORE_NO_LOCATION' }))).toEqual([]));
  it('fora da área diz o endereço', () => {
    const [s] = deliveryStates(input({ inArea: false, reason: 'OUT_OF_AREA' })) as any[];
    expect(s).toMatchObject({ kind: 'outOfArea', address: 'Av. Paulista, 1578' });
  });
  it('fechada mostra quando abre, e o frete continua', () => {
    expect(deliveryStates(input({ open: false, opensAt: '09:00' }))).toEqual([{ kind: 'closed', opensAt: '09:00' }, { kind: 'fee', fee: 7.4 }]);
  });
  it('aberta: prazo máximo (nunca otimista) e frete', () => {
    expect(deliveryStates(input({}))).toEqual([{ kind: 'fast', minutes: 35 }, { kind: 'fee', fee: 7.4 }]);
    expect(deliveryStates(input({ freeDelivery: true, fee: 0 }))).toEqual([{ kind: 'fast', minutes: 35 }, { kind: 'free' }]);
    expect(deliveryStates(input({ etaMinutes: null, fee: 0 }))).toEqual([{ kind: 'free' }]);
  });
  it('formatEtaRange', () => {
    expect(formatEtaRange([25, 35])).toBe('25–35 min');
    expect(formatEtaRange(null)).toBeNull();
  });
});
