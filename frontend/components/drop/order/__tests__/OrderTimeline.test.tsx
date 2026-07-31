import { render, screen } from '@testing-library/react';
import { OrderTimeline } from '../OrderTimeline';

test('renderiza os steps', () => {
  render(<OrderTimeline orderId="o1" storeName="LJ" statusLabel="Pago" progress={0.4}
    steps={[{ label: 'Criado', done: true }, { label: 'Pago', done: true }, { label: 'Entregue', done: false }]} />);
  expect(screen.getByText('Entregue')).toBeInTheDocument();
});

test('repassa orderId e storeName pro título do OrderTracker', () => {
  render(<OrderTimeline orderId="o1" storeName="Loja X" statusLabel="Pago" progress={0.4}
    steps={[{ label: 'Criado', done: true }]} />);
  expect(screen.getByText('Pedido #o1 · Loja X')).toBeInTheDocument();
});
