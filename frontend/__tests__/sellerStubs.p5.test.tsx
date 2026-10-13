// Esqueletos da P5. Teste de estrutura, não de comportamento: quem preencher a tela (P6/P7)
// troca a linha correspondente pelo teste da tela de verdade.
import React from 'react';
import { render, screen } from '@testing-library/react';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: { id: 'o1' }, pathname: '/seller/x' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));

test.each([
  ['../pages/seller/pedidos', 'Pedidos', false],
  ['../pages/seller/pedido/[id]', 'Pedido', true],
  ['../pages/seller/dinheiro', 'Dinheiro', false],
  ['../pages/seller/loja', 'Loja', false],
  ['../pages/seller/notificacoes', 'Notificações', true],
])('%s abre com o título certo', (mod, title, hasBack) => {
  const Page = require(mod).default;
  render(<Page />);
  expect(screen.getByRole('heading', { level: 1, name: title })).toBeInTheDocument();
  expect(!!screen.queryByRole('button', { name: 'Voltar' })).toBe(hasBack);
});
