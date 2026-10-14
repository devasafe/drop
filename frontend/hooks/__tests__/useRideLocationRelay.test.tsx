import { renderHook, act } from '@testing-library/react';
import { useRideLocationRelay } from '../useRideLocationRelay';

jest.mock('../../lib/logger', () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn() }));

let onPos: ((p: any) => void) | null = null;
let onErr: ((e: any) => void) | null = null;
const watch = jest.fn((ok: any, err: any) => { onPos = ok; onErr = err; return 7; });
const clear = jest.fn();
const current = jest.fn();
beforeAll(() => {
  (global.navigator as any).geolocation = { watchPosition: watch, clearWatch: clear, getCurrentPosition: current };
});
beforeEach(() => { jest.clearAllMocks(); onPos = null; onErr = null; });

const pos = (lat: number, lng: number, accuracy = 8) => ({ coords: { latitude: lat, longitude: lng, accuracy } });

test('emite delivery:location_updated com o payload antigo, só em assigned/picked', () => {
  const emit = jest.fn();
  let now = 1_000_000;
  const spy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  const { rerender, result } = renderHook(({ ride }) => useRideLocationRelay(ride, emit), { initialProps: { ride: { _id: 'd1', status: 'assigned' } as any } });
  expect(watch).toHaveBeenCalledWith(expect.any(Function), expect.any(Function), { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  act(() => onPos!(pos(-23.5, -46.6)));
  expect(emit).toHaveBeenCalledWith('delivery:location_updated', expect.objectContaining({ deliveryId: 'd1', latitude: -23.5, longitude: -46.6, accuracy: 8, timestamp: expect.any(String) }));
  expect(result.current.currentLocation).toEqual({ lat: -23.5, lng: -46.6 });

  // menos de 5 s: não emite
  now += 3000;
  act(() => onPos!(pos(-23.51, -46.61)));
  expect(emit).toHaveBeenCalledTimes(1);
  // 5 s, mas parado (< 0.0001): não emite
  now += 3000;
  act(() => onPos!(pos(-23.50001, -46.60001)));
  expect(emit).toHaveBeenCalledTimes(1);
  // 5 s e andou: emite
  act(() => onPos!(pos(-23.52, -46.62)));
  expect(emit).toHaveBeenCalledTimes(2);

  // corrida entregue: para de emitir
  rerender({ ride: { _id: 'd1', status: 'delivered' } });
  now += 10000;
  act(() => onPos!(pos(-23.6, -46.7)));
  expect(emit).toHaveBeenCalledTimes(2);
  spy.mockRestore();
});

test('voltar ao app reabre o watch e libera um emit imediato', () => {
  const emit = jest.fn();
  let now = 2_000_000;
  const spy = jest.spyOn(Date, 'now').mockImplementation(() => now);
  renderHook(() => useRideLocationRelay({ _id: 'd1', status: 'picked' }, emit));
  act(() => onPos!(pos(-23.5, -46.6)));
  now += 1000;
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  act(() => { document.dispatchEvent(new Event('visibilitychange')); });
  expect(clear).toHaveBeenCalledWith(7);
  expect(watch).toHaveBeenCalledTimes(2);
  expect(current).toHaveBeenCalled();
  act(() => onPos!(pos(-23.51, -46.61)));
  expect(emit).toHaveBeenCalledTimes(2);
  spy.mockRestore();
});

test('permissão negada zera a posição', () => {
  const { result } = renderHook(() => useRideLocationRelay({ _id: 'd1', status: 'assigned' }, jest.fn()));
  act(() => onPos!(pos(-23.5, -46.6)));
  act(() => onErr!({ code: 1, PERMISSION_DENIED: 1, message: 'denied' }));
  expect(result.current.currentLocation).toBeNull();
});

test('desmontar limpa o watch', () => {
  const { unmount } = renderHook(() => useRideLocationRelay({ _id: 'd1', status: 'assigned' }, jest.fn()));
  unmount();
  expect(clear).toHaveBeenCalledWith(7);
});
