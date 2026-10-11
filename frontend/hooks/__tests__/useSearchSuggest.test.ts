import { renderHook, act } from '@testing-library/react';
import api from '../../lib/api';
import { useSearchSuggest } from '../useSearchSuggest';

jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;
const data = { products: [{ id: 'p1', name: 'Fone', image: null, price: 10, oldPrice: null, storeId: 's1' }], stores: [], categories: [] };

beforeEach(() => { jest.useFakeTimers(); get.mockReset(); get.mockResolvedValue({ data: { success: true, data } }); });
afterEach(() => jest.useRealTimers());

it('durante o debounce não devolve a resposta do termo anterior', async () => {
  const { result, rerender } = renderHook(({ t }) => useSearchSuggest(t), { initialProps: { t: 'fone' } });
  await act(async () => { jest.advanceTimersByTime(250); });
  expect(result.current.data).toEqual(data);
  rerender({ t: 'fones' });
  expect(result.current.data).toBeNull();
});
it('não busca com menos de 2 caracteres', () => {
  renderHook(() => useSearchSuggest('f'));
  act(() => { jest.advanceTimersByTime(500); });
  expect(get).not.toHaveBeenCalled();
});
it('debounce: só a última digitação vai ao servidor', async () => {
  const { result, rerender } = renderHook(({ t }) => useSearchSuggest(t), { initialProps: { t: 'fo' } });
  rerender({ t: 'fon' });
  rerender({ t: 'fone blu' });
  await act(async () => { jest.advanceTimersByTime(250); });
  expect(get).toHaveBeenCalledTimes(1);
  expect(get).toHaveBeenCalledWith('/search/suggest?q=fone%20blu');
  expect(result.current.data).toEqual(data);
});
