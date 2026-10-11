import { render, screen } from '@testing-library/react';
import { Receipt } from 'lucide-react';
import { TabBar } from '../TabBar';

it('aba com contador mostra o número e diz no nome acessível', () => {
  render(<TabBar active="inicio" onNavigate={() => {}} items={[{ key: 'pedidos', label: 'Pedidos', icon: Receipt, badge: 1 }]} />);
  expect(screen.getByRole('button', { name: 'Pedidos, 1 em andamento' })).toBeInTheDocument();
  expect(screen.getByText('1')).toBeInTheDocument();
});
