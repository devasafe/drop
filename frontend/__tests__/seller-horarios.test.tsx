import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/ui/Toast';
import SellerHorarios from '../pages/seller/horarios';
import api from '../lib/api';

const mockPush = jest.fn();
const mockRefresh = jest.fn();
let mockPanel: any;
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/seller/horarios' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({ useSellerPanel: () => mockPanel }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() } }));

const store = (over: any = {}) => ({ _id: 's1', name: 'Eletro Center', isOpen: true, operatingHours: null, pausedUntil: null, ...over });
const renderPage = () => render(<ToastProvider><SellerHorarios /></ToastProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mockPanel = { store: store(), orders: [], refresh: mockRefresh, newOrderCount: 0 };
});

test('aberta: mostra o estado e "Pausar" abre o sheet de pausa', () => {
  renderPage();
  expect(screen.getByText('Aberta agora')).toBeInTheDocument();
  fireEvent.click(screen.getByText('Pausar'));
  expect(screen.getByText('Pausar a loja')).toBeInTheDocument();
  expect(screen.getByText('Até amanhã')).toBeInTheDocument();
});

test('pausada: mostra a hora de volta e "Reabrir agora" chama o DELETE', async () => {
  const volta = new Date(Date.now() + 60 * 60 * 1000);
  const hh = String(volta.getHours()).padStart(2, '0');
  const mm = String(volta.getMinutes()).padStart(2, '0');
  mockPanel = { ...mockPanel, store: store({ pausedUntil: volta.toISOString() }) };
  (api.delete as jest.Mock).mockResolvedValue({ data: { success: true, data: { pausedUntil: null } } });
  renderPage();
  expect(screen.getByText(new RegExp(`Pausada até .*${hh}:${mm}`))).toBeInTheDocument();
  fireEvent.click(screen.getByText('Reabrir agora'));
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/stores/s1/pause'));
  await waitFor(() => expect(mockRefresh).toHaveBeenCalled());
  expect(await screen.findByText('Aberta agora')).toBeInTheDocument();
});

test('sem loja carregada: só o esqueleto, sem editor', () => {
  mockPanel = { ...mockPanel, store: null };
  renderPage();
  expect(screen.queryByText('Salvar horários')).not.toBeInTheDocument();
});