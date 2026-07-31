import { renderHook, act, waitFor } from '@testing-library/react';
import { useCheckoutAddress } from '../useCheckoutAddress';

jest.mock('../useSync', () => ({
  useAddresses: () => ({
    addresses: [
      { _id: 'a1', cep: '20000-000', street: 'Rua A', number: '10', neighborhood: 'Centro', city: 'Rio', state: 'RJ', latitude: '-22.9', longitude: '-43.2' },
    ],
    loading: false,
    setAddresses: jest.fn(),
  }),
}));

test('selectAddress popula selected com lat/long', () => {
  const { result } = renderHook(() => useCheckoutAddress());
  act(() => result.current.selectAddress(0));
  expect(result.current.selected?.latitude).toBe('-22.9');
  expect(result.current.selected?.longitude).toBe('-43.2');
});

test('lookupCep preenche campos', async () => {
  global.fetch = jest.fn().mockResolvedValue({
    json: async () => ({ logradouro: 'Rua B', bairro: 'Tijuca', localidade: 'Rio', uf: 'RJ' }),
  }) as unknown as typeof fetch;
  const { result } = renderHook(() => useCheckoutAddress());
  await act(async () => { await result.current.lookupCep('20510-000'); });
  await waitFor(() => expect(result.current.fields.street).toBe('Rua B'));
});
