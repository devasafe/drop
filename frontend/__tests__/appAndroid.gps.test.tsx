/** GPS do motoboy no app Android: serviço nativo ligado enquanto online, posição por HTTP nativo. */
import { renderHook, waitFor } from '@testing-library/react';

// Como o Capacitor: o plugin é um Proxy em que toda propriedade vira chamada nativa, inclusive
// `then`, que nunca responde. Se o código devolver o plugin por uma Promise, o teste trava.
function mockCapacitorProxy<T extends object>(target: T): T {
  return new Proxy(target, { get: (t: any, prop) => (prop === 'then' ? () => undefined : t[prop]) });
}
import api from '../lib/api';

let watcherCb: ((loc?: any, err?: any) => void) | null = null;
const bg = {
  addWatcher: jest.fn(async (_opts: any, cb: any) => { watcherCb = cb; return 'w1'; }),
  removeWatcher: jest.fn(async () => undefined),
};
const httpPost = jest.fn(async (_o: any) => ({ status: 200, data: {} }));
jest.mock('@capacitor/core', () => ({ registerPlugin: () => mockCapacitorProxy(bg), CapacitorHttp: { post: (o: any) => httpPost(o) } }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(async () => ({ data: {} })) } }));

import { useMotoboyStatus } from '../hooks/useMotoboyStatus';
import { setNativeRideActive } from '../lib/nativeLocation';

const fix = (lat: number, lng: number, simulated = false) => ({ latitude: lat, longitude: lng, accuracy: 8, simulated });

beforeEach(() => {
  jest.clearAllMocks();
  watcherCb = null;
  (window as any).Capacitor = { isNativePlatform: () => true };
  (api.get as jest.Mock).mockResolvedValue({ data: { isOnline: true } });
});
afterAll(() => { (window as any).Capacitor = undefined; });

test('online no app: liga o serviço nativo com a notificação fixa e manda a posição por HTTP nativo', async () => {
  const { result, unmount } = renderHook(() => useMotoboyStatus());
  await waitFor(() => expect(bg.addWatcher).toHaveBeenCalled());
  expect(bg.addWatcher.mock.calls[0][0]).toEqual(expect.objectContaining({ requestPermissions: true, distanceFilter: 0, backgroundTitle: expect.any(String) }));

  watcherCb!(fix(-23.55, -46.63));
  await waitFor(() => expect(httpPost).toHaveBeenCalledTimes(1));
  expect(httpPost).toHaveBeenCalledWith(expect.objectContaining({
    url: expect.stringMatching(/\/api\/deliveries\/location$/),
    data: { lat: -23.55, lng: -46.63, accuracy: 8, isOnline: true, simulated: false },
  }));
  expect(result.current.gps).toBe('active');
  // não passa pelo axios da WebView (que o Android segura em segundo plano)
  expect(api.post).not.toHaveBeenCalledWith('/deliveries/location', expect.anything());

  // fora de corrida: no máximo a cada 15 s
  watcherCb!(fix(-23.56, -46.64));
  await new Promise((r) => setTimeout(r, 0));
  expect(httpPost).toHaveBeenCalledTimes(1);

  // em corrida: a próxima sai na hora
  setNativeRideActive(true);
  watcherCb!(fix(-23.57, -46.65, true));
  await waitFor(() => expect(httpPost).toHaveBeenCalledTimes(2));
  expect((httpPost.mock.calls[1] as any)[0].data.simulated).toBe(true);
  setNativeRideActive(false);

  unmount();
  await waitFor(() => expect(bg.removeWatcher).toHaveBeenCalledWith({ id: 'w1' }));
});

test('permissão negada vira "denied"', async () => {
  const { result } = renderHook(() => useMotoboyStatus());
  await waitFor(() => expect(bg.addWatcher).toHaveBeenCalled());
  watcherCb!(undefined, Object.assign(new Error('no'), { code: 'NOT_AUTHORIZED' }));
  await waitFor(() => expect(result.current.gps).toBe('denied'));
});

test('offline: o serviço nativo não liga', async () => {
  (api.get as jest.Mock).mockResolvedValue({ data: { isOnline: false } });
  const { result } = renderHook(() => useMotoboyStatus());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(bg.addWatcher).not.toHaveBeenCalled();
});
