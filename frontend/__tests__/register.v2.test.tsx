import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';

const push = jest.fn();
const replace = jest.fn();
let mockQuery: Record<string, string> = {};
const login = jest.fn(async () => ({}));
jest.mock('next/router', () => ({ useRouter: () => ({ push, replace, back: jest.fn(), query: mockQuery }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ login }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { post: jest.fn() } }));
const post = api.post as jest.Mock;

import RegisterPage from '../pages/register';

beforeEach(() => { push.mockClear(); replace.mockClear(); login.mockClear(); post.mockReset(); mockQuery = {}; });

function preencher() {
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Ana Souza' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'ana@email.com' } });
  fireEvent.change(screen.getByLabelText('Celular'), { target: { value: '11987654321' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'abcdefgh12' } });
}

// Ajuste (fix/cadastro-papel): o teste dizia "sem tipo de conta". O seletor voltou porque nenhum link
// do site levava a ?papel=lojista nem ao cadastro do motoboy; o cliente continua sem mandar role.
test('cliente: 4 campos + aceite, "Comprar" escolhido; manda sem role e vai verificar', async () => {
  post.mockResolvedValue({ data: { id: 'u1' } });
  render(<RegisterPage />);
  expect(screen.getByRole('heading', { name: 'Criar conta' })).toBeInTheDocument();
  expect(screen.getByRole('tab', { name: 'Comprar' })).toHaveAttribute('aria-selected', 'true');
  preencher();
  expect(screen.getByText('Boa: 10 caracteres com número')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  await waitFor(() => expect(push).toHaveBeenCalledWith('/conta?secao=verificacao'));
  expect(post.mock.calls[0][0]).toBe('/auth/register');
  const body = post.mock.calls[0][1];
  expect(body).toMatchObject({ name: 'Ana Souza', email: 'ana@email.com', telefone: '11987654321', password: 'abcdefgh12' });
  expect(body).not.toHaveProperty('role');
  expect(login).toHaveBeenCalledWith('ana@email.com', 'abcdefgh12');
});

test('sem aceite: diz o que falta e não chama a API', () => {
  render(<RegisterPage />);
  preencher();
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  expect(screen.getByText('Aceite os Termos de Uso e a Política de Privacidade para continuar.')).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});

test('e-mail já usado: oferece entrar levando o next, e os campos ficam', async () => {
  mockQuery = { next: '/sacola' };
  post.mockRejectedValue({ response: { status: 409, data: { error: 'User already exists' } } });
  render(<RegisterPage />);
  preencher();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  expect(await screen.findByText('Esse e-mail já tem conta.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(push).toHaveBeenCalledWith('/login?next=%2Fsacola');
  expect((screen.getByLabelText('Nome completo') as HTMLInputElement).value).toBe('Ana Souza');
});

test('?papel=motoboy: vai para o cadastro do entregador, sem formulário aqui', () => {
  mockQuery = { papel: 'motoboy' };
  render(<RegisterPage />);
  expect(replace).toHaveBeenCalledWith('/motoboy/cadastro');
  expect(screen.queryByRole('button', { name: 'Criar conta' })).toBeNull();
  expect(post).not.toHaveBeenCalled();
});

test('?papel=lojista continua aqui, com o papel no corpo', async () => {
  mockQuery = { papel: 'lojista' };
  post.mockResolvedValue({ data: { id: 'u3' } });
  render(<RegisterPage />);
  expect(replace).not.toHaveBeenCalled();
  expect(screen.getByRole('heading', { name: 'Venda na DROP' })).toBeInTheDocument();
  preencher();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
  await waitFor(() => expect(post.mock.calls[0][1]).toMatchObject({ role: 'lojista' }));
});

describe('escolha do tipo de conta (fix/cadastro-papel)', () => {
  test('mostra Comprar, Vender e Entregar num grupo "Tipo de conta"', () => {
    render(<RegisterPage />);
    const grupo = screen.getByRole('tablist', { name: 'Tipo de conta' });
    expect(grupo).toBeInTheDocument();
    expect(screen.getAllByRole('tab').map((t) => t.textContent)).toEqual(['Comprar', 'Vender', 'Entregar']);
  });

  test('Vender: troca o título, guarda ?papel=lojista na URL e manda o papel', async () => {
    mockQuery = { next: '/sacola' };
    post.mockResolvedValue({ data: { id: 'u4' } });
    render(<RegisterPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Vender' }));
    expect(screen.getByRole('heading', { name: 'Venda na DROP' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Vender' })).toHaveAttribute('aria-selected', 'true');
    expect(replace).toHaveBeenCalledWith({ pathname: '/register', query: { next: '/sacola', papel: 'lojista' } }, undefined, { shallow: true });
    preencher();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    await waitFor(() => expect(post.mock.calls[0][1]).toMatchObject({ role: 'lojista' }));
  });

  test('voltar para Comprar tira o papel da URL e do corpo', async () => {
    mockQuery = { papel: 'lojista' };
    post.mockResolvedValue({ data: { id: 'u5' } });
    render(<RegisterPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Comprar' }));
    expect(screen.getByRole('heading', { name: 'Criar conta' })).toBeInTheDocument();
    expect(replace).toHaveBeenCalledWith({ pathname: '/register', query: {} }, undefined, { shallow: true });
    preencher();
    fireEvent.click(screen.getByRole('checkbox'));
    fireEvent.click(screen.getByRole('button', { name: 'Criar conta' }));
    await waitFor(() => expect(post).toHaveBeenCalled());
    expect(post.mock.calls[0][1]).not.toHaveProperty('role');
  });

  test('Entregar: leva ao cadastro do entregador', () => {
    render(<RegisterPage />);
    fireEvent.click(screen.getByRole('tab', { name: 'Entregar' }));
    expect(push).toHaveBeenCalledWith('/motoboy/cadastro');
    expect(post).not.toHaveBeenCalled();
  });
});
