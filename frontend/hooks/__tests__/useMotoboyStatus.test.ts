import { renderHook, act, waitFor } from '@testing-library/react';
import api from '../../lib/api';
import { useMotoboyStatus } from '../useMotoboyStatus';

jest.mock('../../lib/api');
const mockedApi = api as jest.Mocked<typeof api>;

beforeEach(() => { jest.clearAllMocks(); });

test('lê o estado inicial do backend', async () => {
  mockedApi.get.mockResolvedValue({ data: { isOnline: true } } as any);
  const { result } = renderHook(() => useMotoboyStatus());
  await waitFor(() => expect(result.current.loading).toBe(false));
  expect(result.current.online).toBe(true);
});

test('setOnline faz POST e atualiza local', async () => {
  mockedApi.get.mockResolvedValue({ data: { isOnline: false } } as any);
  mockedApi.post.mockResolvedValue({ data: { isOnline: true } } as any);
  const { result } = renderHook(() => useMotoboyStatus());
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => { await result.current.setOnline(true); });

  expect(mockedApi.post).toHaveBeenCalledWith('/deliveries/availability', { isOnline: true });
  expect(result.current.online).toBe(true);
});

test('setOnline reverte em erro', async () => {
  mockedApi.get.mockResolvedValue({ data: { isOnline: false } } as any);
  mockedApi.post.mockRejectedValue(new Error('boom'));
  const { result } = renderHook(() => useMotoboyStatus());
  await waitFor(() => expect(result.current.loading).toBe(false));

  await act(async () => { await result.current.setOnline(true).catch(() => {}); });

  expect(result.current.online).toBe(false); // reverteu
});

describe('localização aproximada', () => {
  let onFix: ((pos: any) => void) | null = null;
  const fix = (accuracy: number) => ({ coords: { latitude: -23.55, longitude: -46.63, accuracy } });

  beforeEach(() => {
    onFix = null;
    jest.useFakeTimers();
    (navigator as any).geolocation = {
      getCurrentPosition: jest.fn(),
      watchPosition: jest.fn((ok: any) => { onFix = ok; return 1; }),
      clearWatch: jest.fn(),
    };
    mockedApi.get.mockResolvedValue({ data: { isOnline: true } } as any);
    mockedApi.post.mockResolvedValue({ data: {} } as any);
  });
  afterEach(() => { jest.useRealTimers(); });

  test('margem acima de 500 m por 20 s avisa; uma posição precisa tira o aviso', async () => {
    const { result, unmount } = renderHook(() => useMotoboyStatus());
    await waitFor(() => expect(result.current.online).toBe(true));
    await waitFor(() => expect(onFix).not.toBeNull());

    act(() => { onFix!(fix(2000)); });
    expect(result.current.imprecise).toBe(false); // 1º fix impreciso: ainda na tolerância
    expect(mockedApi.post).toHaveBeenCalledWith('/deliveries/location', expect.objectContaining({ accuracy: 2000 }));

    act(() => { jest.advanceTimersByTime(21000); onFix!(fix(1800)); });
    expect(result.current.imprecise).toBe(true);

    act(() => { onFix!(fix(12)); });
    expect(result.current.imprecise).toBe(false);
    unmount();
    delete (navigator as any).geolocation;
  });
});
