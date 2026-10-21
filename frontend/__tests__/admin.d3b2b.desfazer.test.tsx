/**
 * D3b-2b · P3.3 — desfazer em 10 s na fila de verificações (spec 8; Review Focus 4):
 * - aprovar e recusar ficam em espera com "Desfazer" (no aviso e no cartão);
 * - vale a última decisão do item;
 * - trocar de página ou fechar a aba dentro dos 10 s manda na hora por fetch keepalive, uma vez só;
 * - "Aprovar tudo" espera as decisões da pessoa; "Desfazer" depois do envio avisa que já foi.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import AdminVerificacoesPage from '../pages/admin/verificacoes';
import api from '../lib/api';
import { FULL, queuesGet } from './helpers/verificacoesFixtures';

const mockToast = jest.fn();
const mockHandlers: Record<string, Array<() => void>> = {};
const mockEvents = {
  on: (event: string, handler: () => void) => { mockHandlers[event] = [...(mockHandlers[event] ?? []), handler]; },
  off: (event: string, handler: () => void) => { mockHandlers[event] = (mockHandlers[event] ?? []).filter((h) => h !== handler); },
};
const emitRoute = () => (mockHandlers.routeChangeStart ?? []).forEach((h) => h());

jest.mock('next/router', () => ({
  useRouter: () => ({
    events: mockEvents, push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/verificacoes', asPath: '/admin/verificacoes',
  }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({
    user: { _id: 'me', id: 'me', name: 'Marina Rocha', role: 'ceo', activeRole: 'ceo' },
    token: null,
    loading: false,
    permissionsLoading: false,
    can: () => true,
  }),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    defaults: { baseURL: 'https://api.test/api', headers: { common: {} } },
  },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const fetchMock = jest.fn((..._args: unknown[]) => Promise.resolve({ ok: true }));

/** A ação do último aviso com esta mensagem. */
const toastAction = (message: string) => {
  const call = [...mockToast.mock.calls].reverse().find((c) => c[0] === message);
  return (call?.[2] as { action: { label: string; onClick: () => void } }).action;
};
const paulo = () => screen.findByRole('region', { name: 'Paulo Henrique' });
const card = (name: string) => within(screen.getByRole('region', { name: 'Paulo Henrique' })).getByRole('article', { name });

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  get.mockImplementation(queuesGet(FULL));
  post.mockResolvedValue({ data: {} });
  (global as unknown as { fetch: unknown }).fetch = fetchMock;
});
afterEach(() => {
  jest.useRealTimers();
  delete (global as unknown as { fetch?: unknown }).fetch;
});

it('"Desfazer" no aviso: nada sai, nem depois dos 10 s; o cartão volta ao normal', async () => {
  render(<AdminVerificacoesPage />);
  await paulo();
  fireEvent.click(within(card('CNPJ · Eletro Center')).getByRole('button', { name: 'Aprovar' }));
  expect(within(card('CNPJ · Eletro Center')).getByRole('status')).toHaveTextContent('Aprovado · envia em até 10 s');
  expect(within(card('CNPJ · Eletro Center')).getByRole('button', { name: 'Aprovar' })).toBeDisabled();
  expect(mockToast).toHaveBeenCalledWith('Aprovado', 'success', expect.objectContaining({ durationMs: 10_000 }));
  const undo = toastAction('Aprovado');
  expect(undo.label).toBe('Desfazer');
  act(() => undo.onClick());
  expect(mockToast).toHaveBeenLastCalledWith('Decisão desfeita.', 'info');
  expect(within(card('CNPJ · Eletro Center')).queryByRole('status')).toBeNull();
  expect(within(card('CNPJ · Eletro Center')).getByRole('button', { name: 'Aprovar' })).toBeEnabled();
  act(() => { jest.advanceTimersByTime(10_000); });
  expect(post).not.toHaveBeenCalled();
});

it('"Desfazer" no próprio cartão (o aviso pode ter sumido)', async () => {
  render(<AdminVerificacoesPage />);
  await paulo();
  fireEvent.click(within(card('Documento')).getByRole('button', { name: 'Aprovar' }));
  fireEvent.click(within(card('Documento')).getByRole('button', { name: 'Desfazer' }));
  act(() => { jest.advanceTimersByTime(10_000); });
  expect(post).not.toHaveBeenCalled();
});

