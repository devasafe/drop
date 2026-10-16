import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import { resetViewport, setViewportWidth } from './helpers/viewport';
import api from '../lib/api';
import FreiosPage from '../pages/admin/freios';

const mockRouter = { pathname: '/admin/freios', asPath: '/admin/freios', query: {}, push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));

const SW = {
  rankingPrizesEnabled: false, benefitsRedeemEnabled: true, gamificationPointsEnabled: false,
  settlementMode: 'direto', saasMonthlyFee: 49.9, saasTrialDays: 14, saasGraceDays: 5, directTransfersEnabled: false,
};
const GERENTE = adminAuth('gerente_geral', ['settings:manage']);
const card = (title: string) => screen.getByRole('article', { name: title });

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  (api.get as jest.Mock).mockResolvedValue({ data: SW });
  (api.put as jest.Mock).mockImplementation((_url: string, body: Record<string, unknown>) => Promise.resolve({ data: { ...SW, ...body } }));
});

it('um cartão por freio, com situação, custo e título da tela', async () => {
  renderAdminPage(<FreiosPage />, GERENTE);
  expect(screen.getByRole('heading', { name: 'Freios' })).toBeInTheDocument();
  const prizes = await screen.findByRole('article', { name: 'Prêmios do ranking' });
  expect(within(prizes).getByText('Pausado')).toBeInTheDocument();
  expect(within(prizes).getByText(/R\$ 500 \/ 300 \/ 150 por mês/)).toBeInTheDocument();
  expect(within(card('Resgate de benefícios')).getByText('Ativo')).toBeInTheDocument();
  expect(card('Gamificação (pontos)')).toBeInTheDocument();
});

it('confirmação no próprio cartão: o primeiro clique não envia; Cancelar fecha', async () => {
  renderAdminPage(<FreiosPage />, GERENTE);
  const prizes = await screen.findByRole('article', { name: 'Prêmios do ranking' });
  fireEvent.click(within(prizes).getByRole('button', { name: 'Ativar' }));
  expect(api.put).not.toHaveBeenCalled();
  expect(within(prizes).getByText(/^Se ativar:/)).toBeInTheDocument();
  fireEvent.click(within(prizes).getByRole('button', { name: 'Cancelar' }));
  expect(within(prizes).queryByRole('button', { name: 'Confirmar' })).toBeNull();
  expect(api.put).not.toHaveBeenCalled();
});

it('Confirmar envia e o cartão mostra a situação nova', async () => {
  renderAdminPage(<FreiosPage />, GERENTE);
  const prizes = await screen.findByRole('article', { name: 'Prêmios do ranking' });
  fireEvent.click(within(prizes).getByRole('button', { name: 'Ativar' }));
  fireEvent.click(within(prizes).getByRole('button', { name: 'Confirmar' }));
  await waitFor(() => expect(within(prizes).getByText('Ativo')).toBeInTheDocument());
  expect(api.put).toHaveBeenCalledWith('/admin/switches', { rankingPrizesEnabled: true });
  expect(within(prizes).getByRole('button', { name: 'Pausar' })).toBeInTheDocument();
});

it('erro ao salvar: mensagem no cartão e a situação não muda', async () => {
  (api.put as jest.Mock).mockRejectedValue({ response: { status: 403, data: { error: 'Sem permissão' } } });
  renderAdminPage(<FreiosPage />, GERENTE);
  const benefits = await screen.findByRole('article', { name: 'Resgate de benefícios' });
  fireEvent.click(within(benefits).getByRole('button', { name: 'Pausar' }));
  fireEvent.click(within(benefits).getByRole('button', { name: 'Confirmar' }));
  expect(await within(benefits).findByRole('alert')).toHaveTextContent('Você não tem permissão para isso');
  expect(within(benefits).getByText('Ativo')).toBeInTheDocument();
});

it('leitura falhou: erro com "Tentar de novo", sem cartões', async () => {
  (api.get as jest.Mock).mockRejectedValueOnce({ response: { status: 500, data: { error: 'Erro ao ler os freios' } } });
  renderAdminPage(<FreiosPage />, GERENTE);
  expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao ler os freios');
  expect(screen.queryByRole('article')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByRole('article', { name: 'Prêmios do ranking' })).toBeInTheDocument();
});

it('quem não é CEO não vê o modo da plataforma nem a mensalidade', async () => {
  renderAdminPage(<FreiosPage />, GERENTE);
  await screen.findByRole('article', { name: 'Prêmios do ranking' });
  expect(screen.queryByRole('region', { name: 'Modo da plataforma' })).toBeNull();
  expect(screen.queryByRole('region', { name: 'Mensalidade SaaS' })).toBeNull();
});

it('CEO vê o modo da plataforma e a mensalidade (até a P2.4 levá-los para Regras e taxas)', async () => {
  renderAdminPage(<FreiosPage />);
  expect(await screen.findByRole('region', { name: 'Modo da plataforma' })).toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'Mensalidade SaaS' })).toBeInTheDocument();
});

it('portão: sem settings:manage sai da tela e nada é lido', async () => {
  renderAdminPage(<FreiosPage />, adminAuth('marketing', ['theme:edit']));
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
  expect(api.get).not.toHaveBeenCalled();
});

it('celular: cartões e confirmação continuam acessíveis', async () => {
  setViewportWidth(360);
  renderAdminPage(<FreiosPage />, GERENTE);
  const g = await screen.findByRole('article', { name: 'Gamificação (pontos)' });
  fireEvent.click(within(g).getByRole('button', { name: 'Ativar' }));
  expect(within(g).getByRole('button', { name: 'Confirmar' })).toBeInTheDocument();
});
