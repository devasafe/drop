import { render, screen } from '@testing-library/react';
import { StoreCard } from '../StoreCard';
import { ProductCard } from '../ProductCard';
const store = { name:'TechStore', status:'aberta' as const, category:'Eletrônicos • Acessórios', rating:4.8, etaMin:[25,35] as [number,number], fee:5.9 };
test('StoreCard resultado é linha (sem classe de card com borda)', () => {
  const { container } = render(<StoreCard variant="resultado" store={store} onClick={()=>{}} />);
  expect(container.firstChild).toHaveClass('row');       // linha
  expect(container.firstChild).not.toHaveClass('card');  // não é card
  expect(screen.getByText('TechStore')).toBeInTheDocument();
});
test('ProductCard sem imagem usa fallback (não quebra)', () => {
  render(<ProductCard variant="home" product={{ name:'Mouse Gamer com nome bem longo que ocupa duas linhas', price:89.9, discountPercent:20 }} onAdd={()=>{}} />);
  expect(screen.getByText(/Mouse Gamer/)).toBeInTheDocument();
  expect(screen.getByText('20% OFF')).toBeInTheDocument();
  expect(screen.getByLabelText('Adicionar')).toBeInTheDocument();
});
