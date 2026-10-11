import { render, screen, fireEvent } from '@testing-library/react';

const push = jest.fn();
let mockUser: any = { activeRole: 'cliente' };
jest.mock('next/router', () => ({ useRouter: () => ({ push, reload: jest.fn() }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));
import AccessDenied from '../pages/access-denied';
import NotFound from '../pages/404';
import ServerError from '../pages/500';

beforeEach(() => { push.mockClear(); mockUser = { activeRole: 'cliente' }; });

test('sem acesso (cliente): diz o perfil e leva ao Início', () => {
  render(<AccessDenied />);
  expect(screen.getByText('Você entrou como cliente. Esta parte é de outro perfil.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ir para o Início' }));
  expect(push).toHaveBeenCalledWith('/inicio');
});

test('sem acesso (lojista): volta para o painel dele', () => {
  mockUser = { activeRole: 'lojista' };
  render(<AccessDenied />);
  fireEvent.click(screen.getByRole('button', { name: 'Voltar para o painel' }));
  expect(push).toHaveBeenCalledWith('/seller/dashboard');
});

test('404 leva à busca; 500 tenta de novo', () => {
  render(<NotFound />);
  expect(screen.getByRole('heading', { name: 'Esta página não existe' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Buscar na DROP' }));
  expect(push).toHaveBeenCalledWith('/buscar?focus=1');
  render(<ServerError />);
  expect(screen.getByRole('button', { name: 'Tentar de novo' })).toBeInTheDocument();
});
