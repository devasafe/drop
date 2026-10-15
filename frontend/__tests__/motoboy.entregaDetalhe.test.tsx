/**
 * D2 · P4.5 — /motoboy/entregas/[id] (protótipo "Detalhe da entrega"). Substitui a corrida concluída
 * da página antiga: horários reais, conta da nota fiscal (números do servidor), avaliação do cliente,
 * nota fiscal e suporte.
 */
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { EntregaDetail } from '../components/motoboy/entregas/EntregaDetail';
import MotoboyEntregaPage from '../pages/motoboy/entregas/[id]';
import api from '../lib/api';
import { cssViolations } from './helpers/dsTokens';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockQuery: any = { id: 'd1' };
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, query: mockQuery, pathname: '/motoboy/entregas/[id]', asPath: '/motoboy/entregas/d1' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
jest.mock('../components/map/RouteThumbnail', () => ({ __esModule: true, default: () => <div data-testid="mapa" />, RouteThumbnail: () => <div data-testid="mapa" /> }));
const mockSocket = { on: () => () => undefined, onReconnect: () => () => undefined, isConnected: true };
jest.mock('../contexts/SocketContext', () => ({ useSocket: () => mockSocket }));
let mockSaas: any;
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
jest.mock('../hooks/useCustodyLeftoverState', () => ({ useCustodyLeftoverState: () => ({ hasLeftover: false, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));

const get = api.get as jest.Mock;
const DELIVERED = {
  _id: 'd1', orderId: 'ord0004815', status: 'delivered', distance: 2.1,
  createdAt: '2026-10-14T12:50:00-03:00',
  assignedAt: '2026-10-14T12:51:00-03:00', pickedAt: '2026-10-14T12:58:00-03:00', deliveredAt: '2026-10-14T13:10:00-03:00',
  cancelledAt: null, cancellationCompensation: null, rating: null, comment: null,
  storeObj: { name: 'Papel & Cia', address: 'R. Cardeal Arcoverde, 1200' }, customerObj: { name: 'Pedro Martins' },
  deliveryAddress: 'R. Fradique Coutinho, 344', pickupLat: -23.56, pickupLng: -46.68, deliveryLat: -23.55, deliveryLng: -46.69,
};
const INVOICE = { id: 'inv1', invoiceNumber: 'NFS-000123', status: 'issued', deliveryFee: '7.10', appCommission: '1.42', commissionPercent: '20.00', motoboyAmount: '5.68', issuedAt: '2026-10-14T13:10:00-03:00' };
const FAIL500 = { response: { status: 500, data: { error: 'x' } } };
const NOT_FOUND = { response: { status: 404, data: { error: 'Nota nao encontrada para este pedido' } } };
const PAYOUTS = { payouts: [{ _id: 'p1', deliveryId: 'd1', orderId: 'ord0004815', amount: 5.68, status: 'pending', createdAt: '2026-10-14T13:10:00-03:00' }], total: 1 };

function mockApi({ delivery = DELIVERED as any, invoice = INVOICE as any, payouts = PAYOUTS as any } = {}) {
  get.mockImplementation((u: string) => {
    if (u === '/deliveries/d1') return delivery && delivery.response ? Promise.reject(delivery) : Promise.resolve({ data: delivery });
    if (u === '/invoices/by-order/ord0004815') return invoice && invoice.response ? Promise.reject(invoice) : Promise.resolve({ data: invoice });
    if (u === '/payouts/my') return payouts && payouts.response ? Promise.reject(payouts) : Promise.resolve({ data: payouts });
    return Promise.reject(new Error(`n/a ${u}`));
  });
}
const calls = (u: string) => get.mock.calls.filter((c) => c[0] === u).length;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = { id: 'd1' };
  mockSaas = { settlementMode: 'custodia', loading: false, error: false, retry: jest.fn() };
  mockApi();
});

test('topo e linha do tempo com os horários reais', async () => {
  render(<EntregaDetail id="d1" />);
  expect(await screen.findByRole('heading', { name: 'Corrida #004815' })).toBeInTheDocument();
  expect(screen.getByText('Entregue')).toBeInTheDocument();
  expect(screen.getByText('Aceitou a corrida')).toBeInTheDocument();
  expect(screen.getByText('12:51')).toBeInTheDocument();
  expect(screen.getByText('Retirou na Papel & Cia')).toBeInTheDocument();
  expect(screen.getByText('12:58')).toBeInTheDocument();
  expect(screen.getByText('Entregou para Pedro M.')).toBeInTheDocument();
  expect(screen.getByText('13:10')).toBeInTheDocument();
  expect(screen.getByTestId('mapa')).toBeInTheDocument();
});

test('conta do ganho é a da nota (números do servidor) e o badge vem do repasse', async () => {
  render(<EntregaDetail id="d1" />);
  const conta = await screen.findByRole('region', { name: 'Seu ganho' });
  await waitFor(() => expect(conta).toHaveTextContent('Você recebe'));
  expect(conta).toHaveTextContent('Taxa de entrega');
  expect(conta).toHaveTextContent('R$ 7,10');
  expect(conta).toHaveTextContent('Parte da DROP (20%)');
  expect(conta).toHaveTextContent('− R$ 1,42');
  expect(conta).toHaveTextContent('R$ 5,68');
  await waitFor(() => expect(conta).toHaveTextContent('A liberar'));
});

test('o dinheiro da corrida é lido com a janela do createdAt da entrega', async () => {
  render(<EntregaDetail id="d1" />);
  const conta = await screen.findByRole('region', { name: 'Seu ganho' });
  await waitFor(() => expect(conta).toHaveTextContent('A liberar'));
  expect(calls('/payouts/my')).toBe(1);
});

test('repasse de outra corrida não vira badge desta', async () => {
  mockApi({ payouts: { payouts: [{ _id: 'p9', deliveryId: 'outra', orderId: 'ordOUTRA', amount: 9, status: 'released', createdAt: '2026-10-14T13:10:00-03:00' }], total: 1 } });
  render(<EntregaDetail id="d1" />);
  const conta = await screen.findByRole('region', { name: 'Seu ganho' });
  await waitFor(() => expect(conta).toHaveTextContent('Você recebe'));
  await waitFor(() => expect(calls('/payouts/my')).toBe(1));
  expect(conta).not.toHaveTextContent('Liberado');
  expect(conta).not.toHaveTextContent('A liberar');
});

test('nunca calcula: a nota com números "fora da regra" aparece como veio', async () => {
  mockApi({ invoice: { ...INVOICE, deliveryFee: '10.00', appCommission: '2.23', motoboyAmount: '7.77' } });
  render(<EntregaDetail id="d1" />);
  const conta = await screen.findByRole('region', { name: 'Seu ganho' });
  await waitFor(() => expect(conta).toHaveTextContent('R$ 7,77'));
  expect(conta).not.toHaveTextContent('R$ 8,00');
});

test('direto (sem parte da DROP): a linha da comissão some', async () => {
  mockApi({ invoice: { ...INVOICE, appCommission: '0.00', commissionPercent: '0.00', motoboyAmount: '7.10' } });
  render(<EntregaDetail id="d1" />);
  const conta = await screen.findByRole('region', { name: 'Seu ganho' });
  await waitFor(() => expect(conta).toHaveTextContent('Você recebe'));
  expect(conta).not.toHaveTextContent('Parte da DROP');
});

test('sem nota (404): sem conta inventada', async () => {
  mockApi({ invoice: NOT_FOUND });
  render(<EntregaDetail id="d1" />);
  expect(await screen.findByText('A conta aparece quando a nota da corrida for emitida.')).toBeInTheDocument();
  expect(screen.queryByText('Você recebe')).not.toBeInTheDocument();
  expect(screen.queryByText(/R\$ 0,00/)).not.toBeInTheDocument();
  expect(screen.queryByText('Nota fiscal da corrida')).not.toBeInTheDocument();
});

test('nota cancelada: não mostra a conta nem o link da nota', async () => {
  mockApi({ invoice: { ...INVOICE, status: 'cancelled' } });
  render(<EntregaDetail id="d1" />);
  expect(await screen.findByText('A nota desta corrida foi cancelada.')).toBeInTheDocument();
  expect(screen.queryByText('Você recebe')).not.toBeInTheDocument();
  expect(screen.queryByText('Nota fiscal da corrida')).not.toBeInTheDocument();
});

test('erro ao ler a nota: aviso com Tentar de novo, que relê só a nota', async () => {
  mockApi({ invoice: FAIL500 });
  render(<EntregaDetail id="d1" />);
  expect(await screen.findByText('Não carregamos a conta desta corrida.')).toBeInTheDocument();
  const before = calls('/deliveries/d1');
  mockApi();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByText('Você recebe')).toBeInTheDocument();
  expect(calls('/deliveries/d1')).toBe(before);
  expect(screen.getByText('Aceitou a corrida')).toBeInTheDocument();
});

