import { renderHook } from '@testing-library/react';
import api from '../../lib/api';
import { buildSearchUrl } from '../useSearch';
import { useNearbyStores, useOffers } from '../useCatalogHome';

// Minor M3: a coordenada exata da casa do cliente não vai na URL (logs de proxy/erro).
// 3 casas (~110 m) bastam para cards e estimativa; o backend aceita qualquer número (z.coerce).
jest.mock('../../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => new Promise(() => {})) } }));
const get = api.get as jest.Mock;
const point = { lat: -22.912345, lng: -43.209876 };

beforeEach(() => get.mockClear());

test('/search leva lat/lng com 3 casas', () => {
  const url = buildSearchUrl({ q: 'fone', type: 'products', point, filters: { sort: 'distance' } });
  expect(url).toContain('lat=-22.912&lng=-43.21');
});

test('/stores/nearby leva lat/lng com 3 casas', () => {
  renderHook(() => useNearbyStores(point));
  expect(get).toHaveBeenCalledWith('/stores/nearby?lat=-22.912&lng=-43.21&limit=12');
});

test('/products/offers leva lat/lng com 3 casas', () => {
  renderHook(() => useOffers(point));
  expect(get).toHaveBeenCalledWith('/products/offers?lat=-22.912&lng=-43.21&limit=10');
});
