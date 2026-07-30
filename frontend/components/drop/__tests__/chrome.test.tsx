import { render, screen } from '@testing-library/react';
import { Logo } from '../Logo';
import { TabBar } from '../TabBar';
test('Logo mostra DROP em caixa alta', () => {
  render(<Logo />);
  expect(screen.getByText('DROP')).toBeInTheDocument();
});
test('TabBar marca o item ativo', () => {
  render(<TabBar active="carteira" onNavigate={()=>{}} />);
  expect(screen.getByRole('button', { name: /Carteira/ })).toHaveClass('on');
});
