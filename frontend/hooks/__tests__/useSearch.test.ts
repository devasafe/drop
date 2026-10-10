import { renderHook, act, waitFor } from '@testing-library/react';
import api from '../../lib/api';
import { buildSearchUrl, useSearch } from '../useSearch';

jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;

describe('buildSearchUrl', () => {
  it('sem ponto: tira distance e openNow (o servidor recusaria)', () => {
    expect(buildSearchUrl({ q: ' fone ', type: 'products', point: null, filters: { sort: 'distance', openNow: true } }))
      .toBe('/search?q=fone&type=products&sort=relevance&limit=20');
  });
  it('com ponto, filtros e cursor', () => {
    expect(buildSearchUrl({ q: 'fone', type: 'stores', point: { lat: -23.5, lng: -46.6 }, filters: { sort: 'distance', openNow: true, minPrice: 10, maxPrice: 50, categoryName: 'Fones' } }, 'abc'))
      .toBe('/search?q=fone&type=stores&sort=distance&limit=20&lat=-23.5&lng=-46.6&openNow=1&minPrice=10&maxPrice=50&categoryName=Fones&cursor=abc');
  });
});

describe('useSearch', () => {
  beforeEach(() => get.mockReset());
  it('carrega a 1ª página e "carregar mais" acrescenta com o cursor', async () => {
    get.mockResolvedValueOnce({ data: { success: true, data: { items: [{ _id: 'a' }], nextCursor: 'c1' } } })
       .mockResolvedValueOnce({ data: { success: true, data: { items: [{ _id: 'b' }], nextCursor: null } } });
    const q = { q: 'fone', type: 'products' as const, point: null, filters: { sort: 'relevance' as const } };
    const { result } = renderHook(() => useSearch(q));
    await waitFor(() => expect(result.current.items).toHaveLength(1));
    expect(result.current.hasMore).toBe(true);
    await act(async () => { result.current.loadMore(); });
    await waitFor(() => expect(result.current.items.map((i) => i._id)).toEqual(['a', 'b']));
    expect(get).toHaveBeenLastCalledWith(expect.stringContaining('cursor=c1'));
    expect(result.current.hasMore).toBe(false);
  });
  it('erro vira failed, e retry busca de novo', async () => {
    get.mockRejectedValueOnce(new Error('500')).mockResolvedValueOnce({ data: { success: true, data: { items: [], nextCursor: null } } });
    const q = { q: 'fone', type: 'products' as const, point: null, filters: { sort: 'relevance' as const } };
    const { result } = renderHook(() => useSearch(q));
    await waitFor(() => expect(result.current.failed).toBe(true));
    await act(async () => { result.current.retry(); });
    await waitFor(() => expect(result.current.failed).toBe(false));
  });
});
