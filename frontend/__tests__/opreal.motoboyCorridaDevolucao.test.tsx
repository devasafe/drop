// Corrida de devolução no app do motoboy (DS v2, "Corrida de devolução"): buscar com o cliente
// (código de retirada que o cliente mostra) e levar à loja (código de devolução que a loja digita).
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';

const mockRouter: any = { push: jest.fn(), replace: jest.fn(), back: jest.fn(), query: { id: 'd1' }, asPath: '/motoboy/corrida/d1', pathname: '/motoboy/corrida/[id]', isReady: true };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, actions, back, bare, children }: any) => (
    <div data-shell={bare ? 'bare' : 'top'} data-back={back || ''}>{!bare && <h1>{title}</h1>}{actions}{children}</div>
  );
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'm1', _id: 'm1', name: 'Carlos Lima', role: 'motoboy' } }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn() } }));
jest.mock('../components/map/RouteThumbnail', () => ({ __esModule: true, RouteThumbnail: () => <div data-testid="mapa" />, default: () => null }));
jest.mock('../components/map/presets/MotoboyNavMap', () => ({ __esModule: true, MotoboyNavMap: () => <div data-testid="nav-map" /> }));
jest.mock('../lib/logger', () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'direto', loading: false, error: false }) }));
jest.mock('../hooks/useGamificationFeatures', () => ({ useGamificationFeatures: () => ({ features: { gamificationPointsEnabled: false, benefitsRedeemEnabled: false, rankingPrizesEnabled: false }, loading: false }) }));
const handlers: Record<string, (d: any) => void> = {};
const mockSocket = { on: (ev: string, fn: any) => { handlers[ev] = fn; return () => undefined; }, emit: jest.fn(), isConnected: true, onReconnect: () => () => undefined };
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));

import CorridaPage from '../pages/motoboy/corrida/[id]';

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
// Na devolução: store* = casa do cliente (retirada); customer* = loja (destino).
const base = {
  _id: 'd1', orderId: 'ord0000004821', kind: 'devolucao', status: 'assigned', fee: 9.9, assignedAt: new Date().toISOString(),
  storeAddress: 'R. Aurora, 112, Vila Mariana', storeLatitude: -23.54, storeLongitude: -46.64,
  customerAddress: 'R. dos Pinheiros, 870, Pinheiros', customerLatitude: -23.56, customerLongitude: -46.69,
  storeObj: { _id: 's1', name: 'Eletro Center', telefone: '1133334444' }, customerObj: { _id: 'c1', name: 'Ana Souza', telefone: '11999990000' },
  order: { _id: 'ord0000004821', storeId: 's1', customerId: 'c1', products: [{ productName: 'Fone JBL 520BT', quantity: 1 }] },
};
let current: any;
beforeAll(() => { (global.navigator as any).geolocation = { watchPosition: jest.fn(() => 1), clearWatch: jest.fn(), getCurrentPosition: jest.fn() }; });
beforeEach(() => {
  jest.clearAllMocks();
  current = { ...base };
  get.mockImplementation((url: string) => {
    if (url === '/deliveries/d1') return Promise.resolve({ data: current });
    if (url.startsWith('/chat/conversations/')) return Promise.resolve({ data: { messages: [] } });
    return Promise.resolve({ data: [] });
  });
  post.mockResolvedValue({ data: {} });
});

test('buscar com o cliente: endereço dele e o código de retirada que ele mostra', async () => {
  render(<CorridaPage />);
  expect(await screen.findByRole('heading', { name: 'Buscar com o cliente' })).toBeInTheDocument();
  expect(screen.getByText('Devolução')).toBeInTheDocument();
  expect(screen.getByText('Ana Souza')).toBeInTheDocument();
  expect(screen.getByText(/R\. Aurora, 112/)).toBeInTheDocument();
  expect(screen.getByText(/Depois, leve à Eletro Center/)).toBeInTheDocument();

  post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Código de retirada não confere', code: 'INVALID_PIN' } } });
  const input = screen.getByLabelText('Código de retirada (peça ao cliente)');
  fireEvent.change(input, { target: { value: '12345' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar retirada' }));
  expect(await screen.findByText('Código não confere. Peça de novo ao cliente.')).toBeInTheDocument();

  current = { ...base, status: 'picked', pickedAt: new Date().toISOString(), returnPin: '63150' };
  post.mockResolvedValueOnce({ data: { ...current } });
  fireEvent.change(input, { target: { value: '48213' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar retirada' }));
  await waitFor(() => expect(post).toHaveBeenLastCalledWith('/deliveries/d1/retirar-devolucao', { pin: '48213' }));
  expect(await screen.findByRole('heading', { name: 'Levar à loja' })).toBeInTheDocument();
});

test('levar à loja: o destino e o código de devolução que a loja digita', async () => {
  current = { ...base, status: 'picked', pickedAt: new Date().toISOString(), returnPin: '63150' };
  render(<CorridaPage />);
  expect(await screen.findByRole('heading', { name: 'Levar à loja' })).toBeInTheDocument();
  expect(screen.getByText('Eletro Center')).toBeInTheDocument();
  expect(screen.getByText(/R\. dos Pinheiros, 870/)).toBeInTheDocument();
  expect(screen.getByTestId('pin-devolucao-loja')).toHaveTextContent('63150');
  expect(screen.getByText(/A loja digita este código ao receber o produto\./)).toBeInTheDocument();
});

test('a loja confirmou: devolução concluída', async () => {
  current = { ...base, status: 'picked', pickedAt: new Date().toISOString(), returnPin: '63150' };
  render(<CorridaPage />);
  await screen.findByRole('heading', { name: 'Levar à loja' });
  current = { ...base, status: 'delivered', deliveredAt: new Date().toISOString() };
  handlers['delivery:return_confirmed']?.({ deliveryId: 'd1' });
  expect(await screen.findByText('Devolução concluída')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Procurar próxima corrida' })).toBeInTheDocument();
});

test('cliente não aparece: bloqueado até a espera acabar; depois fecha e mostra quanto recebe', async () => {
  current = { ...base, customerAbsentAvailableAt: new Date(Date.now() + 5 * 60000).toISOString() };
  const { unmount } = render(<CorridaPage />);
  const early = await screen.findByRole('button', { name: /Cliente não aparece/ });
  expect(early).toBeDisabled();
  expect(screen.getByText(/Libera em \d+ min/)).toBeInTheDocument();
  unmount();

  current = { ...base, customerAbsentAvailableAt: new Date(Date.now() - 60000).toISOString() };
  post.mockResolvedValueOnce({ data: { success: true, status: 'cancelled', compensation: 9.9 } });
  render(<CorridaPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Cliente não aparece/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar: cliente não apareceu' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/deliveries/d1/devolucao-cliente-ausente', {}));
  expect(await screen.findByText('Corrida encerrada')).toBeInTheDocument();
  expect(screen.getByText(/Você recebe R\$ 9,90 por esta corrida, pagos pela loja\./)).toBeInTheDocument();
});
