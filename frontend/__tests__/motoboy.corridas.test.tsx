import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import api from '../lib/api';

const mockRouter: any = { push: jest.fn(), replace: jest.fn(), query: {}, asPath: '/motoboy', pathname: '/motoboy', isReady: true };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  // Como o ScreenHeader real: título vazio não vira heading.
  const Shell = ({ title, lead, actions, children }: any) => <div>{lead}{title ? <h1>{title}</h1> : null}{actions}{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'm1', _id: 'm1', name: 'Carlos Lima', role: 'motoboy' } }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));
jest.mock('../components/map/RouteThumbnail', () => ({ __esModule: true, RouteThumbnail: () => <div data-testid="mapa" />, default: () => null }));
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => ({ on: () => () => undefined, emit: jest.fn(), onReconnect: () => () => undefined, isConnected: true }) }));
jest.mock('../hooks/useUnreadNotifications', () => ({ useUnreadNotifications: () => 0, default: () => 0 }));
let mockStatus: any;
jest.mock('../hooks/useMotoboyStatus', () => ({ useMotoboyStatus: () => mockStatus }));
let mockPool: any; let mockOngoing: any;
jest.mock('../hooks/useSync', () => ({ useDeliveries: () => mockPool, useOngoingDeliveries: () => mockOngoing }));
let mockPush: any;
jest.mock('../hooks/usePushNotifications', () => ({ usePushNotifications: () => mockPush }));
let mockPointsOn = true;
jest.mock('../hooks/useGamificationFeatures', () => ({ useGamificationFeatures: () => ({ features: { gamificationPointsEnabled: mockPointsOn, benefitsRedeemEnabled: false, rankingPrizesEnabled: false }, loading: false }) }));
let mockSummary: any;
jest.mock('../components/motoboy/corridas/useCorridasSummary', () => ({ useCorridasSummary: () => mockSummary }));
let mockCourier: any;
jest.mock('../components/motoboy/corridas/useCourierStatus', () => ({ useCourierStatus: () => mockCourier }));

import CorridasPage from '../pages/motoboy/index';
import { MOTOBOY_NIGHT_ROUTES } from '../lib/routeTheme';

const get = api.get as jest.Mock;
const post = api.post as jest.Mock;
// Monta e deixa assentar as leituras da montagem (nível) dentro do act.
async function renderPage() {
  const r = render(<CorridasPage />);
  await act(async () => { await Promise.resolve(); });
  return r;
}
const offer = (id = 'd1', over: any = {}) => ({ _id: id, orderId: `ord00000${id}21`, fee: 12, distance: 7, storeAddress: 'R. dos Pinheiros, 870, Pinheiros', customerAddress: 'R. Harmonia, 412, Vila Madalena', ...over });

beforeEach(() => {
  jest.clearAllMocks();
  localStorage.clear();
  mockStatus = { online: false, loading: false, setOnline: jest.fn().mockResolvedValue(undefined), gps: 'off' };
  mockPool = { deliveries: [], loading: false, requiresVerification: false, setDeliveries: jest.fn((fn: any) => { mockPool.deliveries = typeof fn === 'function' ? fn(mockPool.deliveries) : fn; }), refetch: jest.fn() };
  mockOngoing = { deliveries: [], loading: false };
  mockPush = { supported: true, subscribed: true, permission: 'granted', busy: false, enable: jest.fn(), sendTest: jest.fn() };
  mockPointsOn = true;
  mockSummary = { summary: { today: { earnings: 86.4, count: 9 }, week: { earnings: 412.8, count: 43 } }, error: false, retrying: false, retry: jest.fn() };
  mockCourier = { state: 'verified', reload: jest.fn() };
  get.mockImplementation((url: string) => (url === '/gamification/m1' ? Promise.resolve({ data: { totalPoints: 1840, points: 1840, level: 'Ouro' } }) : Promise.reject(new Error(`n/a ${url}`))));
});

