import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';
import { validateProduct, buildProductFormData, EMPTY_VALUES, EMPTY_MEDIA } from '../components/seller/products/ProductForm';
import { cssViolations } from './helpers/dsTokens';

const mockPush = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), back: jest.fn(), query: {}, asPath: '/seller/create-product', pathname: '/seller/create-product' }) }));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { id: 'u1', activeRole: 'lojista', role: 'lojista', name: 'L' }, can: () => true, loading: false, permissionsLoading: false }),
}));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, children }: any) => <div><h1>{title}</h1>{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../hooks/useMyStore', () => ({ useMyStore: () => ({ store: { _id: 's1' }, products: [], loading: false }) }));
jest.mock('../hooks/useSync', () => ({ useCategories: jest.fn(() => ({ categories: [{ _id: 'c1', name: 'Eletrônicos' }], loading: false })) }));
jest.mock('../components/ImageCropUploader', () => () => null);
jest.mock('../components/RichTextEditor', () => () => null);
jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn() } }));

import CreateProduct from '../pages/seller/create-product';

const post = api.post as jest.Mock;
const fill = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

beforeEach(() => { jest.clearAllMocks(); window.alert = jest.fn(); });

describe('validateProduct', () => {
  it('nome, preço, preço antigo maior e estoque inteiro', () => {
    expect(validateProduct(EMPTY_VALUES)).toEqual({ name: 'Dê um nome ao produto', price: 'Informe o preço' });
    expect(validateProduct({ ...EMPTY_VALUES, name: 'Capa', price: '49,90', oldPrice: '40' }).oldPrice).toBe('Preço antigo precisa ser maior que o preço');
    expect(validateProduct({ ...EMPTY_VALUES, name: 'Capa', price: '49,90', quantity: '-1' }).quantity).toBe('Informe o estoque (0 ou mais)');
    expect(validateProduct({ ...EMPTY_VALUES, name: 'Capa', price: '49,90', oldPrice: '59,90', quantity: '15' })).toEqual({});
  });
  it('preço ambíguo (1.000, 49.999) falha fechado com erro no campo', () => {
    expect(validateProduct({ ...EMPTY_VALUES, name: 'Capa', price: '1.000' }).price).toMatch(/inválido/);
    expect(validateProduct({ ...EMPTY_VALUES, name: 'Capa', price: '49.999' }).price).toMatch(/inválido/);
  });
});

describe('buildProductFormData', () => {
  it('create: storeId, preço numérico e sem oldPrice vazio', () => {
    const f = buildProductFormData('create', { ...EMPTY_VALUES, name: ' Capa ', price: '49,90', quantity: '15', category: 'c1', subCategory: 'Capas' }, EMPTY_MEDIA, 's1');
    expect(f.get('storeId')).toBe('s1');
    expect(f.get('name')).toBe('Capa');
    expect(f.get('price')).toBe('49.9');
    expect(f.get('quantity')).toBe('15');
    expect(f.get('category')).toBe('c1');
    expect(f.get('subCategory')).toBe('Capas');
    expect(f.has('oldPrice')).toBe(false);
  });
  it('edit: oldPrice vazio remove o desconto e as fotos mantidas vão em keepImages', () => {
    const f = buildProductFormData('edit', { ...EMPTY_VALUES, name: 'Capa', price: '49,90', quantity: '3' }, { ...EMPTY_MEDIA, kept: ['http://x/a.jpg'], removeVideo: true });
    expect(f.get('oldPrice')).toBe('');
    expect(f.getAll('keepImages')).toEqual(['http://x/a.jpg']);
    expect(f.get('removeVideo')).toBe('true');
    expect(f.has('storeId')).toBe(false);
  });
});

test('erros inline e nenhum envio com o formulário vazio', () => {
  render(<CreateProduct />);
  fireEvent.click(screen.getByRole('button', { name: 'Publicar produto' }));
  expect(screen.getByText('Dê um nome ao produto')).toBeInTheDocument();
  expect(screen.getByText('Informe o preço')).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
  expect(window.alert).not.toHaveBeenCalled();
});

test('publica com um envio só e volta para Produtos', async () => {
  post.mockResolvedValue({ data: { _id: 'p9' } });
  render(<CreateProduct />);
  fill('Nome', 'Capa de silicone iPhone 15');
  fill('Preço', '49,90');
  fill('Estoque', '15');
  fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: 'c1' } });
  fireEvent.click(screen.getByRole('button', { name: 'Publicar produto' }));
  await waitFor(() => expect(post).toHaveBeenCalledTimes(1));
  const [url, form, cfg] = post.mock.calls[0];
  expect(url).toBe('/products');
  expect(form.get('storeId')).toBe('s1');
  expect(form.get('price')).toBe('49.9');
  expect(form.get('category')).toBe('c1');
  expect(cfg).toEqual({ headers: { 'Content-Type': 'multipart/form-data' } });
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/seller/products'));
});

test('falha no envio mantém o que foi digitado e oferece tentar de novo', async () => {
  post.mockRejectedValue({ response: { status: 400, data: { error: 'storeId, name, and price são obrigatórios' } } });
  render(<CreateProduct />);
  fill('Nome', 'Capa');
  fill('Preço', '49,90');
  fireEvent.click(screen.getByRole('button', { name: 'Publicar produto' }));
  expect(await screen.findByText('Não deu para publicar')).toBeInTheDocument();
  expect(screen.getByLabelText('Nome')).toHaveValue('Capa');
  expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
});

test('"+ Nova categoria" cria pela API e já seleciona', async () => {
  post.mockResolvedValue({ data: { _id: 'c2', name: 'Capas' } });
  render(<CreateProduct />);
  fireEvent.change(screen.getByLabelText('Categoria'), { target: { value: '__nova__' } });
  fill('Nome da nova categoria', 'Capas');
  fireEvent.click(screen.getByRole('button', { name: 'Criar categoria' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/categories', { storeId: 's1', name: 'Capas' }));
  await waitFor(() => expect(screen.getByLabelText('Categoria')).toHaveValue('c2'));
});

test('preço ambíguo não é enviado', () => {
  render(<CreateProduct />);
  fill('Nome', 'Capa');
  fill('Preço', '1.000');
  fireEvent.click(screen.getByRole('button', { name: 'Publicar produto' }));
  expect(screen.getByText(/Preço inválido/)).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});

test('prévia do card do cliente', () => {
  render(<CreateProduct />);
  fill('Nome', 'Capa de silicone');
  expect(screen.getByText('Assim o cliente vê')).toBeInTheDocument();
  expect(screen.getAllByText('Capa de silicone').length).toBeGreaterThan(0);
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'components', 'seller', 'products', 'ProductForm.module.css'), 'utf8'))).toEqual([]);
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'pages', 'seller', 'ProdutoPagina.module.css'), 'utf8'))).toEqual([]);
});
