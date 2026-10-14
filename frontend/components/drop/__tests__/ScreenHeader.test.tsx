import { render, screen, fireEvent } from '@testing-library/react';
import { ScreenHeader } from '../ScreenHeader';

it('título como heading, voltar com nome e ação à direita', () => {
  const onBack = jest.fn();
  render(<ScreenHeader title="Criar conta" onBack={onBack} end={<button>Ajuda</button>} />);
  expect(screen.getByRole('heading', { level: 1, name: 'Criar conta' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  expect(onBack).toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Ajuda' })).toBeInTheDocument();
});

it('sem onBack não mostra o voltar', () => {
  render(<ScreenHeader title="Pedidos" />);
  expect(screen.queryByRole('button', { name: 'Voltar' })).toBeNull();
});

it('start aparece antes do título (ex.: avatar da loja)', () => {
  render(<ScreenHeader title="Eletro Center" start={<span data-testid="av">EC</span>} />);
  const av = screen.getByTestId('av');
  const h = screen.getByRole('heading', { name: 'Eletro Center' });
  expect(av.compareDocumentPosition(h) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
});

it('título vazio: sem heading vazio, e a ação continua à direita (espaçador no lugar do título)', () => {
  const { container } = render(<ScreenHeader title="" start={<span>Online</span>} end={<button>Energia</button>} />);
  expect(screen.queryByRole('heading')).toBeNull();
  expect(container.querySelector('h1, h2')).toBeNull();
  expect(screen.getByRole('button', { name: 'Energia' })).toBeInTheDocument();
});
