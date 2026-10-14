import { renderHook, act, waitFor } from '@testing-library/react';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { post: jest.fn() } }));
let mockOnline = true;
jest.mock('../../../../hooks/useOnline', () => ({ useOnline: () => mockOnline }));
import { useFinalizeRide } from '../useFinalizeRide';
const post = api.post as jest.Mock;

function deferred<T>() {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; });
  return { promise, resolve, reject };
}
const wrong = { response: { status: 400, data: { error: 'PIN inválido' } } };

let logs: jest.SpyInstance[] = [];
beforeEach(() => {
  post.mockReset();
  mockOnline = true;
  logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => {
  for (const s of logs) for (const c of s.mock.calls) expect(JSON.stringify(c)).not.toMatch(/73912|11111|22222/);
  logs.forEach((s) => s.mockRestore());
});

test('toque duplo com o pedido em voo: um POST só, e o segundo volta sem chamar a rede', async () => {
  const d = deferred<any>();
  post.mockReturnValueOnce(d.promise);
  const { result } = renderHook(() => useFinalizeRide('d1'));
  let first!: Promise<any>;
  let second!: Promise<any>;
  act(() => {
    first = result.current.finalize('73912');
    second = result.current.finalize('73912');
  });
  await expect(second).resolves.toMatchObject({ ok: false, outcome: 'busy' });
  expect(result.current.status).toBe('sending');
  await act(async () => { d.resolve({ data: { success: true } }); await first; });
  await expect(first).resolves.toMatchObject({ ok: true, outcome: 'ok' });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith('/deliveries/d1/finalizar', { pin: '73912' });
  expect(result.current.status).toBe('done');
});

test('depois de confirmado, o mesmo PIN não vai de novo', async () => {
  post.mockResolvedValue({ data: { success: true } });
  const { result } = renderHook(() => useFinalizeRide('d1'));
  await act(async () => { await result.current.finalize('73912'); });
  let again: any;
  await act(async () => { again = await result.current.finalize('73912'); });
  expect(again).toMatchObject({ ok: false, outcome: 'repeated' });
  expect(post).toHaveBeenCalledTimes(1);
});

test('PIN errado: o mesmo PIN não vai de novo; PIN alterado vai', async () => {
  post.mockRejectedValueOnce(wrong).mockResolvedValueOnce({ data: { success: true } });
  const { result } = renderHook(() => useFinalizeRide('d1'));
  let r: any;
  await act(async () => { r = await result.current.finalize('11111'); });
  expect(r).toEqual({ ok: false, outcome: 'wrong', error: 'PIN inválido' });
  expect(result.current.status).toBe('wrong');
  expect(result.current.message).toBe('PIN inválido');
  expect(result.current.isRefused('11111')).toBe(true);
  expect(result.current.isRefused('22222')).toBe(false);

  await act(async () => { r = await result.current.finalize('11111'); });
  expect(r.outcome).toBe('repeated');
  expect(r.error).toBeTruthy();
  expect(post).toHaveBeenCalledTimes(1);

  await act(async () => { r = await result.current.finalize('22222'); });
  expect(r.ok).toBe(true);
  expect(post).toHaveBeenCalledTimes(2);
  expect(post).toHaveBeenLastCalledWith('/deliveries/d1/finalizar', { pin: '22222' });
});

test('429 (trava): mensagem do servidor com o tempo e o mesmo PIN pode ir de novo', async () => {
  post
    .mockRejectedValueOnce({ response: { status: 429, data: { error: 'Muitas tentativas de PIN. Tente novamente em 12 min.', code: 'PIN_LOCKED' } } })
    .mockResolvedValueOnce({ data: { success: true } });
  const { result } = renderHook(() => useFinalizeRide('d1'));
  let r: any;
  await act(async () => { r = await result.current.finalize('33333'); });
  expect(r).toMatchObject({ ok: false, outcome: 'locked', error: 'Muitas tentativas de PIN. Tente novamente em 12 min.' });
  expect(result.current.isRefused('33333')).toBe(false);
  await act(async () => { r = await result.current.finalize('33333'); });
  expect(r.ok).toBe(true);
  expect(post).toHaveBeenCalledTimes(2);
});

test('409 chama onConflict (relê a corrida) e libera reenviar', async () => {
  const onConflict = jest.fn();
  post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Already delivered' } } });
  const { result } = renderHook(() => useFinalizeRide('d1', { onConflict }));
  let r: any;
  await act(async () => { r = await result.current.finalize('44444'); });
  expect(r).toMatchObject({ ok: false, outcome: 'conflict', error: 'Already delivered' });
  expect(onConflict).toHaveBeenCalledTimes(1);
  expect(result.current.isRefused('44444')).toBe(false);
});

test('falha de rede libera reenviar o mesmo PIN', async () => {
  post.mockRejectedValueOnce(new Error('Network Error')).mockResolvedValueOnce({ data: { success: true } });
  const { result } = renderHook(() => useFinalizeRide('d1'));
  let r: any;
  await act(async () => { r = await result.current.finalize('55555'); });
  expect(r).toMatchObject({ ok: false, outcome: 'error' });
  expect(r.error).toBeTruthy();
  await act(async () => { r = await result.current.finalize('55555'); });
  expect(r.ok).toBe(true);
  expect(post).toHaveBeenCalledTimes(2);
});

test('PIN incompleto, sem corrida ou sem internet: não chama a rede', async () => {
  const { result, rerender } = renderHook(({ id }) => useFinalizeRide(id), { initialProps: { id: 'd1' as string | undefined } });
  let r: any;
  await act(async () => { r = await result.current.finalize('1234'); });
  expect(r.outcome).toBe('invalid');
  rerender({ id: undefined });
  await act(async () => { r = await result.current.finalize('12345'); });
  expect(r.outcome).toBe('invalid');
  mockOnline = false;
  rerender({ id: 'd1' });
  await act(async () => { r = await result.current.finalize('12345'); });
  expect(r.outcome).toBe('offline');
  expect(post).not.toHaveBeenCalled();
});

test('trocar de corrida esquece o PIN recusado', async () => {
  post.mockRejectedValueOnce(wrong).mockResolvedValueOnce({ data: { success: true } });
  const { result, rerender } = renderHook(({ id }) => useFinalizeRide(id), { initialProps: { id: 'd1' } });
  await act(async () => { await result.current.finalize('11111'); });
  rerender({ id: 'd2' });
  await waitFor(() => expect(result.current.isRefused('11111')).toBe(false));
  await act(async () => { await result.current.finalize('11111'); });
  expect(post).toHaveBeenLastCalledWith('/deliveries/d2/finalizar', { pin: '11111' });
});
