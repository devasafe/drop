import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
jest.mock('../../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'm1', name: 'Carlos' } }) }));
let mockMode: any = { settlementMode: 'custodia', loading: false, error: false };
jest.mock('../../../../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockMode }));
let mockPointsOn = true;
jest.mock('../../../../hooks/useGamificationFeatures', () => ({ useGamificationFeatures: () => ({ features: { gamificationPointsEnabled: mockPointsOn, benefitsRedeemEnabled: false, rankingPrizesEnabled: false }, loading: false }) }));
import { ConcluidaView } from '../ConcluidaView';
const get = api.get as jest.Mock;

const ride = { _id: 'd1', orderId: 'ord0000004821', status: 'delivered', deliveredAt: '2026-10-14T17:32:00Z', customerObj: { name: 'Ana Souza' } };
const routes = (over: Record<string, any> = {}) => (url: string) => {
  const table: Record<string, any> = {
    '/payouts/my': { data: { payouts: [{ _id: 'p1', deliveryId: 'd1', orderId: 'ord0000004821', amount: 9.6, status: 'pending' }], total: 1 } },
    '/motoboy/transfers': { data: { success: true, data: [{ id: 't1', orderId: 'ord0000004821', amount: 12, status: 'requested', reason: 'delivery' }] } },
    '/deliveries/motoboy/m1/ratings': { data: [{ rating: 5, comment: 'Super educado e rápido!', createdAt: '2026-10-14T16:58:00Z' }] },
    ...over,
  };
  return url in table ? (table[url] instanceof Error ? Promise.reject(table[url]) : Promise.resolve(table[url])) : Promise.reject(new Error('n/a'));
};
beforeEach(() => { jest.clearAllMocks(); mockMode = { settlementMode: 'custodia', loading: false, error: false }; mockPointsOn = true; get.mockImplementation(routes()); });

test('custódia: ganho do repasse da entrega, a liberar, pontos e avaliação', async () => {
  const onNext = jest.fn();
  render(<ConcluidaView ride={ride} points={{ points: 40, totalPoints: 1880 }} onNext={onNext} />);
  expect(screen.getByText('Entrega concluída')).toBeInTheDocument();
  expect(screen.getByText('Pedido #004821 entregue às 14:32.')).toBeInTheDocument();
  expect(await screen.findByText('R$ 9,60')).toBeInTheDocument();
  expect(screen.getByText('a liberar')).toBeInTheDocument();
  expect(get).toHaveBeenCalledWith('/payouts/my', { params: { limit: 20 } });
  expect(screen.getByText('+40')).toBeInTheDocument();
  expect(screen.getByText('1.880 no total')).toBeInTheDocument();
  expect(await screen.findByText('Super educado e rápido!')).toBeInTheDocument();
  expect(screen.getByText('5,0')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Procurar próxima corrida' }));
  expect(onNext).toHaveBeenCalled();
  expect(screen.getByText('Você continua online')).toBeInTheDocument();
});

test('custódia sem o repasse: nunca presume valor', async () => {
  get.mockImplementation(routes({ '/payouts/my': { data: { payouts: [], total: 0 } } }));
  render(<ConcluidaView ride={ride} points={null} onNext={jest.fn()} />);
  expect(await screen.findByText('Veja em Ganhos')).toBeInTheDocument();
  expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
});

test('pontos desligados ou sem evento: sem o bloco de pontos', async () => {
  mockPointsOn = false;
  const { unmount } = render(<ConcluidaView ride={ride} points={{ points: 40, totalPoints: 1880 }} onNext={jest.fn()} />);
  await screen.findByText('R$ 9,60');
  expect(screen.queryByText('+40')).not.toBeInTheDocument();
  unmount();
  mockPointsOn = true;
  render(<ConcluidaView ride={ride} points={null} onNext={jest.fn()} />);
  await screen.findByText('R$ 9,60');
  expect(screen.queryByText('Pontos')).not.toBeInTheDocument();
});

test('modo direto: "Entregue!", Pix a caminho com o status real', async () => {
  mockMode = { settlementMode: 'direto', loading: false, error: false };
  render(<ConcluidaView ride={ride} points={null} onNext={jest.fn()} />);
  expect(screen.getByText('Entregue!')).toBeInTheDocument();
  expect(await screen.findByText('R$ 12,00')).toBeInTheDocument();
  expect(screen.getByText('Pix a caminho da sua chave')).toBeInTheDocument();
  expect(screen.getByText('Enviando')).toBeInTheDocument();
  expect(get).not.toHaveBeenCalledWith('/payouts/my', expect.anything());
});

test('erro ao ler o modo: não lê dinheiro e manda para Ganhos', async () => {
  mockMode = { settlementMode: 'custodia', loading: false, error: true };
  render(<ConcluidaView ride={ride} points={null} onNext={jest.fn()} />);
  expect(await screen.findByText('Veja em Ganhos')).toBeInTheDocument();
  await waitFor(() => expect(get).not.toHaveBeenCalledWith('/payouts/my', expect.anything()));
});

test('payout dividido por saque: soma os pedaços da entrega e ignora cancelado', async () => {
  get.mockImplementation(routes({ '/payouts/my': { data: { payouts: [
    { _id: 'p1', deliveryId: 'd1', orderId: 'ord0000004821', amount: 3.6, status: 'pending' },
    { _id: 'p2', deliveryId: 'd1', orderId: 'ord0000004821', amount: 6, status: 'pending' },
    { _id: 'p3', deliveryId: 'd1', orderId: 'ord0000004821', amount: 5, status: 'cancelled' },
  ], total: 3 } } }));
  render(<ConcluidaView ride={ride} points={null} onNext={jest.fn()} />);
  expect(await screen.findByText('R$ 9,60')).toBeInTheDocument();
  expect(screen.getByText('a liberar')).toBeInTheDocument();
});

test('pedaços com status diferentes: soma sem nota de status', async () => {
  get.mockImplementation(routes({ '/payouts/my': { data: { payouts: [
    { _id: 'p1', deliveryId: 'd1', amount: 3.6, status: 'pending' },
    { _id: 'p2', deliveryId: 'd1', amount: 6, status: 'released' },
  ], total: 2 } } }));
  render(<ConcluidaView ride={ride} points={null} onNext={jest.fn()} />);
  expect(await screen.findByText('R$ 9,60')).toBeInTheDocument();
  expect(screen.queryByText('a liberar')).not.toBeInTheDocument();
  expect(screen.queryByText('disponível para saque')).not.toBeInTheDocument();
});

test('trocar a corrida não mostra o valor da anterior', async () => {
  const { rerender } = render(<ConcluidaView ride={ride} points={null} onNext={jest.fn()} />);
  await screen.findByText('R$ 9,60');
  get.mockImplementation((url: string) => (url === '/payouts/my' ? new Promise(() => undefined) : routes()(url)));
  rerender(<ConcluidaView ride={{ ...ride, _id: 'd2', orderId: 'ord0000009999' }} points={null} onNext={jest.fn()} />);
  expect(screen.queryByText('R$ 9,60')).not.toBeInTheDocument();
});

test('GET /payouts/my rejeitado: Veja em Ganhos sem número', async () => {
  get.mockImplementation(routes({ '/payouts/my': new Error('boom') }));
  render(<ConcluidaView ride={ride} points={null} onNext={jest.fn()} />);
  expect(await screen.findByText('Veja em Ganhos')).toBeInTheDocument();
  expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
});

test('direto sem transfer da corrida: Veja em Ganhos', async () => {
  mockMode = { settlementMode: 'direto', loading: false, error: false };
  get.mockImplementation(routes({ '/motoboy/transfers': { data: { success: true, data: [{ id: 't9', orderId: 'outra', amount: 5, status: 'done', reason: 'delivery' }] } } }));
  render(<ConcluidaView ride={ride} points={null} onNext={jest.fn()} />);
  expect(await screen.findByText('Veja em Ganhos')).toBeInTheDocument();
  expect(screen.queryByText(/R\$/)).not.toBeInTheDocument();
});

test('modo com erro não chama payouts nem transfers', async () => {
  mockMode = { settlementMode: 'direto', loading: false, error: true };
  render(<ConcluidaView ride={ride} points={null} onNext={jest.fn()} />);
  await screen.findByText('Veja em Ganhos');
  expect(get).not.toHaveBeenCalledWith('/payouts/my', expect.anything());
  expect(get).not.toHaveBeenCalledWith('/motoboy/transfers');
  expect(get).not.toHaveBeenCalledWith('/motoboy/transfers', expect.anything());
});