test('offline: saudação, Ficar online, KPIs, nível, documentos e entregas', async () => {
  await renderPage();
  expect(screen.getByRole('heading', { name: /Carlos/ })).toBeInTheDocument();
  expect(screen.getByText('Você está offline')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ficar online' })).toBeInTheDocument();
  expect(screen.getByText('R$ 86,40')).toBeInTheDocument();
  expect(screen.getByText('9 corridas')).toBeInTheDocument();
  expect(screen.getByText('R$ 412,80')).toBeInTheDocument();
  expect(await screen.findByText('Ouro · 1.840 pts')).toBeInTheDocument();
  expect(screen.getByText('Faltam 1.160 pts para Platina')).toBeInTheDocument();
  expect(screen.getByText('Documentos em dia')).toBeInTheDocument();
  expect(screen.queryByText('Termine seu cadastro')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Suas entregas/ }));
  expect(mockRouter.push).toHaveBeenCalledWith('/motoboy/entregas');
});

test('pontos desligados: sem a linha do nível e sem ler a gamificação', async () => {
  mockPointsOn = false;
  await renderPage();
  await act(async () => { await Promise.resolve(); });
  expect(screen.queryByText(/pts/)).not.toBeInTheDocument();
  expect(get).not.toHaveBeenCalledWith('/gamification/m1');
});

