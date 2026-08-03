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
