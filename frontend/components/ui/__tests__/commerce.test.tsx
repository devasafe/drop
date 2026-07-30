import { render, screen } from '@testing-library/react';
import { PriceTag } from '../PriceTag';
import { StatusPill } from '../StatusPill';
test('PriceTag mostra preço e antigo riscado', () => {
  render(<PriceTag price={89.9} oldPrice={112} />);
  expect(screen.getByText('R$ 89,90')).toBeInTheDocument();
  expect(screen.getByText('R$ 112,00')).toHaveClass('old');
});
test('StatusPill "aberta" usa tom de sucesso', () => {
  const { container } = render(<StatusPill status="aberta" />);
  expect(container.firstChild).toHaveClass('aberta');
  expect(screen.getByText('Aberta')).toBeInTheDocument();
});
