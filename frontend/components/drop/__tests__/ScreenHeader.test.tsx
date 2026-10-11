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
