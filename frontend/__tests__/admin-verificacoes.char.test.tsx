/**
 * D3a · P3.2 · caracterização de /admin/verificacoes: as três filas lidas e o "Aprovar" de cada tipo de item
 * (POST sem corpo). Escrito contra a página antiga e mantido SEM mudança na nova.
 * A recusa muda de propósito (prompt → AdminSheet; D3b-2b: motivo padronizado) e é coberta em admin-verificacoes.test.tsx. D3b-2b: a tela também lê a média de espera; aqui contam só as filas.
 * D3b-2b · P3.3: o "Aprovar" espera 10 s (desfazer) antes do POST; o POST continua o mesmo.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import AdminVerificacoesPage from '../pages/admin/verificacoes';
import api from '../lib/api';
import { CLIENTE, LOJA, MOTOBOY, PAULO_FACIAL, queueCalls, queuesGet, type QueueFixture } from './helpers/verificacoesFixtures';

const mockMe = { _id: 'me', id: 'me', name: 'Marina Rocha', role: 'ceo', activeRole: 'ceo' };

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/admin/verificacoes', asPath: '/admin/verificacoes' }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: mockMe, token: null, loading: false, permissionsLoading: false, can: () => true }),
}));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

beforeEach(() => {
  jest.clearAllMocks();
  (api.post as jest.Mock).mockResolvedValue({ data: {} });
});
afterEach(() => jest.useRealTimers());

test('CEO: lê as três filas', async () => {
  (api.get as jest.Mock).mockImplementation(queuesGet({}));
  render(<AdminVerificacoesPage />);
  await waitFor(() => expect(queueCalls(api.get as jest.Mock)).toHaveLength(3));
  expect(queueCalls(api.get as jest.Mock).sort()).toEqual([
    '/verification/admin/motoboy-pending',
    '/verification/admin/pending',
    '/verification/admin/store-pending',
  ]);
});

const CNPJ_ONLY = { ...LOJA, verification: { cnpj: LOJA.verification.cnpj } };
const ADDRESS_ONLY = { ...LOJA, verification: { address: LOJA.verification.address } };
const COURIER_ONLY = { ...MOTOBOY, verification: { courier: MOTOBOY.verification.courier } };

const CASES: [string, string, QueueFixture][] = [
  ['documento do cliente', '/verification/admin/c1/approve', { pending: [CLIENTE] }],
  ['selfie do lojista', '/verification/admin/facial/l2/approve', { facial: [PAULO_FACIAL] }],
  ['CNPJ da loja', '/verification/admin/store/s1/cnpj/approve', { stores: [CNPJ_ONLY] }],
  ['endereço da loja', '/verification/admin/store/s1/address/approve', { stores: [ADDRESS_ONLY] }],
  ['CNH e placa do motoboy', '/verification/admin/motoboy/m1/approve', { motoboys: [COURIER_ONLY] }],
];

test.each(CASES)('aprovar %s: depois dos 10 s para desfazer, POST %s sem corpo', async (_nome, url, fila) => {
  jest.useFakeTimers();
  (api.get as jest.Mock).mockImplementation(queuesGet(fila));
  render(<AdminVerificacoesPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Aprovar' }));
  expect(api.post).not.toHaveBeenCalled();
  act(() => { jest.advanceTimersByTime(10_000); });
  await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
  expect((api.post as jest.Mock).mock.calls[0]).toEqual([url]);
});
