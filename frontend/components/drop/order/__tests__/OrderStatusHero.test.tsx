import { render, screen } from '@testing-library/react';
import { OrderStatusHero } from '../OrderStatusHero';

test('mostra a mensagem e o rótulo de status', () => {
  render(<OrderStatusHero statusLabel="A caminho" statusTone="info" message="Motoboy a caminho!" />);
  expect(screen.getByText('Motoboy a caminho!')).toBeInTheDocument();
  expect(screen.getByText('A caminho')).toBeInTheDocument();
});

test.each([
  ['info', 'Aguardando'],
  ['success', 'Entregue'],
  ['danger', 'Cancelado'],
  ['pending', 'Processando'],
] as const)('renderiza tom "%s" sem quebrar', (tone, label) => {
  render(<OrderStatusHero statusLabel={label} statusTone={tone} message="Mensagem de teste" />);
  expect(screen.getByText('Mensagem de teste')).toBeInTheDocument();
});
