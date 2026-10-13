import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';
import { cssViolations } from './helpers/dsTokens';

const mockPush = jest.fn();
let mockQuery: any = { edit: 'p1' };
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), query: mockQuery, asPath: '/seller/edit-product?edit=p1', pathname: '/seller/edit-product' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
const product = { _id: 'p1', name: 'Fone JBL Tune 520BT', price: 229.9, oldPrice: 289.9, quantity: 12, categoryId: 'c1', images: ['f1.jpg'], isActive: true };
jest.mock('../hooks/useMyStore', () => ({ useMyStore: () => ({ store: { _id: 's1' }, products: [product], loading: false }) }));
jest.mock('../hooks/useSync', () => ({ useCategories: jest.fn(() => ({ categories: [{ _id: 'c1', name: 'Eletrônicos' }], loading: false })) }));
jest.mock('../components/ImageCropUploader', () => () => null);
jest.mock('../components/RichTextEditor', () => () => null);
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), put: jest.fn(), delete: jest.fn(), post: jest.fn() } }));

import EditProduct from '../pages/seller/edit-product';

const get = api.get as jest.Mock;
const put = api.put as jest.Mock;
const del = api.delete as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockQuery = { edit: 'p1' };
  get.mockImplementation((url: string) => {
    if (url === '/analytics/store/top-products') return Promise.resolve({ data: { products: [{ _id: 'p1', quantity: 30, revenue: 6897 }] } });
    if (url === '/products/p1/reviews') return Promise.resolve({ data: { average: 4.7, count: 12, reviews: [] } });
    return Promise.reject(new Error('n/a'));
  });
});

test('carrega o produto do catálogo do dono e mostra os números', async () => {
  render(<EditProduct />);
  expect(screen.getByRole('heading', { name: 'Fone JBL Tune 520BT' })).toBeInTheDocument();
  expect(screen.getByLabelText('Preço')).toHaveValue('229,9');
  expect(screen.getByLabelText('Preço antigo')).toHaveValue('289,9');
  expect(screen.getByLabelText('Categoria')).toHaveValue('c1');
  expect(await screen.findByText('30')).toBeInTheDocument();
  expect(await screen.findByText('★ 4,7')).toBeInTheDocument();
  expect(screen.getByText('12 notas')).toBeInTheDocument();
  expect(await screen.findByText('acaba em ~12 dias no ritmo atual')).toBeInTheDocument();
});

test('"À venda" salva na hora pelo endpoint de pausa', async () => {
  put.mockResolvedValue({ data: { success: true, data: { ...product, isActive: false } } });
  render(<EditProduct />);
  fireEvent.click(screen.getByRole('switch', { name: 'À venda' }));
  await waitFor(() => expect(put).toHaveBeenCalledWith('/products/p1/active', { isActive: false }));
});

test('"À venda" volta ao estado anterior se o servidor recusar', async () => {
  put.mockRejectedValue({ response: { data: { error: { message: 'Sem permissão' } } } });
  render(<EditProduct />);
  const sw = screen.getByRole('switch', { name: 'À venda' });
  fireEvent.click(sw);
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(screen.getByRole('switch', { name: 'À venda' })).toBeChecked();
});

test('salvar envia o multipart com keepImages e não salva com preço antigo menor', async () => {
  put.mockResolvedValue({ data: {} });
  render(<EditProduct />);
  fireEvent.change(screen.getByLabelText('Preço antigo'), { target: { value: '100' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  expect(screen.getByText('Preço antigo precisa ser maior que o preço')).toBeInTheDocument();
  expect(put).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Preço antigo'), { target: { value: '' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar alterações' }));
  await waitFor(() => expect(put).toHaveBeenCalledTimes(1));
  const [url, form] = put.mock.calls[0];
  expect(url).toBe('/products/p1');
  expect(form.get('oldPrice')).toBe('');
  expect(form.getAll('keepImages')).toHaveLength(1);
  expect(await screen.findByText('Alterações salvas. O preço novo vale para os próximos pedidos.')).toBeInTheDocument();
});

test('excluir pede confirmação num sheet', async () => {
  del.mockResolvedValue({ data: { ok: true } });
  const confirmSpy = jest.spyOn(window, 'confirm');
  render(<EditProduct />);
  fireEvent.click(screen.getByRole('button', { name: 'Excluir produto' }));
  expect(screen.getByText('Excluir Fone JBL Tune 520BT?')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Excluir de vez' }));
  await waitFor(() => expect(del).toHaveBeenCalledWith('/products/p1'));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/seller/products'));
  expect(confirmSpy).not.toHaveBeenCalled();
  confirmSpy.mockRestore();
});

test('erro do servidor ao excluir aparece no sheet e não navega', async () => {
  del.mockRejectedValue({ response: { data: { error: { message: 'Produto tem pedidos em andamento' } } } });
  render(<EditProduct />);
  fireEvent.click(screen.getByRole('button', { name: 'Excluir produto' }));
  fireEvent.click(screen.getByRole('button', { name: 'Excluir de vez' }));
  expect(await screen.findByRole('alert')).toBeInTheDocument();
  expect(mockPush).not.toHaveBeenCalled();
});

test('produto que não é da loja', () => {
  mockQuery = { edit: 'zzz' };
  render(<EditProduct />);
  expect(screen.getByText('Produto não encontrado')).toBeInTheDocument();
});

test('sem style inline e CSS só com tokens', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'pages', 'seller', 'edit-product.tsx'), 'utf8');
  expect(src).not.toMatch(/style=\{\{/);
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'pages', 'seller', 'ProdutoPagina.module.css'), 'utf8'))).toEqual([]);
});

test('produto não encontrado: "Voltar para Produtos" com estilo de link, como "Ver pedidos" no Pedido (V13)', () => {
  mockQuery = { edit: 'zzz' };
  render(<EditProduct />);
  const link = screen.getByRole('link', { name: 'Voltar para Produtos' });
  expect(link).toHaveAttribute('href', '/seller/products');
  expect(link).toHaveClass('link');
  const css = fs.readFileSync(path.join(__dirname, '..', 'pages', 'seller', 'ProdutoPagina.module.css'), 'utf8');
  expect(css).toMatch(/\.link\s*\{[^}]*color:\s*var\(--color-text-link\)/);
});
