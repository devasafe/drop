import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, within, act } from '@testing-library/react';
import api from '../lib/api';
import { cssViolations } from './helpers/dsTokens';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), back: jest.fn(), query: {}, asPath: '/seller/estoque', pathname: '/seller/estoque' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, children }: any) => <div><h1>{title}</h1>{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
let mockProducts: any[] = [];
jest.mock('../hooks/useMyStore', () => ({ useMyStore: () => ({ store: { _id: 's1' }, products: mockProducts, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), patch: jest.fn() } }));

import EstoquePage from '../pages/seller/estoque';

const get = api.get as jest.Mock;
const patch = api.patch as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockProducts = [
    { _id: 'p1', name: 'Smartwatch D20', quantity: 0 },
    { _id: 'p2', name: 'Cabo USB-C 2 m', quantity: 2 },
    { _id: 'p3', name: 'Caneta gel azul', quantity: 1 },
    { _id: 'p4', name: 'Fone', quantity: 40 },
    { _id: 'p5', name: 'Pausado', quantity: 0, isActive: false },
  ];
  get.mockResolvedValue({ data: { products: [{ _id: 'p1', quantity: 30 }, { _id: 'p2', quantity: 60 }, { _id: 'p3', quantity: 10 }] } });
});

test('lista só o que está acabando, ordenado pelo que acaba primeiro', async () => {
  render(<EstoquePage />);
  await screen.findByText('2 un. · acaba amanhã');
  const names = screen.getAllByRole('row').slice(1).map((r) => within(r).getAllByRole('cell')[0].textContent);
  expect(names[0]).toMatch('Smartwatch D20');
  expect(names[1]).toMatch('Cabo USB-C 2 m');
  expect(names[2]).toMatch('Caneta gel azul');
  expect(screen.queryByText('Fone')).not.toBeInTheDocument();
  expect(screen.queryByText('Pausado')).not.toBeInTheDocument();
  expect(screen.getByText('Esgotado · 1 venda/dia')).toBeInTheDocument();
});

const settle = () => act(async () => {});

test('salva só o que mudou, num PATCH em lote', async () => {
  patch.mockResolvedValue({ data: { success: true, data: { updated: 2 } } });
  render(<EstoquePage />);
  await settle();
  fireEvent.change(screen.getByLabelText('Novo estoque de Smartwatch D20'), { target: { value: '10' } });
  fireEvent.change(screen.getByLabelText('Novo estoque de Cabo USB-C 2 m'), { target: { value: '22' } });
  const btn = screen.getByRole('button', { name: 'Salvar 2 alterações' });
  fireEvent.click(btn);
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/products/stock', { storeId: 's1', items: [{ productId: 'p1', stock: 10 }, { productId: 'p2', stock: 22 }] }));
  expect(await screen.findByText('Estoque salvo: 2 produtos.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Salvar 0 alterações' })).toBeDisabled();
});

test('falha mantém os números e oferece tentar de novo', async () => {
  patch.mockRejectedValue({ response: { status: 500, data: { error: 'erro' } } });
  render(<EstoquePage />);
  await settle();
  fireEvent.change(screen.getByLabelText('Novo estoque de Smartwatch D20'), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 alteração' }));
  expect(await screen.findByText('Não deu para salvar')).toBeInTheDocument();
  expect(screen.getByLabelText('Novo estoque de Smartwatch D20')).toHaveValue('10');
});

test('falha no lote relê o estoque do servidor', async () => {
  patch.mockRejectedValue({ response: { status: 500, data: { error: 'erro' } } });
  render(<EstoquePage />);
  await settle();
  fireEvent.change(screen.getByLabelText('Novo estoque de Cabo USB-C 2 m'), { target: { value: '10' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar 1 alteração' }));
  await screen.findByText('Não deu para salvar');
  expect(get).toHaveBeenCalledWith('/stores/dashboard');
});

test('número inválido não conta como alteração', async () => {
  render(<EstoquePage />);
  await settle();
  fireEvent.change(screen.getByLabelText('Novo estoque de Smartwatch D20'), { target: { value: '-3' } });
  expect(screen.getByRole('button', { name: 'Salvar 0 alterações' })).toBeDisabled();
  expect(screen.getByText('Use 0 ou mais')).toBeInTheDocument();
});

test('nada acabando: estoque em dia', async () => {
  mockProducts = [{ _id: 'p4', name: 'Fone', quantity: 40 }];
  render(<EstoquePage />);
  await settle();
  expect(screen.getByText('Estoque em dia')).toBeInTheDocument();
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'pages', 'seller', 'Estoque.module.css'), 'utf8'))).toEqual([]);
});
