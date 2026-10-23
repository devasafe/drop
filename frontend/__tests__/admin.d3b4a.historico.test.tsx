import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import api from '../lib/api';
import AdminSettings from '../pages/admin/settings';

let mockQuery: Record<string, string> = {};
const mockRouter = { pathname: '/admin/settings', asPath: '/admin/settings', push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => ({ ...mockRouter, query: mockQuery }) }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: jest.fn() }) }));

const page1 = {
  items: [
    { id: '1', batchId: 'A', source: 'rules', field: 'motoboyCutPerKm', before: 1, after: 1.2, actorId: 'u1', actorName: 'Ana', actorRole: 'gerente_operacao', reason: 'reajuste', at: '2026-10-22T17:03:00.000Z' },
    { id: '2', batchId: 'A', source: 'rules', field: 'poolTimeoutMin', before: 15, after: 20, actorId: 'u1', actorName: 'Ana', actorRole: 'gerente_operacao', reason: 'reajuste', at: '2026-10-22T17:03:00.000Z' },
    { id: '3', batchId: 'B', source: 'switches', field: 'directCardEnabled', before: false, after: true, actorId: 'u2', actorName: 'Bia', actorRole: 'ceo', reason: null, at: '2026-10-21T12:00:00.000Z' },
  ],
  nextCursor: 'c1',
};
const page2 = {
  items: [
    { id: '4', batchId: 'B', source: 'switches', field: 'saasTrialDays', before: 14, after: 7, actorId: 'u2', actorName: 'Bia', actorRole: 'ceo', reason: null, at: '2026-10-21T12:00:00.000Z' },
  ],
  nextCursor: null,
};
const GERENTE = adminAuth('gerente_geral', ['settings:manage']);
const historyCalls = () => (api.get as jest.Mock).mock.calls.map((c) => c[0] as string).filter((u) => u.startsWith('/admin/rules/history'));

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = { aba: 'historico' };
  (api.get as jest.Mock).mockImplementation((url: string) => {
    if (url.startsWith('/admin/rules/history')) return Promise.resolve({ data: url.includes('cursor=c1') ? page2 : page1 });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
});

it('?aba=historico com settings:manage mostra o título e as mudanças formatadas', async () => {
  renderAdminPage(<AdminSettings />, GERENTE);
  expect(await screen.findByText('Valor por km: R$ 1,00 → R$ 1,20')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Regras e taxas · Histórico' })).toBeInTheDocument();
  expect(screen.getByText('Prazo para achar motoboy: 15 min → 20 min')).toBeInTheDocument();
  expect(screen.getByText('Cartão no modo direto: Desligado → Ligado')).toBeInTheDocument();
});

it('o lote A é um grupo só, com o motivo uma vez e a data de São Paulo', async () => {
  renderAdminPage(<AdminSettings />, GERENTE);
  const group = await screen.findByRole('group', { name: /Ana/ });
  expect(within(group).getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getAllByText('reajuste')).toHaveLength(1);
  expect(group).toHaveAccessibleName(expect.stringContaining('22/10 14:03'));
  expect(within(group).getByText('22/10 14:03')).toBeInTheDocument();
});

it('filtro Campo refaz o GET com field', async () => {
  renderAdminPage(<AdminSettings />, GERENTE);
  await screen.findByText('Valor por km: R$ 1,00 → R$ 1,20');
  fireEvent.change(screen.getByLabelText('Campo'), { target: { value: 'motoboyCutPerKm' } });
  await waitFor(() => expect(historyCalls().some((u) => u.includes('field=motoboyCutPerKm'))).toBe(true));
});

it('Carregar mais usa o cursor e o lote B continua no mesmo grupo', async () => {
  renderAdminPage(<AdminSettings />, GERENTE);
  await screen.findByText('Valor por km: R$ 1,00 → R$ 1,20');
  fireEvent.click(screen.getByRole('button', { name: 'Carregar mais' }));
  await waitFor(() => expect(historyCalls().some((u) => u.includes('cursor=c1'))).toBe(true));
  expect(await screen.findByText('Dias de teste: 14 dias → 7 dias')).toBeInTheDocument();
  const group = screen.getByRole('group', { name: /Bia/ });
  expect(within(group).getAllByRole('listitem')).toHaveLength(2);
  expect(screen.getAllByRole('group')).toHaveLength(2);
});

it('erro no GET mostra a mensagem e Tentar de novo', async () => {
  (api.get as jest.Mock).mockRejectedValueOnce({ response: { status: 500, data: { error: 'Falhou no servidor' } } });
  renderAdminPage(<AdminSettings />, GERENTE);
  expect(await screen.findByText(/Falhou no servidor/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByText('Valor por km: R$ 1,00 → R$ 1,20')).toBeInTheDocument();
});

it('lista vazia mostra a mensagem', async () => {
  (api.get as jest.Mock).mockResolvedValue({ data: { items: [], nextCursor: null } });
  renderAdminPage(<AdminSettings />, GERENTE);
  expect(await screen.findByText('Nenhuma mudança de regra registrada ainda.')).toBeInTheDocument();
});

it('período invertido mostra o aviso', async () => {
  renderAdminPage(<AdminSettings />, GERENTE);
  await screen.findByText('Valor por km: R$ 1,00 → R$ 1,20');
  fireEvent.change(screen.getByLabelText('De'), { target: { value: '2026-10-10' } });
  fireEvent.change(screen.getByLabelText('Até'), { target: { value: '2026-10-01' } });
  expect(await screen.findByText('A data inicial tem que ser antes da final.')).toBeInTheDocument();
});
