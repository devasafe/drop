import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ComoCalculamos } from '../components/motoboy/ganhos/ComoCalculamos';
import ComoCalculamosPage from '../pages/motoboy/ganhos/como-calculamos';
import api from '../lib/api';
import { cssViolations } from './helpers/dsTokens';

const mockPush = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/motoboy/ganhos/como-calculamos', asPath: '/motoboy/ganhos/como-calculamos' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/motoboy/panel/MotoboyShell', () => {
  const Shell = ({ title, children }: any) => <div><h1>{title}</h1>{children}</div>;
  return { __esModule: true, default: Shell, MotoboyShell: Shell };
});
let mockSaas: any;
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));

const get = api.get as jest.Mock;
const CFG = {
  motoboyCutPerDelivery: '5.00', motoboyCutPerKm: '1.00', motoboyCommissionPercent: '20.00', motoboyMinimumWithdraw: '50.00',
  customerAbsentWaitMin: 15, lateCancellationMotoboyShare: '50.00', transferBlockHours: 24, autoApprovePayouts: false, autoApproveWithdrawals: false,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockSaas = { settlementMode: 'custodia', loading: false, error: false, retry: jest.fn() };
  get.mockResolvedValue({ data: CFG });
});

test('a conta com os números da plataforma e o exemplo de 3,4 km', async () => {
  render(<ComoCalculamos />);
  const conta = await screen.findByRole('region', { name: 'A conta de cada corrida' });
  expect(conta).toHaveTextContent('Base por entrega');
  expect(conta).toHaveTextContent('R$ 5,00');
  expect(conta).toHaveTextContent('+ R$ 1,00 por km · exemplo de 3,4 km');
  expect(conta).toHaveTextContent('R$ 3,40');
  expect(conta).toHaveTextContent('Taxa que o cliente paga');
  expect(conta).toHaveTextContent('R$ 8,40');
  expect(conta).toHaveTextContent('Você fica com 80%');
  expect(conta).toHaveTextContent('R$ 6,72');
});

test('se o admin muda a regra, a tela muda junto', async () => {
  get.mockResolvedValue({ data: { ...CFG, motoboyCutPerDelivery: 6, motoboyCutPerKm: 2, motoboyCommissionPercent: 25 } });
  render(<ComoCalculamos />);
  const conta = await screen.findByRole('region', { name: 'A conta de cada corrida' });
  expect(conta).toHaveTextContent('R$ 12,80');
  expect(conta).toHaveTextContent('Você fica com 75%');
  expect(conta).toHaveTextContent('R$ 9,60');
});

test('caminho do dinheiro na custódia, com o mínimo da config', async () => {
  render(<ComoCalculamos />);
  const caminho = await screen.findByRole('region', { name: 'O caminho do dinheiro' });
  expect(within(caminho).getByText('A equipe libera')).toBeInTheDocument();
  await waitFor(() => expect(within(caminho).getByText('a partir de R$ 50,00 você saca')).toBeInTheDocument());
  expect(screen.getByRole('region', { name: 'Como sacar' })).toBeInTheDocument();
});

test('liberação automática: "Libera logo depois da entrega"', async () => {
  get.mockResolvedValue({ data: { ...CFG, autoApprovePayouts: true } });
  render(<ComoCalculamos />);
  expect(await screen.findByText('Libera logo depois da entrega')).toBeInTheDocument();
});

test('quando algo dá errado, com a espera e a parte do cancelamento da config', async () => {
  render(<ComoCalculamos />);
  expect(await screen.findByText('Espere 15 min a partir da retirada e encerre como ausente. O valor aparece no detalhe da corrida.')).toBeInTheDocument();
  expect(screen.getByText('Você fica com 50% da taxa de cancelamento.')).toBeInTheDocument();
  expect(screen.getByText('O valor fica bloqueado até a análise da equipe.')).toBeInTheDocument();
});

test('regras com erro: aviso, Tentar de novo e nenhum número presumido', async () => {
  get.mockRejectedValueOnce(new Error('rede'));
  render(<ComoCalculamos />);
  expect(await screen.findByText('Não carregamos os valores de agora')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'A conta de cada corrida' })).not.toBeInTheDocument();
  expect(screen.queryByText(/R\$ 5,00/)).not.toBeInTheDocument();
  get.mockResolvedValueOnce({ data: CFG });
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(await screen.findByRole('region', { name: 'A conta de cada corrida' })).toBeInTheDocument();
});

test('direto: a loja envia o Pix, sem "Como sacar"', async () => {
  mockSaas = { ...mockSaas, settlementMode: 'direto' };
  render(<ComoCalculamos />);
  expect(await screen.findByText('A loja envia o Pix')).toBeInTheDocument();
  expect(screen.queryByRole('region', { name: 'Como sacar' })).not.toBeInTheDocument();
});

test('modo com erro: sem caminho do dinheiro (não presume custódia)', async () => {
  mockSaas = { ...mockSaas, error: true };
  render(<ComoCalculamos />);
  await screen.findByRole('region', { name: 'A conta de cada corrida' });
  expect(screen.queryByRole('region', { name: 'O caminho do dinheiro' })).not.toBeInTheDocument();
  expect(screen.getByRole('region', { name: 'A conta de cada corrida' })).not.toHaveTextContent('Você fica com');
});

test('exemplo rotulado como ilustrativo, sem prometer valor', async () => {
  render(<ComoCalculamos />);
  const conta = await screen.findByRole('region', { name: 'A conta de cada corrida' });
  expect(within(conta).getByText(/exemplo ilustrativo/i)).toBeInTheDocument();
});

test('K6 direto sem percentual na config: só texto, sem "Você fica com" nem 80%', async () => {
  mockSaas = { ...mockSaas, settlementMode: 'direto' };
  render(<ComoCalculamos />);
  const conta = await screen.findByRole('region', { name: 'A conta de cada corrida' });
  expect(conta).toHaveTextContent('Base por entrega');
  expect(conta).not.toHaveTextContent('Você fica com');
  expect(conta).not.toHaveTextContent('80%');
  expect(conta).not.toHaveTextContent('R$ 6,72');
  expect(conta).toHaveTextContent('sua parte da taxa');
});

test('K6 direto com percentual na config: usa o percentual do direto, nunca o da custódia', async () => {
  mockSaas = { ...mockSaas, settlementMode: 'direto' };
  get.mockResolvedValue({ data: { ...CFG, motoboyShareDirect: '90.00' } });
  render(<ComoCalculamos />);
  const conta = await screen.findByRole('region', { name: 'A conta de cada corrida' });
  expect(conta).toHaveTextContent('Você fica com 90%');
  expect(conta).toHaveTextContent('R$ 7,56');
  expect(conta).not.toHaveTextContent('80%');
});

test('K6 modo carregando: sem a linha "Você fica com"', async () => {
  mockSaas = { ...mockSaas, loading: true };
  render(<ComoCalculamos />);
  const conta = await screen.findByRole('region', { name: 'A conta de cada corrida' });
  expect(conta).not.toHaveTextContent('Você fica com');
});

test('chave Pix leva a Dados de recebimento', async () => {
  render(<ComoCalculamos />);
  fireEvent.click(await screen.findByRole('button', { name: /Cadastre sua chave Pix/ }));
  expect(mockPush).toHaveBeenCalledWith('/dados-recebimento');
});

test('página: título "Como você ganha"', () => {
  render(<ComoCalculamosPage />);
  expect(screen.getByRole('heading', { name: 'Como você ganha' })).toBeInTheDocument();
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'components', 'motoboy', 'ganhos', 'ComoCalculamos.module.css'), 'utf8'))).toEqual([]);
});
