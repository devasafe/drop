import fs from 'fs';
import path from 'path';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { adminAuth, renderAdminPage } from './helpers/adminPage';
import { resetViewport, setViewportWidth } from './helpers/viewport';
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
let mockActive = 'none';
const mockSetTheme = jest.fn();
jest.mock('../contexts/SeasonalThemeContext', () => ({ useSeasonalTheme: () => ({ theme: mockActive, setTheme: mockSetTheme }) }));

beforeEach(() => {
  jest.clearAllMocks();
  resetViewport();
  mockActive = 'none';
  (api.put as jest.Mock).mockResolvedValue({ data: { config: {}, message: 'ok' } });
});

it('cinco opções em radio, com o ativo marcado e o título da tela', () => {
  mockActive = 'junina';
  renderAdminPage(<SeasonalThemePage />);
  expect(screen.getByRole('heading', { name: 'Tema sazonal' })).toBeInTheDocument();
  expect(screen.getAllByRole('radio')).toHaveLength(5);
  expect(screen.getByRole('radio', { name: /^Festa junina/ })).toBeChecked();
  expect(screen.getByText(/Atual:/)).toHaveTextContent('Atual: Festa junina');
});

it('a prévia acompanha a escolha antes de aplicar (classe do próprio tema)', () => {
  renderAdminPage(<SeasonalThemePage />);
  const preview = screen.getByTestId('seasonal-preview');
  expect(preview.className).toContain('seasonal-preview');
  expect(preview.className).toContain('theme-none');
  fireEvent.click(screen.getByRole('radio', { name: /^Halloween/ }));
  expect(screen.getByTestId('seasonal-preview').className).toContain('theme-halloween');
  expect(screen.getByRole('region', { name: 'Prévia · Halloween' })).toBeInTheDocument();
  expect(api.put).not.toHaveBeenCalled();
});

it('botão desabilitado quando o escolhido já é o ativo; rótulo diz o que vai acontecer', () => {
  mockActive = 'natal';
  renderAdminPage(<SeasonalThemePage />);
  expect(screen.getByRole('button', { name: 'Aplicar Natal agora' })).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: /^Nenhum/ }));
  expect(screen.getByRole('button', { name: 'Voltar ao padrão' })).toBeEnabled();
});

it('aplicar: toast de sucesso', async () => {
  renderAdminPage(<SeasonalThemePage />);
  fireEvent.click(screen.getByRole('radio', { name: /^Páscoa/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar Páscoa agora' }));
  await waitFor(() => expect(mockToast).toHaveBeenCalledWith('Tema Páscoa aplicado', 'success'));
  expect(mockSetTheme).toHaveBeenCalledWith('pascoa');
});

it('403 do servidor: "Você não tem permissão para isso", tema não muda', async () => {
  (api.put as jest.Mock).mockRejectedValue({ response: { status: 403, data: { error: 'Permissão negada' } } });
  renderAdminPage(<SeasonalThemePage />, adminAuth('marketing', ['theme:edit']));
  fireEvent.click(screen.getByRole('radio', { name: /^Natal/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Aplicar Natal agora' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Você não tem permissão para isso');
  expect(mockSetTheme).not.toHaveBeenCalled();
});

it('portão: sem theme:edit sai da tela', async () => {
  renderAdminPage(<SeasonalThemePage />, adminAuth('gerente_geral', ['dashboard:view_all']));
  await waitFor(() => expect(mockRouter.push).toHaveBeenCalled());
  expect(screen.queryByRole('radio')).toBeNull();
});

it('celular: opções, prévia e botão continuam lá', () => {
  setViewportWidth(360);
  renderAdminPage(<SeasonalThemePage />);
  expect(screen.getAllByRole('radio')).toHaveLength(5);
  expect(screen.getByTestId('seasonal-preview')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Aplicar|Voltar ao padrão/ })).toBeInTheDocument();
});

it('globals.css: cada tema também vale na prévia, e o "Nenhum" volta ao roxo do DS', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'styles', 'globals.css'), 'utf8');
  for (const t of ['natal', 'pascoa', 'junina', 'halloween']) {
    expect(css).toMatch(new RegExp(`body\\.theme-${t},\\s*\\n\\s*\\.seasonal-preview\\.theme-${t}\\s*\\{`));
  }
  expect(css).toMatch(/\.seasonal-preview\.theme-none\s*\{[^}]*--color-action-primary:\s*var\(--purple-600\)/);
});
