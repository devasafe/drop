import { renderHook, act } from '@testing-library/react';

const addresses = [
  { _id: 'a1', label: 'Trabalho', street: 'R. Funchal', number: '418', latitude: '-23.59', longitude: '-46.69' },
  { _id: 'a2', label: 'Casa', isDefault: true, street: 'Av. Paulista', number: '1578', latitude: '-23.56', longitude: '-46.65' },
  { _id: 'a3', street: 'Sem Pino', number: '9', latitude: '0', longitude: '0' },
];
let mockList: any[] = addresses;
jest.mock('../useSync', () => ({ useAddresses: () => ({ addresses: mockList, loading: false, setAddresses: jest.fn() }) }));

import { useDeliveryAddress, DELIVERY_ADDRESS_KEY, readDeliveryAddressId } from '../useDeliveryAddress';

beforeEach(() => { localStorage.clear(); mockList = addresses; });

test('sem escolha salva usa o padrão, com ponto e rótulo curto', () => {
  const { result } = renderHook(() => useDeliveryAddress());
  expect(result.current.selectedId).toBe('a2');
  expect(result.current.point).toEqual({ lat: -23.56, lng: -46.65 });
  expect(result.current.label).toBe('Av. Paulista, 1578');
});

test('escolher grava no aparelho e as outras instâncias acompanham', () => {
  const a = renderHook(() => useDeliveryAddress());
  const b = renderHook(() => useDeliveryAddress());
  act(() => a.result.current.select('a1'));
  expect(localStorage.getItem(DELIVERY_ADDRESS_KEY)).toBe('a1');
  expect(b.result.current.selectedId).toBe('a1');
});

test('coordenada 0,0 não vira ponto (sem prazo inventado)', () => {
  const { result } = renderHook(() => useDeliveryAddress());
  act(() => result.current.select('a3'));
  expect(result.current.point).toBeNull();
});

test('sem endereço salvo: nada selecionado', () => {
  mockList = [];
  const { result } = renderHook(() => useDeliveryAddress());
  expect(result.current.selected).toBeNull();
  expect(result.current.point).toBeNull();
  expect(result.current.label).toBe('');
});

test('storage indisponível não quebra', () => {
  const spy = jest.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('privado'); });
  expect(readDeliveryAddressId()).toBeNull();
  const { result } = renderHook(() => useDeliveryAddress());
  expect(result.current.selectedId).toBe('a2');
  spy.mockRestore();
});

test('id salvo que não é mais do usuário cai no endereço padrão', () => {
  localStorage.setItem(DELIVERY_ADDRESS_KEY, 'removido-ou-de-outra-conta');
  const { result } = renderHook(() => useDeliveryAddress());
  expect(result.current.selectedId).toBe('a2');
  expect(result.current.label).toBe('Av. Paulista, 1578');
});