it('duas decisões no mesmo item dentro dos 10 s: vale a última (aprovar e depois recusar)', async () => {
  render(<AdminVerificacoesPage />);
  await paulo();
  fireEvent.click(within(card('Documento')).getByRole('button', { name: 'Aprovar' }));
  act(() => { jest.advanceTimersByTime(4_000); });
  fireEvent.click(within(card('Documento')).getByRole('button', { name: 'Recusar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Recusar Paulo Henrique' });
  fireEvent.change(within(dialog).getByLabelText('Motivo · Documento'), { target: { value: 'illegible' } });
  fireEvent.click(within(dialog).getByRole('button', { name: 'Pedir reenvio de 1 item' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  expect(within(card('Documento')).getByRole('status')).toHaveTextContent('Recusado · envia em até 10 s');
  expect(mockToast).toHaveBeenCalledWith('Recusado', 'success', expect.objectContaining({ durationMs: 10_000 }));
  act(() => { jest.advanceTimersByTime(10_000); });
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  expect(post.mock.calls).toEqual([['/verification/admin/l2/reject', { reasonCode: 'illegible', resend: true }]]);
});

it('trocar de página dentro dos 10 s: manda na hora por fetch keepalive (URL do servidor, com cookie), uma vez só', async () => {
  render(<AdminVerificacoesPage />);
  await paulo();
  fireEvent.click(within(card('CNPJ · Eletro Center')).getByRole('button', { name: 'Aprovar' }));
  act(() => emitRoute());
  expect(fetchMock.mock.calls).toEqual([[
    'https://api.test/api/verification/admin/store/s1/cnpj/approve',
    { method: 'POST', keepalive: true, credentials: 'include', headers: {}, body: undefined },
  ]]);
  act(() => { jest.advanceTimersByTime(10_000); });
  expect(post).not.toHaveBeenCalled();
  act(() => emitRoute());
  expect(fetchMock).toHaveBeenCalledTimes(1);
});

it('fechar a aba dentro dos 10 s (beforeunload): a recusa sai na hora, com o corpo em JSON', async () => {
  render(<AdminVerificacoesPage />);
  await paulo();
  fireEvent.click(within(card('Documento')).getByRole('button', { name: 'Recusar' }));
  const dialog = await screen.findByRole('dialog', { name: 'Recusar Paulo Henrique' });
  fireEvent.change(within(dialog).getByLabelText('Motivo · Documento'), { target: { value: 'other' } });
  fireEvent.change(within(dialog).getByLabelText('Mensagem para a pessoa'), { target: { value: 'Documento de outra pessoa' } });
  fireEvent.click(within(dialog).getByLabelText('Pedir reenvio'));
  fireEvent.click(within(dialog).getByRole('button', { name: 'Recusar 1 item' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
  act(() => { window.dispatchEvent(new Event('beforeunload')); });
  expect(fetchMock.mock.calls).toEqual([[
    'https://api.test/api/verification/admin/l2/reject',
    {
      method: 'POST',
      keepalive: true,
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reasonCode: 'other', message: 'Documento de outra pessoa', resend: false }),
    },
  ]]);
  act(() => { jest.advanceTimersByTime(10_000); });
  expect(post).not.toHaveBeenCalled();
});

it('"Aprovar tudo" espera as decisões da pessoa', async () => {
  render(<AdminVerificacoesPage />);
  const detail = await paulo();
  fireEvent.click(within(card('Documento')).getByRole('button', { name: 'Aprovar' }));
  expect(within(detail).getByRole('button', { name: 'Aprovar tudo' })).toBeDisabled();
  expect(within(detail).getByText('Há decisão em espera nesta pessoa: desfaça ou espere o envio para aprovar tudo.')).toBeInTheDocument();
  fireEvent.click(within(card('Documento')).getByRole('button', { name: 'Desfazer' }));
  expect(within(detail).getByRole('button', { name: 'Aprovar tudo' })).toBeEnabled();
});

it('item já decidido por outra pessoa: aviso com o nome; "Desfazer" depois do envio: avisa que já foi', async () => {
  post.mockRejectedValue({ response: { status: 409, data: { error: 'x', code: 'VERIFICATION_NOT_PENDING' } } });
  render(<AdminVerificacoesPage />);
  await paulo();
  fireEvent.click(within(card('CNPJ · Eletro Center')).getByRole('button', { name: 'Aprovar' }));
  act(() => { jest.advanceTimersByTime(10_000); });
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('CNPJ · Eletro Center: já tinha sido decidido.', 'info'));
  act(() => toastAction('Aprovado').onClick());
  expect(mockToast).toHaveBeenLastCalledWith('Já foi enviado. Não dá mais para desfazer.', 'info');
});
