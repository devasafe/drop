import { render, screen, fireEvent, act } from '@testing-library/react';
import { PremiumCarousel } from '../PremiumCarousel';

const items = [
  { id: 's1', store: { name: 'Loja A', status: 'aberta' } },
  { id: 's2', store: { name: 'Loja B', status: 'aberta' } },
  { id: 's3', store: { name: 'Loja C', status: 'aberta' } },
];

describe('PremiumCarousel', () => {
  it('vazio não renderiza nada', () => {
    const { container } = render(<PremiumCarousel items={[]} onSelect={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza um dot por item, primeiro ativo', () => {
    render(<PremiumCarousel items={items} onSelect={jest.fn()} />);
    const dots = screen.getAllByRole('tab');
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute('aria-selected', 'true');
    expect(dots[1]).toHaveAttribute('aria-selected', 'false');
  });

  it('clicar num dot troca o slide ativo', () => {
    render(<PremiumCarousel items={items} onSelect={jest.fn()} />);
    fireEvent.click(screen.getAllByRole('tab')[2]);
    expect(screen.getAllByRole('tab')[2]).toHaveAttribute('aria-selected', 'true');
  });

  it('clicar num slide chama onSelect com o id', () => {
    const onSelect = jest.fn();
    render(<PremiumCarousel items={items} onSelect={onSelect} />);
    fireEvent.click(screen.getByText('Loja A'));
    expect(onSelect).toHaveBeenCalledWith('s1');
  });

  it('auto-avança após o intervalo', () => {
    jest.useFakeTimers();
    try {
      render(<PremiumCarousel items={items} onSelect={jest.fn()} intervalMs={4000} />);
      expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
      act(() => { jest.advanceTimersByTime(4000); });
      expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
    } finally {
      jest.useRealTimers();
    }
  });
});
