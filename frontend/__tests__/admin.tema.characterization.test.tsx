/** Caracterização de /admin/seasonal-theme: PUT com { seasonalTheme } e setTheme só no sucesso. */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { renderAdminPage, stubNativeDialogs } from './helpers/adminPage';
import api from '../lib/api';
import SeasonalThemePage from '../pages/admin/seasonal-theme';

const mockRouter = { pathname: '/admin/seasonal-theme', asPath: '/admin/seasonal-theme', query: {}, push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));
const mockSetTheme = jest.fn();
jest.mock('../contexts/SeasonalThemeContext', () => ({ useSeasonalTheme: () => ({ theme: 'none', setTheme: mockSetTheme }) }));

/** Antiga: cartão-botão com o nome. Nova: radio com o nome. */
function choose(name: RegExp) {
  const radio = screen.queryByRole('radio', { name });
  fireEvent.click(radio ?? screen.getByRole('button', { name }));
}

beforeEach(() => {
  jest.clearAllMocks();
  stubNativeDialogs();
});

it('aplica: PUT /settings/platform-config com o tema e setTheme depois do sucesso', async () => {
  (api.put as jest.Mock).mockResolvedValue({ data: { config: {}, message: 'ok' } });
  renderAdminPage(<SeasonalThemePage />);
  choose(/^Natal/);
  fireEvent.click(screen.getByRole('button', { name: /^Aplicar/ }));
  await waitFor(() => expect(mockSetTheme).toHaveBeenCalledWith('natal'));
  expect(api.put).toHaveBeenCalledTimes(1);
  expect(api.put).toHaveBeenCalledWith('/settings/platform-config', { seasonalTheme: 'natal' });
});

it('erro: não chama setTheme e mostra a mensagem do servidor', async () => {
  (api.put as jest.Mock).mockRejectedValue({ response: { status: 400, data: { error: 'Tema inválido' } } });
  renderAdminPage(<SeasonalThemePage />);
  choose(/^Halloween/);
  fireEvent.click(screen.getByRole('button', { name: /^Aplicar/ }));
  expect(await screen.findByText('Tema inválido')).toBeInTheDocument();
  expect(mockSetTheme).not.toHaveBeenCalled();
});
