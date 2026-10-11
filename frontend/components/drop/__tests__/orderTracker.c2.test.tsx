import { render, screen } from '@testing-library/react';
import { OrderTracker } from '../OrderTracker';

it('bloco do pedido ativo: selo do status, código, loja, itens e progresso; sem a lista de passos', () => {
  render(<OrderTracker orderId="AB4821" storeName="Eletro Center" statusLabel="Saiu para entrega" itemsLabel="2 itens"
    progress={0.72} steps={[{ label: 'Criado', done: true }, { label: 'Entregue', done: false }]} />);
  expect(screen.getByText('Saiu para entrega')).toBeInTheDocument();
  expect(screen.getByText('Pedido #AB4821')).toBeInTheDocument();
  expect(screen.getByText('Eletro Center')).toBeInTheDocument();
  expect(screen.getByText('2 itens')).toBeInTheDocument();
  expect(screen.getByRole('progressbar')).toBeInTheDocument();
  expect(screen.queryByText('Criado')).toBeNull();
});
