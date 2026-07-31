import { renderHook } from '@testing-library/react';
import { useDeliveryFee } from '../useDeliveryFee';

const config = { base: 5, perKm: 2 };

test('fee = base + km*perKm', () => {
  const { result } = renderHook(() => useDeliveryFee({ distanceKm: 3, config, isPlan1: false }));
  expect(result.current.deliveryFee).toBe(11); // 5 + 3*2
});

test('plano 1 => 0', () => {
  const { result } = renderHook(() => useDeliveryFee({ distanceKm: 3, config, isPlan1: true }));
  expect(result.current.deliveryFee).toBe(0);
});

test('distancia < 0.1 => 0', () => {
  const { result } = renderHook(() => useDeliveryFee({ distanceKm: 0, config, isPlan1: false }));
  expect(result.current.deliveryFee).toBe(0);
});

test('config nula => 0', () => {
  const { result } = renderHook(() => useDeliveryFee({ distanceKm: 3, config: null, isPlan1: false }));
  expect(result.current.deliveryFee).toBe(0);
});
