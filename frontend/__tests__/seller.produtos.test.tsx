import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import api from '../lib/api';
import { SELLER_ROUTES } from '../lib/sellerRoutes';
import { cssViolations } from './helpers/dsTokens';

const mockPush = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, asPath: '/seller/products', pathname: '/seller/products' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), put: jest.fn() } }));

import SellerProducts from '../pages/seller/products';

const get = api.get as jest.Mock;
const put = api.put as jest.Mock;
const products = [
  { _id: 'p1', name: 'Fone JBL Tune 520BT', price: 229.9, quantity: 12, image: 'f.jpg' },
  { _id: 'p2', name: 'Cabo USB-C 2 m', price: 39.9, quantity: 2, image: 'c.jpg' },
  { _id: 'p3', name: 'Smartwatch D20', price: 199, quantity: 0, image: 's.jpg', isActive: false },
  { _id: 'p4', name: 'Isqueiro Bic', price: 8.5, quantity: 30 },
];

beforeEach(() => {
  jest.clearAllMocks();
  get.mockImplementation((url: string) => {
    if (url === '/stores/dashboard') return Promise.resolve({ data: { store: { _id: 's1' }, products } });
    if (url === '/analytics/store/top-products') return Promise.resolve({ data: { products: [{ _id: 'p1', quantity: 31, revenue: 7126.9 }] } });
    return Promise.reject(new Error('n/a'));
  });
});

const rowOf = async (name: string) => (await screen.findByText(name)).closest('tr') as HTMLElement;

test('lista com preço, estoque, vendidos (30 dias) e o switch "À venda"', async () => {
  render(<SellerProducts />);
  const fone = await rowOf('Fone JBL Tune 520BT');
  expect(within(fone).getByText('R$ 229,90')).toBeInTheDocument();
  expect(within(fone).getByText('12 em estoque')).toBeInTheDocument();
  expect(await within(fone).findByText('31 vendidos')).toBeInTheDocument();
  expect(within(fone).getByRole('switch', { name: 'À venda' })).toHaveAttribute('aria-checked', 'true');
  expect(within(await rowOf('Cabo USB-C 2 m')).getByText('só 2 em estoque')).toBeInTheDocument();
  expect(within(await rowOf('Smartwatch D20')).getByRole('switch', { name: 'À venda' })).toHaveAttribute('aria-checked', 'false');
  expect(within(await rowOf('Isqueiro Bic')).getByRole('button', { name: 'Pôr foto' })).toBeInTheDocument();
});

test('pausar chama PUT /products/:id/active e mantém o switch', async () => {
  put.mockResolvedValue({ data: { success: true, data: { _id: 'p1', isActive: false } } });
  render(<SellerProducts />);
  const sw = within(await rowOf('Fone JBL Tune 520BT')).getByRole('switch', { name: 'À venda' });
  fireEvent.click(sw);
  await waitFor(() => expect(put).toHaveBeenCalledWith('/products/p1/active', { isActive: false }));
  expect(sw).toHaveAttribute('aria-checked', 'false');
});

test('erro ao pausar: o switch volta e aparece o aviso', async () => {
  put.mockRejectedValue({ response: { status: 500, data: { error: 'falhou' } } });
  render(<SellerProducts />);
  const sw = within(await rowOf('Fone JBL Tune 520BT')).getByRole('switch', { name: 'À venda' });
  fireEvent.click(sw);
  expect(await screen.findByText(/Não deu para pausar Fone JBL Tune 520BT/)).toBeInTheDocument();
  expect(sw).toHaveAttribute('aria-checked', 'true');
});

test('filtros de atenção com contadores; "Estoque baixo" abre Repor estoque', async () => {
  render(<SellerProducts />);
  await rowOf('Fone JBL Tune 520BT');
  fireEvent.click(screen.getByRole('button', { name: 'Esgotados 1' }));
  expect(screen.getByText('Smartwatch D20')).toBeInTheDocument();
  expect(screen.queryByText('Fone JBL Tune 520BT')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Sem foto 1' }));
  expect(screen.getByText('Isqueiro Bic')).toBeInTheDocument();
  // estoque baixo = à venda e com até 3 unidades (o Smartwatch pausado não conta), igual à tela Repor estoque
  fireEvent.click(screen.getByRole('button', { name: 'Estoque baixo 1' }));
  expect(mockPush).toHaveBeenCalledWith('/seller/estoque');
});

test('busca sem resultado oferece cadastrar', async () => {
  render(<SellerProducts />);
  await rowOf('Fone JBL Tune 520BT');
  fireEvent.change(screen.getByRole('searchbox', { name: 'Buscar produtos' }), { target: { value: 'xyz' } });
  expect(screen.getByText('Nada com "xyz".')).toBeInTheDocument();
});

test('tocar no nome abre a edição', async () => {
  render(<SellerProducts />);
  fireEvent.click(await screen.findByRole('link', { name: 'Fone JBL Tune 520BT' }));
  expect(screen.getByRole('link', { name: 'Fone JBL Tune 520BT' })).toHaveAttribute('href', SELLER_ROUTES.editarProduto('p1'));
});

test('sem produtos: convite para cadastrar', async () => {
  get.mockImplementation((url: string) => (url === '/stores/dashboard' ? Promise.resolve({ data: { store: { _id: 's1' }, products: [] } }) : Promise.reject(new Error('n/a'))));
  render(<SellerProducts />);
  expect(await screen.findByText('Cadastre seu primeiro produto')).toBeInTheDocument();
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'pages', 'seller', 'Produtos.module.css'), 'utf8'))).toEqual([]);
});
