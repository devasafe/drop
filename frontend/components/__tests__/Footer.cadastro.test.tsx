import { render, screen, within } from '@testing-library/react';

jest.mock('../../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'direto' }) }));

import Footer from '../Footer';

// fix/cadastro-papel: "Para Motoboys → Cadastrar-se" levava a /register, que cria conta de cliente.
test('cadastro de motoboy no rodapé leva ao cadastro do entregador', () => {
  render(<Footer />);
  const col = screen.getByText('Para Motoboys').parentElement as HTMLElement;
  expect(within(col).getByRole('link', { name: 'Cadastrar-se' })).toHaveAttribute('href', '/motoboy/cadastro');
});

test('"Cadastrar" da coluna Conta continua no Criar conta, onde se escolhe o tipo', () => {
  render(<Footer />);
  const col = screen.getByText('Conta').parentElement as HTMLElement;
  expect(within(col).getByRole('link', { name: 'Cadastrar' })).toHaveAttribute('href', '/register');
});
