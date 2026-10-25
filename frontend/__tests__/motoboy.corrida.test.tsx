import { render, screen, fireEvent, waitFor, act, within } from '@testing-library/react';
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
// O mapa de 180 px: tocar nele chama o onExpand (a página abre a navegação, C1/K1).
jest.mock('../components/map/RouteThumbnail', () => ({
  __esModule: true,
  RouteThumbnail: (p: any) => <button type="button" data-testid="mapa" onClick={p.onExpand} />,
  default: () => null,
}));
// A navegação em tela cheia: o "finalizar" de dentro dela chama o onFinalize da página (K2).
jest.mock('../components/map/presets/MotoboyNavMap', () => ({
  __esModule: true,
  MotoboyNavMap: (p: any) => (
    <div data-testid="nav-map" data-status={p.delivery?.status}>
      <button type="button" onClick={() => { p.onFinalize?.('73912'); }}>Finalizar pelo mapa</button>
      <button type="button" onClick={() => p.onChat?.('customer')}>Chat pelo mapa</button>
      <button type="button" onClick={p.onClose}>Fechar mapa</button>
    </div>
  ),
}));
jest.mock('../lib/logger', () => ({ log: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', loading: false, error: false }) }));
jest.mock('../hooks/useGamificationFeatures', () => ({ useGamificationFeatures: () => ({ features: { gamificationPointsEnabled: true, benefitsRedeemEnabled: false, rankingPrizesEnabled: false }, loading: false }) }));
const handlers: Record<string, (d: any) => void> = {};
const mockEmit = jest.fn();
// Funções estáveis, como as do SocketContext real (useCallback): o useRide depende delas.
const mockSocket = {
  on: (ev: string, fn: any) => { handlers[ev] = fn; return () => undefined; },
  emit: (...a: any[]) => mockEmit(...a),
  isConnected: true,
  onReconnect: () => () => undefined,
};
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));

import CorridaPage from '../pages/motoboy/corrida/[id]';
import { MOTOBOY_NIGHT_ROUTES, themeForPath } from '../lib/routeTheme';

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
const base = {
  _id: 'd1', orderId: 'ord0000004821', status: 'assigned', pinRetirada: '48213', assignedAt: new Date().toISOString(),
  customerAbsentWaitMin: 15, customerAbsentAvailableAt: null, cancellationCompensation: null,
  storeObj: { _id: 's1', name: 'Eletro Center', telefone: '1133334444' }, customerObj: { _id: 'c1', name: 'Ana Souza', telefone: '11999990000' },
  order: { _id: 'ord0000004821', storeId: 's1', customerId: 'c1', products: [{ productName: 'Fone', quantity: 1 }] },
};
let current: any;
beforeAll(() => { (global.navigator as any).geolocation = { watchPosition: jest.fn(() => 1), clearWatch: jest.fn(), getCurrentPosition: jest.fn() }; });
beforeEach(() => {
  jest.clearAllMocks();
  mockRouter.query = { id: 'd1' };
  current = { ...base };
  get.mockImplementation((url: string) => {
    if (url === '/deliveries/d1') return Promise.resolve({ data: current });
    if (url === '/payouts/my') return Promise.resolve({ data: { payouts: [{ deliveryId: 'd1', amount: 9.6, status: 'pending' }] } });
    if (url.startsWith('/deliveries/motoboy/')) return Promise.resolve({ data: [] });
    if (url.startsWith('/chat/conversations/')) return Promise.resolve({ data: { messages: [] } });
    return Promise.reject(new Error(`n/a ${url}`));
  });
  post.mockImplementation((url: string) => (url === '/chat/conversations' ? Promise.resolve({ data: { _id: 'cv1' } }) : Promise.resolve({ data: {} })));
});

const finalizarCalls = () => post.mock.calls.filter((c) => c[0] === '/deliveries/d1/finalizar');

test('retirar: 1 de 2 com o PIN; a loja valida e a tela vira a entrega sozinha', async () => {
  render(<CorridaPage />);
  expect(await screen.findByTestId('pin-retirada')).toHaveTextContent('48213');
  expect(screen.getByRole('heading', { name: 'Retirar na loja' })).toBeInTheDocument();
  expect(screen.getByText('1 de 2')).toBeInTheDocument();
  current = { ...base, status: 'picked', pickedAt: new Date().toISOString() };
  act(() => handlers['delivery:pin_validated']({ deliveryId: 'd1' }));
  expect(await screen.findByRole('heading', { name: 'Entregar ao cliente' })).toBeInTheDocument();
  expect(screen.getByText('2 de 2')).toBeInTheDocument();
  expect(screen.queryByText('1 de 2')).toBeNull();
  expect(screen.getByLabelText('Código do cliente')).toBeInTheDocument();
});

test('chat certo em cada etapa', async () => {
  render(<CorridaPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Mensagem para a loja' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/chat/conversations', { type: 'loja_motoboy', otherParticipantId: 's1', orderId: 'ord0000004821', deliveryId: 'd1' }));
  current = { ...base, status: 'picked' };
  act(() => handlers['delivery:pin_validated']({ deliveryId: 'd1' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Mensagem para o cliente' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/chat/conversations', { type: 'motoboy_cliente', otherParticipantId: 'c1', orderId: 'ord0000004821', deliveryId: 'd1' }));
});

test('finalizar: concluída com o ganho do servidor, mesmo se delivery:completed chegar antes da resposta', async () => {
  current = { ...base, status: 'picked' };
  let resolve: (v: any) => void = () => undefined;
  post.mockImplementation((url: string) => (url === '/deliveries/d1/finalizar' ? new Promise((r) => { resolve = r; }) : Promise.resolve({ data: {} })));
  render(<CorridaPage />);
  fireEvent.change(await screen.findByLabelText('Código do cliente'), { target: { value: '73912' } });
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar entrega' }));
  current = { ...base, status: 'delivered', deliveredAt: new Date().toISOString() };
  act(() => handlers['delivery:completed']({ deliveryId: 'd1' }));
  act(() => handlers['gamification:points_earned']({ points: 40, totalPoints: 1880 }));
  await act(async () => { resolve({ data: { success: true } }); });
  expect(await screen.findByText('Entrega concluída')).toBeInTheDocument();
  expect(await screen.findByText('R$ 9,60')).toBeInTheDocument();
  expect(screen.getByText('+40')).toBeInTheDocument();
  expect(mockRouter.replace).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Procurar próxima corrida' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/motoboy');
});