test('resumo com erro: Tentar de novo, nunca R$ 0,00', async () => {
  mockSummary = { summary: null, error: true, retrying: false, retry: jest.fn() };
  await renderPage();
  expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument();
  expect(screen.queryByText('Ganhos hoje')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(mockSummary.retry).toHaveBeenCalled();
});

test('resumo com erro, online procurando: também nunca R$ 0,00', async () => {
  mockSummary = { summary: null, error: true, retrying: false, retry: jest.fn() };
  mockStatus = { ...mockStatus, online: true, gps: 'active' };
  await renderPage();
  expect(screen.getByText('Procurando corridas perto de você')).toBeInTheDocument();
  expect(screen.queryByText('R$ 0,00')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
});

test('Tentar de novo fica desabilitado enquanto relê: nenhum toque a mais', async () => {
  mockSummary = { summary: null, error: true, retrying: false, retry: jest.fn() };
  const { rerender } = await renderPage();
  expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeEnabled();
  mockSummary = { ...mockSummary, retrying: true };
  rerender(<CorridasPage />);
  const btn = screen.getByRole('button', { name: /Tentar de novo/ });
  expect(btn).toBeDisabled();
  fireEvent.click(btn);
  expect(mockSummary.retry).not.toHaveBeenCalled();
});

test('Ficar online chama setOnline(true); falha mostra aviso', async () => {
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Ficar online' }));
  await waitFor(() => expect(mockStatus.setOnline).toHaveBeenCalledWith(true));
  mockStatus.setOnline.mockRejectedValueOnce(new Error('x'));
  fireEvent.click(screen.getByRole('button', { name: 'Ficar online' }));
  expect(await screen.findByText('Não foi possível mudar seu status. Tente de novo.')).toBeInTheDocument();
});

test('online sem ofertas: procurando, badge Online e energia para ficar offline', async () => {
  mockStatus = { ...mockStatus, online: true, gps: 'active' };
  await renderPage();
  expect(screen.getByText('Procurando corridas perto de você')).toBeInTheDocument();
  expect(screen.getByText(/^Online/)).toBeInTheDocument();
  expect(screen.getByRole('heading', { level: 1, name: 'Corridas' })).toBeInTheDocument();
  expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
  expect(screen.getByText('R$ 86,40')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ficar offline' }));
  await waitFor(() => expect(mockStatus.setOnline).toHaveBeenCalledWith(false));
});

test('GPS negado e parado aparecem como alerta', async () => {
  mockStatus = { ...mockStatus, online: true, gps: 'denied' };
  const { unmount } = await renderPage();
  expect(screen.getByText(/Localização desativada/)).toBeInTheDocument();
  unmount();
  mockStatus = { ...mockStatus, online: true, gps: 'stale' };
  await renderPage();
  expect(screen.getByText(/Localização parada/)).toBeInTheDocument();
});

test('oferta: aceitar vai para a corrida (sem ?nav=1); toque duplo manda um pedido só', async () => {
  mockStatus = { ...mockStatus, online: true, gps: 'active' };
  mockPool.deliveries = [offer('d1')];
  let resolve: (v: any) => void = () => undefined;
  post.mockImplementation(() => new Promise((r) => { resolve = r; }));
  await renderPage();
  const btn = within(screen.getByTestId('oferta-d1')).getByRole('button', { name: 'Aceitar por R$ 9,60' });
  fireEvent.click(btn);
  fireEvent.click(btn);
  expect(within(screen.getByTestId('oferta-d1')).getByRole('button', { name: /Aceitar por/ })).toBeDisabled();
  await act(async () => { resolve({ data: { _id: 'd1', status: 'assigned' } }); });
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith('/deliveries/d1/claim');
  expect(mockRouter.push).toHaveBeenCalledTimes(1);
  expect(mockRouter.push).toHaveBeenCalledWith('/motoboy/corrida/d1');
});

test('toque duplo no mesmo act (antes do re-render): um pedido só', async () => {
  mockStatus = { ...mockStatus, online: true, gps: 'active' };
  mockPool.deliveries = [offer('d1')];
  post.mockImplementation(() => new Promise(() => undefined));
  await renderPage();
  const btn = within(screen.getByTestId('oferta-d1')).getByRole('button', { name: 'Aceitar por R$ 9,60' });
  // Os dois cliques dentro do mesmo act: o React só re-renderiza (botão desabilitado) no fim dele.
  await act(async () => { fireEvent.click(btn); fireEvent.click(btn); });
  expect(post).toHaveBeenCalledTimes(1);
});

test.each([
  ['ALREADY_CLAIMED', 'Outro entregador aceitou antes'],
  ['ORDER_CLOSED', 'Este pedido foi cancelado'],
  [undefined, 'Outro entregador aceitou antes'],
])('409 %s: oferta perdida, sai da lista e relê', async (code, title) => {
  mockStatus = { ...mockStatus, online: true, gps: 'active' };
  mockPool.deliveries = [offer('d1')];
  post.mockRejectedValue({ response: { status: 409, data: { error: 'Already claimed or not available', ...(code ? { code } : {}) } } });
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Aceitar por R$ 9,60' }));
  expect(await screen.findByText(title)).toBeInTheDocument();
  expect(mockPool.setDeliveries).toHaveBeenCalled();
  expect(mockPool.deliveries).toEqual([]);
  expect(mockPool.refetch).toHaveBeenCalled();
  expect(mockRouter.push).not.toHaveBeenCalled();
});

test('409 MOTOBOY_PIX_KEY_REQUIRED: mensagem do servidor com "Cadastrar chave Pix", a oferta fica', async () => {
  mockStatus = { ...mockStatus, online: true, gps: 'active' };
  mockPool.deliveries = [offer('d1')];
  const msg = 'Cadastre sua chave Pix para pegar corridas: é por ela que você recebe.';
  post.mockRejectedValue({ response: { status: 409, data: { error: msg, code: 'MOTOBOY_PIX_KEY_REQUIRED' } } });
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Aceitar por R$ 9,60' }));
  expect(await screen.findByText(msg)).toBeInTheDocument();
  expect(screen.queryByText('Outro entregador aceitou antes')).not.toBeInTheDocument();
  expect(screen.getByTestId('oferta-d1')).toBeInTheDocument();
  expect(mockPool.setDeliveries).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar chave Pix' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/dados-recebimento');
});

test('erro que não é 409: alerta com a mensagem do servidor e a oferta fica', async () => {
  mockStatus = { ...mockStatus, online: true, gps: 'active' };
  mockPool.deliveries = [offer('d1')];
  post.mockRejectedValue({ response: { status: 500, data: { error: 'Falha ao aceitar' } } });
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Aceitar por R$ 9,60' }));
  expect(await screen.findByText('Falha ao aceitar')).toBeInTheDocument();
  expect(screen.getByTestId('oferta-d1')).toBeInTheDocument();
  expect(mockPool.setDeliveries).not.toHaveBeenCalled();
});

test('Pular: "Você pulou" e a oferta não volta no próximo polling', async () => {
  mockStatus = { ...mockStatus, online: true, gps: 'active' };
  mockPool.deliveries = [offer('d1'), offer('d2')];
  const { rerender } = await renderPage();
  fireEvent.click(within(screen.getByTestId('oferta-d1')).getByRole('button', { name: 'Pular' }));
  expect(screen.getByText('Você pulou')).toBeInTheDocument();
  mockPool.deliveries = [offer('d1'), offer('d2')];
  rerender(<CorridasPage />);
  expect(screen.queryByTestId('oferta-d1')).not.toBeInTheDocument();
  expect(screen.getByTestId('oferta-d2')).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});

// ── C2 / K3: quem trava é o servidor ─────────────────────────────────────────

test('C2 · requiresVerification true: EmAnalise no lugar do Ficar online', async () => {
  mockPool.requiresVerification = true;
  mockCourier = { state: 'review', reload: jest.fn() };
  await renderPage();
  expect(screen.getByText('Estamos conferindo seus documentos')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ficar online' })).not.toBeInTheDocument();
});

test('C2 · requiresVerification true com cadastro incompleto: EmAnalise de "falta terminar"', async () => {
  mockPool.requiresVerification = true;
  mockCourier = { state: 'incomplete', reload: jest.fn() };
  await renderPage();
  expect(screen.getByText('Falta terminar seu cadastro')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Ficar online' })).not.toBeInTheDocument();
});

test('C2 · 403 COURIER_NOT_VERIFIED no aceite: relê o cadastro e mostra EmAnalise', async () => {
  mockStatus = { ...mockStatus, online: true, gps: 'active' };
  mockPool.deliveries = [offer('d1')];
  mockCourier = { state: 'review', reload: jest.fn() };
  post.mockRejectedValue({ response: { status: 403, data: { error: 'Conta de motoboy não verificada.', code: 'COURIER_NOT_VERIFIED' } } });
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Aceitar por R$ 9,60' }));
  await waitFor(() => expect(mockCourier.reload).toHaveBeenCalled());
  expect(await screen.findByText('Estamos conferindo seus documentos')).toBeInTheDocument();
  expect(screen.queryByTestId('oferta-d1')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Ficar offline' })).toBeInTheDocument();
  expect(mockRouter.push).not.toHaveBeenCalled();
});

test('C2 · trava desligada e cadastro incompleto: Ficar online + alerta "Termine seu cadastro"', async () => {
  mockPool.requiresVerification = false;
  mockCourier = { state: 'incomplete', reload: jest.fn() };
  await renderPage();
  expect(screen.getByRole('button', { name: 'Ficar online' })).toBeInTheDocument();
  expect(screen.queryByText('Falta terminar seu cadastro')).not.toBeInTheDocument();
  expect(screen.getByText('Termine seu cadastro')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continuar cadastro' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/motoboy/cadastro');
});

test('C2 · trava desligada e cadastro em análise: Ficar online + aviso "em análise", sem Continuar cadastro', async () => {
  mockCourier = { state: 'review', reload: jest.fn() };
  await renderPage();
  expect(screen.getByRole('button', { name: 'Ficar online' })).toBeInTheDocument();
  expect(screen.queryByText('Estamos conferindo seus documentos')).not.toBeInTheDocument();
  expect(screen.getByText('Seus documentos estão em análise')).toBeInTheDocument();
  expect(screen.queryByText('Termine seu cadastro')).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Continuar cadastro' })).not.toBeInTheDocument();
});

test('C2 · erro ao ler o cadastro e o pool: Ficar online normal, sem trava', async () => {
  mockPool.requiresVerification = null;
  mockCourier = { state: 'error', reload: jest.fn() };
  await renderPage();
  expect(screen.getByRole('button', { name: 'Ficar online' })).toBeEnabled();
  expect(screen.queryByText('Estamos conferindo seus documentos')).not.toBeInTheDocument();
  expect(screen.queryByText('Termine seu cadastro')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Não carregamos seus documentos/ }));
  expect(mockCourier.reload).toHaveBeenCalled();
});

test('corrida em andamento: Continuar corrida', async () => {
  mockOngoing = { deliveries: [{ _id: 'd9', orderId: 'ord000000999', status: 'picked' }], loading: false };
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Continuar corrida' }));
  expect(mockRouter.push).toHaveBeenCalledWith('/motoboy/corrida/d9');
});

test('notificações: oferece ativar quando o navegador permite', async () => {
  mockPush = { supported: true, subscribed: false, permission: 'default', busy: false, enable: jest.fn().mockResolvedValue(true), sendTest: jest.fn() };
  await renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Ativar' }));
  expect(await screen.findByText('Notificações ativadas! Você recebe as corridas mesmo com o app fechado.')).toBeInTheDocument();
});

test('dica de pico some e não volta', async () => {
  const { unmount } = await renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Dispensar dica' }));
  expect(screen.queryByText('Horário de pico')).not.toBeInTheDocument();
  unmount();
  await renderPage();
  expect(screen.queryByText('Horário de pico')).not.toBeInTheDocument();
});

test('K39: dispensar a dica de pico não esconde o aviso de manter o app aberto (e vice-versa)', async () => {
  const { unmount } = await renderPage();
  fireEvent.click(screen.getByRole('button', { name: 'Dispensar dica' }));
  unmount();
  mockStatus = { ...mockStatus, online: true, gps: 'active' };
  const second = await renderPage();
  expect(screen.getByText('Mantenha o app aberto')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Dispensar dica' }));
  expect(screen.queryByText('Mantenha o app aberto')).not.toBeInTheDocument();
  second.unmount();
  mockStatus = { ...mockStatus, online: false, gps: 'off' };
  localStorage.removeItem('drop.motoboy.dicaPico');
  await renderPage();
  expect(screen.getByText('Horário de pico')).toBeInTheDocument();
});

test('online since: grava ao ficar online, mostra o tempo e apaga ao ficar offline', async () => {
  localStorage.setItem('drop.motoboy.onlineSince', String(Date.now() - 42 * 60_000));
  mockStatus = { ...mockStatus, online: true, gps: 'active' };
  const { unmount } = await renderPage();
  expect(screen.getByText('Online · 0h42')).toBeInTheDocument();
  unmount();
  // Sem hora guardada: ao ficar online, grava agora.
  localStorage.clear();
  const before = Date.now();
  const again = await renderPage();
  const saved = Number(localStorage.getItem('drop.motoboy.onlineSince'));
  expect(saved).toBeGreaterThanOrEqual(before);
  expect(saved).toBeLessThanOrEqual(Date.now());
  expect(screen.getByText('Online · 0h00')).toBeInTheDocument();
  // Offline: apaga.
  mockStatus = { ...mockStatus, online: false, gps: 'off' };
  again.rerender(<CorridasPage />);
  expect(localStorage.getItem('drop.motoboy.onlineSince')).toBeNull();
});

test('tema e arquivos antigos', async () => {
  expect(MOTOBOY_NIGHT_ROUTES).toContain('/motoboy');
  expect(fs.existsSync(path.join(__dirname, '..', 'components', 'motoboy', 'DeliveryOfferCard.tsx'))).toBe(false);
  expect(fs.existsSync(path.join(__dirname, '..', 'pages', 'motoboy', 'MotoboyCockpit.module.css'))).toBe(false);
});
