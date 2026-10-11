import { render, screen } from '@testing-library/react';
import api from '../lib/api';

let mockActive: any[] = [];
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), back: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { _id: 'u1', email: 'ana@email.com' } }) }));
jest.mock('../hooks/useActiveOrders', () => ({ useActiveOrders: () => ({ activeOrders: mockActive, orders: mockActive, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;
import PrivacidadePage from '../pages/conta/privacidade';

beforeEach(() => { mockActive = []; get.mockResolvedValue({ data: { debt: null } }); });

test('direitos em linhas que abrem o e-mail preenchido; links das políticas', async () => {
  render(<PrivacidadePage />);
  expect(screen.getByRole('link', { name: /Baixar meus dados/ }).getAttribute('href')).toMatch(/^mailto:/);
  expect(screen.getByRole('link', { name: /Corrigir um dado/ })).toHaveAttribute('href', '/conta?secao=dados');
  expect(screen.getByRole('link', { name: 'Termos de Uso' })).toHaveAttribute('href', '/termos');
  expect(await screen.findByRole('link', { name: 'Pedir exclusão' })).toBeInTheDocument();
});

test('exclusão travada com taxa pendente ou pedido em andamento, dizendo por quê', async () => {
  get.mockResolvedValue({ data: { debt: { amount: '4.90' } } });
  mockActive = [{ _id: 'o1' }];
  render(<PrivacidadePage />);
  expect(await screen.findByText('Taxa pendente de R$ 4,90 precisa ser paga antes.')).toBeInTheDocument();
  expect(screen.getByText('Você tem um pedido em andamento.')).toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Pedir exclusão' })).toBeNull();
});