test('corrida já entregue ao abrir (link antigo): vai para o detalhe da entrega', async () => {
  current = { ...base, status: 'delivered' };
  render(<CorridaPage />);
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/motoboy/entregas/d1'));
  expect(screen.queryByText('Entrega concluída')).toBeNull();
});

test('cancelamento por socket: tela de cancelada com motivo e compensação', async () => {
  render(<CorridaPage />);
  await screen.findByTestId('pin-retirada');
  current = { ...base, status: 'cancelled', cancellationCompensation: 2.84 };
  act(() => handlers['delivery:cancelled']({ deliveryId: 'd1', status: 'cancelled', reason: 'Comprei errado', cancellationCompensation: 2.84 }));
  expect(await screen.findByText('A corrida foi cancelada')).toBeInTheDocument();
  expect(screen.getByText('"Comprei errado"')).toBeInTheDocument();
  expect(screen.getByText('R$ 2,84')).toBeInTheDocument();
  expect(document.querySelector('[data-shell="bare"]')).not.toBeNull();
});

test('devolução pendente: código de devolução; confirmação da loja fecha', async () => {
  current = { ...base, status: 'picked', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '631500' };
  render(<CorridaPage />);
  expect(await screen.findByTestId('pin-devolucao')).toHaveTextContent('631500');
  expect(screen.getByRole('heading', { name: 'Devolver o pacote' })).toBeInTheDocument();
  expect(screen.getByText('Devolução')).toBeInTheDocument();
  act(() => handlers['delivery:return_confirmed']({ deliveryId: 'd1', statusDevolucao: 'confirmado' }));
  expect(await screen.findByText('Devolução confirmada')).toBeInTheDocument();
  expect(document.querySelector('[data-shell="bare"]')).not.toBeNull();
});

test('cliente ausente: ?etapa=ausente mostra a espera e o voltar leva à entrega', async () => {
  mockRouter.query = { id: 'd1', etapa: 'ausente' };
  current = { ...base, status: 'picked', customerAbsentAvailableAt: new Date(Date.now() + 5 * 60_000).toISOString() };
  render(<CorridaPage />);
  expect(await screen.findByRole('heading', { name: 'Cliente não atende' })).toBeInTheDocument();
  expect(document.querySelector('[data-back="/motoboy/corrida/d1"]')).not.toBeNull();
});

