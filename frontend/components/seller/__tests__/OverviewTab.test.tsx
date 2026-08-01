import { render, screen, fireEvent } from '@testing-library/react';
import OverviewTab from '../OverviewTab';

const baseProps = () => ({
  store: { _id: 's1', name: 'Loja Teste', isOpen: true, plan: 2, rating: 4 },
  orders: [
    { _id: 'o1', status: 'criado', createdAt: '2026-08-01T09:00:00', customerName: 'Ana', products: [{}, {}], totalValue: 50 },
    { _id: 'o2', status: 'aguardando_motoboy', createdAt: '2026-08-01T08:00:00', customerName: 'Beto', products: [{}], totalValue: 30 },
    { _id: 'o3', status: 'picked', createdAt: '2026-08-01T07:00:00', customerName: 'Cita', products: [{}], totalValue: 20 },
  ],
  history: [],
  metrics: { totalSales: 10, delivered: 7, ongoing: 3, revenue: 900 },
  returnRequests: [],
  onGoToTab: jest.fn(),
  onToggleOpen: jest.fn(),
  onQuickAction: jest.fn(),
});

describe('OverviewTab', () => {
  it('mostra contadores por status (Novos/Em preparo/A caminho)', () => {
    render(<OverviewTab {...baseProps()} />);
    // 1 novo (o1), 1 em preparo (o2), 1 a caminho (o3)
    expect(screen.getByText('Novos').closest('button')).toHaveTextContent('1');
    expect(screen.getByText('Em preparo').closest('button')).toHaveTextContent('1');
    expect(screen.getByText('A caminho').closest('button')).toHaveTextContent('1');
  });

  it('clicar num contador vai para a aba Pedidos', () => {
    const p = baseProps();
    render(<OverviewTab {...p} />);
    fireEvent.click(screen.getByText('Novos').closest('button')!);
    expect(p.onGoToTab).toHaveBeenCalledWith('orders');
  });

  it('destaca o pedido ativo (o novo mais recente) e a ação vai para Pedidos', () => {
    const p = baseProps();
    render(<OverviewTab {...p} />);
    expect(screen.getByTestId('active-order')).toHaveTextContent('Ana'); // o1 é o novo
    fireEvent.click(screen.getByTestId('active-order-action'));
    expect(p.onGoToTab).toHaveBeenCalledWith('orders');
  });

  it('mostra empty state quando não há pedidos em andamento', () => {
    const p = { ...baseProps(), orders: [] };
    render(<OverviewTab {...p} />);
    expect(screen.getByText(/nenhum pedido ativo/i)).toBeInTheDocument();
  });

  it('pill reflete Aberta e o toggle chama onToggleOpen(false)', () => {
    const p = baseProps();
    render(<OverviewTab {...p} />);
    expect(screen.getByTestId('status-pill')).toHaveTextContent(/aberta/i);
    fireEvent.click(screen.getByTestId('toggle-open'));
    expect(p.onToggleOpen).toHaveBeenCalledWith(false);
  });

  it('KPIs mostram avaliação só quando store.rating existe', () => {
    const p = baseProps();
    const { rerender } = render(<OverviewTab {...p} />);
    expect(screen.getByText(/avaliação/i)).toBeInTheDocument();
    rerender(<OverviewTab {...p} store={{ ...p.store, rating: null }} />);
    expect(screen.queryByText(/avaliação/i)).toBeNull();
  });

  it('atalho "Adicionar produto" navega pela rota certa', () => {
    const p = baseProps();
    render(<OverviewTab {...p} />);
    fireEvent.click(screen.getByText(/adicionar produto/i));
    expect(p.onQuickAction).toHaveBeenCalledWith('/seller/create-product');
  });
});
