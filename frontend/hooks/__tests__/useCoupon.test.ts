import { renderHook, act } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import { useCoupon } from '../useCoupon';
import api from '../../lib/api';

jest.mock('../../lib/api');
const mockedApi = api as jest.Mocked<typeof api>;

test('apply valido define discount e mensagem ok', async () => {
  mockedApi.post.mockResolvedValueOnce({ data: { discount: 10 } } as unknown as AxiosResponse<{ discount: number }>);
  const { result } = renderHook(() => useCoupon({ storeId: 's1', subtotal: 100 }));
  act(() => result.current.setCode('PROMO'));
  await act(async () => { await result.current.apply(); });
  expect(result.current.discount).toBe(10);
  expect(result.current.message?.type).toBe('ok');
});

test('apply invalido zera discount e mensagem de erro', async () => {
  mockedApi.post.mockRejectedValueOnce({ response: { data: { error: 'Cupom inválido' } } });
  const { result } = renderHook(() => useCoupon({ storeId: 's1', subtotal: 100 }));
  act(() => result.current.setCode('X'));
  await act(async () => { await result.current.apply(); });
  expect(result.current.discount).toBe(0);
  expect(result.current.message?.type).toBe('error');
});

test('remove limpa tudo', async () => {
  const { result } = renderHook(() => useCoupon({ storeId: 's1', subtotal: 100 }));
  act(() => { result.current.setCode('P'); result.current.remove(); });
  expect(result.current.discount).toBe(0);
  expect(result.current.code).toBe('');
});