test('encerrar como ausente: relê e mostra a devolução com a corrida garantida', async () => {
  mockRouter.query = { id: 'd1', etapa: 'ausente' };
  current = { ...base, status: 'picked', customerAbsentAvailableAt: new Date(Date.now() - 1000).toISOString() };
  post.mockImplementation((url: string) => {
    if (url === '/deliveries/d1/cliente-ausente') {
      current = { ...base, status: 'cancelled', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '631500', cancellationCompensation: 9.6 };
      return Promise.resolve({ data: { success: true, pinDevolucao: '631500', motoboyCompensation: 9.6 } });
    }
    return Promise.resolve({ data: {} });
  });
  render(<CorridaPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Encerrar como ausente' }));
  expect(await screen.findByTestId('pin-devolucao')).toHaveTextContent('631500');
  expect(screen.getByText('Sua corrida está garantida')).toBeInTheDocument();
});

test('K11: encerrar como ausente com a releitura ainda sem o código: mostra o código da resposta', async () => {
  mockRouter.query = { id: 'd1', etapa: 'ausente' };
  current = { ...base, status: 'picked', customerAbsentAvailableAt: new Date(Date.now() - 1000).toISOString() };
  post.mockImplementation((url: string) => (url === '/deliveries/d1/cliente-ausente'
    ? Promise.resolve({ data: { success: true, pinDevolucao: '631500', motoboyCompensation: 9.6 } })
    : Promise.resolve({ data: {} })));
  render(<CorridaPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Encerrar como ausente' }));
  expect(await screen.findByTestId('pin-devolucao')).toHaveTextContent('631500');
  expect(screen.getByText('Sua corrida está garantida')).toBeInTheDocument();
  expect(screen.getByRole('heading', { name: 'Devolver o pacote' })).toBeInTheDocument();
});

test('K11: devolver na entrega (202) com a releitura ainda sem o código: mostra o código da resposta', async () => {
  current = { ...base, status: 'picked' };
  post.mockImplementation((url: string) => (url === '/deliveries/d1/reject'
    ? Promise.resolve({ status: 202, data: { success: true, isPending: true, statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '777123' } })
    : Promise.resolve({ data: {} })));
  render(<CorridaPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Tive um problema na entrega' }));
  fireEvent.click(screen.getByRole('button', { name: /Pacote danificado/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Devolver corrida' }));
  expect(await screen.findByTestId('pin-devolucao')).toHaveTextContent('777123');
  expect(mockRouter.replace).not.toHaveBeenCalled();
  // O servidor passa a trazer o próprio código: ele vence o guardado.
  current = { ...base, status: 'picked', statusDevolucao: 'aguardando_confirmacao', pinDevolucao: '888456' };
  act(() => handlers['delivery:updated']({ deliveryId: 'd1' }));
  await waitFor(() => expect(screen.getByTestId('pin-devolucao')).toHaveTextContent('888456'));
});

test('devolver na retirada: volta para Corridas', async () => {
  post.mockImplementation((url: string) => (url === '/deliveries/d1/reject' ? Promise.resolve({ status: 200, data: { success: true, status: 'pending' } }) : Promise.resolve({ data: {} })));
  render(<CorridaPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Tive um problema na retirada' }));
  fireEvent.click(screen.getByRole('button', { name: /Não consigo ir/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Devolver corrida' }));
  await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/motoboy'));
});

test('a sheet de problema segue a etapa real: retirada (assigned) e entrega (picked)', async () => {
  render(<CorridaPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Tive um problema na retirada' }));
  let dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('button', { name: /^Loja demorando/ })).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: /^Cliente não atende/ })).toBeNull();
  fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());

  current = { ...base, status: 'picked' };
  act(() => handlers['delivery:pin_validated']({ deliveryId: 'd1' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Tive um problema na entrega' }));
  dialog = await screen.findByRole('dialog');
  expect(within(dialog).getByRole('button', { name: /^Cliente não atende/ })).toBeInTheDocument();
  expect(within(dialog).queryByRole('button', { name: /^Loja demorando/ })).toBeNull();
  // "Cliente não atende" leva ao fluxo de ausente.
  fireEvent.click(within(dialog).getByRole('button', { name: /^Cliente não atende/ }));
  expect(mockRouter.push).toHaveBeenCalledWith('/motoboy/corrida/d1?etapa=ausente');
});

test('C1: tocar no mapa abre a navegação em tela cheia', async () => {
  render(<CorridaPage />);
  await screen.findByTestId('pin-retirada');
  expect(screen.queryByTestId('nav-map')).toBeNull();
  fireEvent.click(screen.getByTestId('mapa'));
  expect(await screen.findByTestId('nav-map')).toHaveAttribute('data-status', 'assigned');
  fireEvent.click(screen.getByRole('button', { name: 'Fechar mapa' }));
  await waitFor(() => expect(screen.queryByTestId('nav-map')).toBeNull());
});

test('C1: ?nav=1 abre a navegação direto', async () => {
  mockRouter.query = { id: 'd1', nav: '1' };
  current = { ...base, status: 'picked' };
  render(<CorridaPage />);
  expect(await screen.findByTestId('nav-map')).toHaveAttribute('data-status', 'picked');
});

test('C1: sem ?nav=1 a navegação não abre sozinha', async () => {
  render(<CorridaPage />);
  await screen.findByTestId('pin-retirada');
  await act(async () => { await new Promise((r) => setTimeout(r, 30)); });
  expect(screen.queryByTestId('nav-map')).toBeNull();
});

test('K2: o mapa e a tela dividem a guarda do finalizar (um envio em voo bloqueia o outro)', async () => {
  current = { ...base, status: 'picked' };
  let resolve: (v: any) => void = () => undefined;
  post.mockImplementation((url: string) => (url === '/deliveries/d1/finalizar' ? new Promise((r) => { resolve = r; }) : Promise.resolve({ data: {} })));
  render(<CorridaPage />);
  fireEvent.change(await screen.findByLabelText('Código do cliente'), { target: { value: '73912' } });
  fireEvent.click(screen.getByTestId('mapa'));
  fireEvent.click(await screen.findByRole('button', { name: 'Finalizar pelo mapa' }));
  await waitFor(() => expect(finalizarCalls()).toHaveLength(1));
  // O envio pelo mapa está em voo: a tela também fica travada.
  expect(screen.getByRole('button', { name: 'Finalizar entrega' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar entrega' }));
  fireEvent.click(screen.getByRole('button', { name: 'Finalizar pelo mapa' }));
  expect(finalizarCalls()).toHaveLength(1);
  current = { ...base, status: 'delivered', deliveredAt: new Date().toISOString() };
  await act(async () => { resolve({ data: { success: true } }); });
  // Concluída pelo mapa: o mapa fecha e a tela relê.
  expect(await screen.findByText('Entrega concluída')).toBeInTheDocument();
  expect(screen.queryByTestId('nav-map')).toBeNull();
  expect(finalizarCalls()).toHaveLength(1);
});

test('K2: chat pelo mapa abre a conversa com o cliente', async () => {
  current = { ...base, status: 'picked' };
  render(<CorridaPage />);
  await screen.findByLabelText('Código do cliente');
  fireEvent.click(screen.getByTestId('mapa'));
  fireEvent.click(await screen.findByRole('button', { name: 'Chat pelo mapa' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/chat/conversations', { type: 'motoboy_cliente', otherParticipantId: 'c1', orderId: 'ord0000004821', deliveryId: 'd1' }));
});

test('403: a corrida não é mais do motoboy', async () => {
  get.mockImplementation(() => Promise.reject({ response: { status: 403, data: { error: 'Forbidden' } } }));
  render(<CorridaPage />);
  expect(await screen.findByText('Esta corrida não está mais com você')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Voltar para Corridas' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/motoboy');
});

test('rede caiu sem dados: erro com Tentar de novo', async () => {
  get.mockImplementationOnce(() => Promise.reject(new Error('offline')));
  render(<CorridaPage />);
  fireEvent.click(await screen.findByRole('button', { name: /Tentar de novo/ }));
  expect(await screen.findByTestId('pin-retirada')).toBeInTheDocument();
});

test('GPS da corrida continua sendo enviado', async () => {
  render(<CorridaPage />);
  await screen.findByTestId('pin-retirada');
  const watch = (global.navigator as any).geolocation.watchPosition as jest.Mock;
  expect(watch).toHaveBeenCalled();
  const onPos = watch.mock.calls[0][0];
  act(() => onPos({ coords: { latitude: -22.9, longitude: -43.2, accuracy: 8 }, timestamp: Date.now() }));
  expect(mockEmit).toHaveBeenCalledWith('delivery:location_updated', expect.objectContaining({ deliveryId: 'd1', latitude: -22.9, longitude: -43.2 }));
});

test('tema: a rota da corrida é noturna automática', () => {
  expect(MOTOBOY_NIGHT_ROUTES).toContain('/motoboy/corrida/[id]');
  expect(MOTOBOY_NIGHT_ROUTES).not.toContain('/motoboy/delivery/[id]');
  expect(themeForPath('/motoboy/corrida/abc')).toBe('motoboy-pref');
});
