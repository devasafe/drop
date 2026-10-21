/**
 * D3b-2b · P3.3 — useDeferredDecisions:
 * - a decisão espera 10 s; a última da mesma chave vence; desfazer cancela;
 * - sair da página (troca de rota, aba fechada, tela desmontada) manda na hora por fetch keepalive, com a URL e o
 *   header de auth do `api`, uma vez só;
 * - pedido em voo quando a aba fecha vai de novo por keepalive (na troca de rota, não).
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import api from '../lib/api';
import { DEFER_MS, sendKeepalive, useDeferredDecisions } from '../lib/useDeferredDecisions';

const mockHandlers: Record<string, Array<() => void>> = {};
const mockEvents = {
  on: (event: string, handler: () => void) => { mockHandlers[event] = [...(mockHandlers[event] ?? []), handler]; },
  off: (event: string, handler: () => void) => { mockHandlers[event] = (mockHandlers[event] ?? []).filter((h) => h !== handler); },
};
const emitRoute = () => (mockHandlers.routeChangeStart ?? []).forEach((h) => h());

jest.mock('next/router', () => ({
  useRouter: () => ({ events: mockEvents, push: jest.fn(), query: {}, pathname: '/admin/verificacoes' }),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    defaults: { baseURL: 'https://api.test/api', headers: { common: { Authorization: 'Bearer abc' } } },
  },
}));

const post = api.post as jest.Mock;
const fetchMock = jest.fn((..._args: unknown[]) => Promise.resolve({ ok: true }));
const APPROVE = { url: '/verification/admin/l2/approve' };
const REJECT = { url: '/verification/admin/l2/reject', body: { reasonCode: 'illegible', resend: true } };
const keepalive = (url: string, body?: unknown) => [
  `https://api.test/api${url}`,
  {
    method: 'POST',
    keepalive: true,
    credentials: 'include',
    headers: body === undefined
      ? { Authorization: 'Bearer abc' }
      : { 'Content-Type': 'application/json', Authorization: 'Bearer abc' },
    body: body === undefined ? undefined : JSON.stringify(body),
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  post.mockResolvedValue({ data: {} });
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
  Object.keys(mockHandlers).forEach((k) => { delete mockHandlers[k]; });
});
afterEach(() => {
  jest.useRealTimers();
  delete (global as unknown as { fetch?: unknown }).fetch;
});

it('envia aos 10 s, nem antes; aprovar vai sem corpo; avisa o resultado e limpa a espera', async () => {
  const onSettled = jest.fn();
  const { result } = renderHook(() => useDeferredDecisions(onSettled));
  act(() => result.current.schedule('document:l2', APPROVE, 'Aprovado'));
  expect(result.current.pending).toEqual({ 'document:l2': 'Aprovado' });
  act(() => { jest.advanceTimersByTime(DEFER_MS - 1); });
  expect(post).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(1); });
  expect(post.mock.calls).toEqual([['/verification/admin/l2/approve']]);
  await waitFor(() => expect(onSettled).toHaveBeenCalledWith({ key: 'document:l2', label: 'Aprovado', ok: true }));
  expect(result.current.pending).toEqual({});
  expect(DEFER_MS).toBe(10_000);
});

it('duas decisões na mesma chave: só a última vai, uma vez, e o relógio recomeça', () => {
  const { result } = renderHook(() => useDeferredDecisions());
  act(() => result.current.schedule('document:l2', APPROVE, 'Aprovado'));
  act(() => { jest.advanceTimersByTime(5_000); });
  act(() => result.current.schedule('document:l2', REJECT, 'Recusado'));
  expect(result.current.pending).toEqual({ 'document:l2': 'Recusado' });
  act(() => { jest.advanceTimersByTime(5_000); });
  expect(post).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(5_000); });
  expect(post.mock.calls).toEqual([[REJECT.url, REJECT.body]]);
});

it('desfazer: nada vai; desfazer de novo, ou depois do envio, devolve false', () => {
  const { result } = renderHook(() => useDeferredDecisions());
  act(() => result.current.schedule('document:l2', APPROVE, 'Aprovado'));
  let undone = false;
  act(() => { undone = result.current.undo('document:l2'); });
  expect(undone).toBe(true);
  expect(result.current.pending).toEqual({});
  expect(result.current.undo('document:l2')).toBe(false);
  act(() => { jest.advanceTimersByTime(DEFER_MS); });
  expect(post).not.toHaveBeenCalled();
  act(() => result.current.schedule('facial:l2', APPROVE, 'Aprovado'));
  act(() => { jest.advanceTimersByTime(DEFER_MS); });
  expect(result.current.undo('facial:l2')).toBe(false);
});

it('erro no envio: avisa com ok false e o erro', async () => {
  const err = { response: { status: 500 } };
  post.mockRejectedValueOnce(err);
  const onSettled = jest.fn();
  const { result } = renderHook(() => useDeferredDecisions(onSettled));
  act(() => result.current.schedule('cnpj:s1', REJECT, 'Recusado'));
  act(() => { jest.advanceTimersByTime(DEFER_MS); });
  await waitFor(() => expect(onSettled).toHaveBeenCalledWith({ key: 'cnpj:s1', label: 'Recusado', ok: false, error: err }));
});

it('fechar a aba (beforeunload): manda na hora por keepalive, com a URL do servidor e o header de auth; nunca duas vezes', () => {
  const { result } = renderHook(() => useDeferredDecisions());
  act(() => result.current.schedule('document:l2', REJECT, 'Recusado'));
  act(() => { window.dispatchEvent(new Event('beforeunload')); });
  expect(fetchMock.mock.calls).toEqual([keepalive(REJECT.url, REJECT.body)]);
  expect(result.current.pending).toEqual({});
  act(() => { jest.advanceTimersByTime(DEFER_MS); });
  expect(post).not.toHaveBeenCalled();
  act(() => { window.dispatchEvent(new Event('beforeunload')); });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('trocar de rota (routeChangeStart): idem; a aprovação vai sem corpo e sem Content-Type', () => {
  const { result } = renderHook(() => useDeferredDecisions());
  act(() => result.current.schedule('document:l2', APPROVE, 'Aprovado'));
  act(() => emitRoute());
  expect(fetchMock.mock.calls).toEqual([keepalive(APPROVE.url)]);
  act(() => { jest.advanceTimersByTime(DEFER_MS); });
  expect(post).not.toHaveBeenCalled();
});

it('desmontar a tela também manda o que espera, na ordem, uma vez; e solta os ouvintes', () => {
  const { result, unmount } = renderHook(() => useDeferredDecisions());
  act(() => result.current.schedule('document:l2', APPROVE, 'Aprovado'));
  act(() => result.current.schedule('cnpj:s1', REJECT, 'Recusado'));
  unmount();
  expect(fetchMock.mock.calls).toEqual([keepalive(APPROVE.url), keepalive(REJECT.url, REJECT.body)]);
  expect(mockHandlers.routeChangeStart ?? []).toEqual([]);
  act(() => { window.dispatchEvent(new Event('beforeunload')); });
  act(() => { jest.advanceTimersByTime(DEFER_MS); });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(post).not.toHaveBeenCalled();
});

it('pedido em voo quando a aba fecha: vai de novo por keepalive (o servidor responde 409 se o primeiro chegou); na troca de rota, não', () => {
  post.mockImplementation(() => new Promise(() => {}));
  const { result } = renderHook(() => useDeferredDecisions());
  act(() => result.current.schedule('document:l2', APPROVE, 'Aprovado'));
  act(() => { jest.advanceTimersByTime(DEFER_MS); });
  expect(post).toHaveBeenCalledTimes(1);
  act(() => emitRoute());
  expect(fetchMock).not.toHaveBeenCalled();
  act(() => { window.dispatchEvent(new Event('beforeunload')); });
  expect(fetchMock.mock.calls).toEqual([keepalive(APPROVE.url)]);
  act(() => { window.dispatchEvent(new Event('beforeunload')); });
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('sendKeepalive sem fetch no ambiente: não quebra', () => {
  delete (global as unknown as { fetch?: unknown }).fetch;
  expect(() => sendKeepalive(APPROVE)).not.toThrow();
});

describe('correção 1', () => {
  it('pagehide e depois beforeunload: um único keepalive', () => {
    const { result } = renderHook(() => useDeferredDecisions());
    act(() => result.current.schedule('document:l2', APPROVE, 'Aprovado'));
    act(() => { window.dispatchEvent(new Event('pagehide')); });
    act(() => { window.dispatchEvent(new Event('beforeunload')); });
    expect(fetchMock.mock.calls).toEqual([keepalive(APPROVE.url)]);
  });

  it('routeChangeStart e depois beforeunload: um único keepalive', () => {
    const { result } = renderHook(() => useDeferredDecisions());
    act(() => result.current.schedule('document:l2', REJECT, 'Recusado'));
    act(() => emitRoute());
    act(() => { window.dispatchEvent(new Event('beforeunload')); });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('troca de rota com fetch 500: avisa por onLostError; com 409, não', async () => {
    const lost = jest.fn();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 500 } as never);
    const { result } = renderHook(() => useDeferredDecisions(undefined, lost));
    act(() => result.current.schedule('document:l2', REJECT, 'Recusado'));
    act(() => emitRoute());
    await waitFor(() => expect(lost).toHaveBeenCalledWith({ key: 'document:l2', label: 'Recusado' }));

    lost.mockClear();
    fetchMock.mockResolvedValueOnce({ ok: false, status: 409 } as never);
    act(() => result.current.schedule('facial:l2', APPROVE, 'Aprovado'));
    act(() => emitRoute());
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(lost).not.toHaveBeenCalled();
  });

  it('keepalive com falha de rede: avisa', async () => {
    const lost = jest.fn();
    fetchMock.mockRejectedValueOnce(new Error('net'));
    const { result } = renderHook(() => useDeferredDecisions(undefined, lost));
    act(() => result.current.schedule('document:l2', APPROVE, 'Aprovado'));
    act(() => emitRoute());
    await waitFor(() => expect(lost).toHaveBeenCalledTimes(1));
  });

  it('desmontar com o post em voo: não reenvia, não chama onSettled, mas o erro chega por onLostError (409 não)', async () => {
    let fail!: (e: unknown) => void;
    post.mockImplementationOnce(() => new Promise((_, rej) => { fail = rej; }));
    const settled = jest.fn();
    const lost = jest.fn();
    const { result, unmount } = renderHook(() => useDeferredDecisions(settled, lost));
    act(() => result.current.schedule('document:l2', APPROVE, 'Aprovado'));
    act(() => { jest.advanceTimersByTime(DEFER_MS); });
    unmount();
    expect(fetchMock).not.toHaveBeenCalled();
    await act(async () => { fail({ response: { status: 500 } }); });
    expect(settled).not.toHaveBeenCalled();
    expect(lost).toHaveBeenCalledWith({ key: 'document:l2', label: 'Aprovado' });

    lost.mockClear();
    let fail409!: (e: unknown) => void;
    post.mockImplementationOnce(() => new Promise((_, rej) => { fail409 = rej; }));
    const second = renderHook(() => useDeferredDecisions(settled, lost));
    act(() => second.result.current.schedule('facial:l2', APPROVE, 'Aprovado'));
    act(() => { jest.advanceTimersByTime(DEFER_MS); });
    second.unmount();
    await act(async () => { fail409({ response: { status: 409, data: { code: 'VERIFICATION_NOT_PENDING' } } }); });
    expect(lost).not.toHaveBeenCalled();
  });

  it('em voo a chave continua ocupada (pending e sending) até a resposta', async () => {
    let done!: (v: unknown) => void;
    post.mockImplementationOnce(() => new Promise((res) => { done = res; }));
    const { result } = renderHook(() => useDeferredDecisions());
    act(() => result.current.schedule('document:l2', APPROVE, 'Aprovado'));
    act(() => { jest.advanceTimersByTime(DEFER_MS); });
    expect(result.current.pending).toEqual({ 'document:l2': 'Aprovado' });
    expect(result.current.sending).toEqual({ 'document:l2': 'Aprovado' });
    expect(result.current.undo('document:l2')).toBe(false);
    await act(async () => { done({ data: {} }); });
    expect(result.current.pending).toEqual({});
    expect(result.current.sending).toEqual({});
  });
});