test('nota fiscal e suporte', async () => {
  render(<EntregaDetail id="d1" />);
  fireEvent.click(await screen.findByRole('button', { name: /Nota fiscal da corrida/ }));
  expect(mockPush).toHaveBeenCalledWith('/invoice/inv1');
  fireEvent.click(screen.getByRole('button', { name: /Algo errado com esta corrida/ }));
  expect(mockPush).toHaveBeenCalledWith('/suporte');
});

test('avaliação do cliente: nota e comentário da própria corrida', async () => {
  mockApi({ delivery: { ...DELIVERED, rating: 5, comment: 'Chegou rapidinho, obrigado!' } });
  render(<EntregaDetail id="d1" />);
  const aval = await screen.findByRole('region', { name: 'Avaliação do cliente' });
  expect(aval).toHaveTextContent('5,0');
  expect(aval).toHaveTextContent('Chegou rapidinho, obrigado!');
});

test('avaliação sem comentário mostra só a nota', async () => {
  mockApi({ delivery: { ...DELIVERED, rating: 4, comment: null } });
  render(<EntregaDetail id="d1" />);
  const aval = await screen.findByRole('region', { name: 'Avaliação do cliente' });
  expect(aval).toHaveTextContent('4,0');
});

test('entregue sem avaliação: avisa que o cliente ainda não avaliou (sem nota inventada)', async () => {
  render(<EntregaDetail id="d1" />);
  const aval = await screen.findByRole('region', { name: 'Avaliação do cliente' });
  expect(aval).toHaveTextContent('O cliente ainda não avaliou esta entrega.');
  expect(aval).not.toHaveTextContent('★');
});

