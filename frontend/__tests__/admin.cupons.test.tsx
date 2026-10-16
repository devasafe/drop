import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import { resetViewport, setViewportWidth } from './helpers/viewport';
import api from '../lib/api';
import AdminCoupons from '../pages/admin/coupons';

const mockRouter = { pathname: '/admin/coupons', asPath: '/admin/coupons', query: {}, push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const FUTURE = '2099-12-31T00:00:00.000Z';
const COUPONS = [
  { _id: 'c1', code: 'SEMANATECH', type: 'global', discountType: 'percent', discountValue: 15, minOrderValue: 100, maxUses: 500, usedCount: 214, validFrom: '2026-10-01T00:00:00.000Z', validUntil: FUTURE, isActive: true },
  { _id: 'c2', code: 'PETAMIGO', type: 'store', discountType: 'fixed', discountValue: 10, minOrderValue: 60, maxUses: 100, usedCount: 41, validFrom: '2026-10-01T00:00:00.000Z', validUntil: FUTURE, isActive: false },
  { _id: 'c3', code: 'VOLTAAULAS', type: 'global', discountType: 'percent', discountValue: 10, maxUses: 500, usedCount: 500, validFrom: '2026-01-01T00:00:00.000Z', validUntil: FUTURE, isActive: true },
];

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  (api.get as jest.Mock).mockResolvedValue({ data: COUPONS });
  (api.post as jest.Mock).mockResolvedValue({ data: {} });
  (api.put as jest.Mock).mockResolvedValue({ data: {} });
});

it('só o CEO abre (como hoje): outro papel, mesmo com "*", sai e nada é lido', async () => {
  renderAdminPage(<AdminCoupons />, adminAuth('gerente_geral', ['*']));
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
  expect(api.get).not.toHaveBeenCalled();
});

it('título, números da lista e situação de cada cupom', async () => {
  renderAdminPage(<AdminCoupons />);
  expect(screen.getByRole('heading', { name: 'Avisos e broadcasts · Cupons' })).toBeInTheDocument();
  const table = await screen.findByRole('table', { name: 'Cupons' });
  expect(screen.getByText('Cupons ativos').parentElement).toHaveTextContent('2');
  expect(screen.getByText('Usos registrados').parentElement).toHaveTextContent('755');
  const row = (code: string) => within(table).getByText(code).closest('tr') as HTMLElement;
  expect(row('SEMANATECH')).toHaveTextContent('Ativo');
  expect(row('PETAMIGO')).toHaveTextContent('Pausado');
  expect(row('VOLTAAULAS')).toHaveTextContent('Esgotado');
  expect(row('SEMANATECH')).toHaveTextContent('214 / 500');
});

it('excluir vira pausar: não há Excluir nem DELETE; pausar usa o toggle', async () => {
  renderAdminPage(<AdminCoupons />);
  await screen.findByRole('table', { name: 'Cupons' });
  expect(screen.queryByRole('button', { name: /Excluir/ })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Pausar SEMANATECH' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/coupons/c1/toggle'));
  expect(api.delete).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Ativar PETAMIGO' })).toBeInTheDocument();
});

it('erro ao pausar vira toast', async () => {
  (api.put as jest.Mock).mockRejectedValue({ response: { status: 403, data: { error: 'Sem permissão' } } });
  renderAdminPage(<AdminCoupons />);
  fireEvent.click(await screen.findByRole('button', { name: 'Pausar SEMANATECH' }));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Você não tem permissão para isso', 'error'));
});

it('custo máximo na tela acompanha o formulário', async () => {
  renderAdminPage(<AdminCoupons />);
  await screen.findByRole('table', { name: 'Cupons' });
  fireEvent.change(screen.getByLabelText('Pedido mínimo (R$)'), { target: { value: '80' } });
  fireEvent.change(screen.getByLabelText('Limite de usos'), { target: { value: '1000' } });
  expect(screen.getByText('Cada uso custa 10% do pedido')).toBeInTheDocument();
  expect(screen.getByText(/1000 usos nesse valor somam R\$ 8\.000,00/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Tipo de desconto'), { target: { value: 'fixed' } });
  expect(screen.getByText('Custo máximo: R$ 10.000,00')).toBeInTheDocument();
});

it('criar: erro do servidor dentro do formulário; sucesso em toast e lista relida', async () => {
  (api.post as jest.Mock).mockRejectedValueOnce({ response: { status: 400, data: { error: 'Código já existe' } } });
  renderAdminPage(<AdminCoupons />);
  await screen.findByRole('table', { name: 'Cupons' });
  fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'semanatech' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));
  const form = screen.getByRole('form', { name: 'Novo cupom global' });
  expect(await within(form).findByRole('alert')).toHaveTextContent('Código já existe');

  fireEvent.change(screen.getByLabelText('Código'), { target: { value: 'novo5' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Cupom NOVO5 criado', 'success'));
  expect((screen.getByLabelText('Código') as HTMLInputElement).value).toBe('');
  expect(api.get).toHaveBeenCalledTimes(2);
});

it('sem código: aviso na tela e nada é enviado', async () => {
  renderAdminPage(<AdminCoupons />);
  await screen.findByRole('table', { name: 'Cupons' });
  fireEvent.click(screen.getByRole('button', { name: 'Criar cupom' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Preencha o código do cupom.');
  expect(api.post).not.toHaveBeenCalled();
});

it('não oferece "Loja específica" (sem campo de loja, o servidor recusa)', async () => {
  renderAdminPage(<AdminCoupons />);
  await screen.findByRole('table', { name: 'Cupons' });
  expect(screen.queryByText('Loja específica')).toBeNull();
});

it('lista ilegível: "Tentar de novo", sem números', async () => {
  (api.get as jest.Mock).mockRejectedValueOnce({ response: { status: 500, data: { error: 'Erro ao listar cupons' } } });
  renderAdminPage(<AdminCoupons />);
  expect(await screen.findByText('Erro ao listar cupons')).toBeInTheDocument();
  expect(screen.queryByText('Cupons ativos')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByRole('table', { name: 'Cupons' })).toBeInTheDocument();
});

it('celular: a lista vira cartões e a ação continua', async () => {
  setViewportWidth(360);
  renderAdminPage(<AdminCoupons />);
  expect(await screen.findByRole('list', { name: 'Cupons' })).toBeInTheDocument();
  expect(screen.queryByRole('table')).toBeNull();
  expect(screen.getByRole('button', { name: 'Pausar SEMANATECH' })).toBeInTheDocument();
});