test('cancelada com compensação: linha do tempo para no cancelamento e mostra o valor do servidor', async () => {
  mockApi({
    delivery: { ...DELIVERED, status: 'cancelled', pickedAt: null, deliveredAt: null, cancelledAt: '2026-10-14T12:55:00-03:00', cancellationCompensation: 2.84 },
    invoice: NOT_FOUND,
  });
  render(<EntregaDetail id="d1" />);
  expect(await screen.findByText('Corrida cancelada')).toBeInTheDocument();
  expect(screen.getByText('Cancelada')).toBeInTheDocument();
  expect(screen.queryByText(/Entregou para/)).not.toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Avaliação do cliente' })).not.toBeInTheDocument();
  const conta = await screen.findByRole('region', { name: 'Seu ganho' });
  await waitFor(() => expect(conta).toHaveTextContent('Compensação do cancelamento'));
  expect(conta).toHaveTextContent('R$ 2,84');
});

test('cancelada sem compensação: sem linha de valor', async () => {
  mockApi({ delivery: { ...DELIVERED, status: 'cancelled', deliveredAt: null, cancelledAt: '2026-10-14T12:55:00-03:00', cancellationCompensation: null }, invoice: NOT_FOUND });
  render(<EntregaDetail id="d1" />);
  expect(await screen.findByText('Corrida cancelada sem compensação.')).toBeInTheDocument();
  expect(screen.queryByText('Compensação do cancelamento')).not.toBeInTheDocument();
  expect(screen.queryByText(/R\$ 0,00/)).not.toBeInTheDocument();
});

test('corrida ainda ativa vai para a tela da corrida', async () => {
  mockApi({ delivery: { ...DELIVERED, status: 'picked' } });
  render(<EntregaDetail id="d1" />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/motoboy/corrida/d1'));
});

test('corrida que não é sua (403/404): não encontrada', async () => {
  mockApi({ delivery: { response: { status: 403, data: { error: 'Forbidden' } } } });
  render(<EntregaDetail id="d1" />);
  expect(await screen.findByText('Corrida não encontrada')).toBeInTheDocument();
});

test('erro de rede no detalhe: erro com Tentar de novo, que relê', async () => {
  mockApi({ delivery: FAIL500 });
  render(<EntregaDetail id="d1" />);
  expect(await screen.findByText('Não carregamos esta corrida')).toBeInTheDocument();
  mockApi();
  fireEvent.click(screen.getByRole('button', { name: /Tentar de novo/ }));
  expect(await screen.findByText('Aceitou a corrida')).toBeInTheDocument();
});

test('a página monta o detalhe com o id da URL', async () => {
  render(<MotoboyEntregaPage />);
  expect(await screen.findByRole('heading', { name: 'Corrida #004815' })).toBeInTheDocument();
});

test('a tela não calcula ganho: sem fee × 0,8 e sem moneyFor (só moneyOf)', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'components', 'motoboy', 'entregas', 'EntregaDetail.tsx'), 'utf8');
  expect(src).not.toMatch(/0\.8\b/);
  expect(src).not.toMatch(/moneyFor\(/);
  expect(src).toMatch(/moneyOf\(/);
});

test('CSS só com tokens', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'components', 'motoboy', 'entregas', 'EntregaDetail.module.css'), 'utf8');
  expect(cssViolations(css)).toEqual([]);
});
