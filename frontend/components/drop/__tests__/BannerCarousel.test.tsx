import { render, screen, fireEvent, act } from '@testing-library/react';
import { BannerCarousel } from '../BannerCarousel';

const banners = [
  { _id: 'b1', imageUrl: 'a.jpg', linkUrl: '/produtos', title: 'Promo' },
  { _id: 'b2', imageUrl: 'b.jpg', title: 'Aviso sem link' },
  { _id: 'b3', imageUrl: 'c.jpg', linkUrl: 'https://x.com', title: 'Externo' },
];

describe('BannerCarousel', () => {
  it('vazio não renderiza nada', () => {
    const { container } = render(<BannerCarousel banners={[]} onSelect={jest.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renderiza um dot por banner, primeiro ativo', () => {
    render(<BannerCarousel banners={banners} onSelect={jest.fn()} />);
    const dots = screen.getAllByRole('tab');
    expect(dots).toHaveLength(3);
    expect(dots[0]).toHaveAttribute('aria-selected', 'true');
  });

  it('tocar num banner com link chama onSelect com a URL', () => {
    const onSelect = jest.fn();
    render(<BannerCarousel banners={banners} onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText('Promo'));
    expect(onSelect).toHaveBeenCalledWith('/produtos');
  });

  it('tocar num banner sem link não chama onSelect', () => {
    const onSelect = jest.fn();
    render(<BannerCarousel banners={banners} onSelect={onSelect} />);
    fireEvent.click(screen.getByLabelText('Aviso sem link'));
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('auto-avança após o intervalo', () => {
    jest.useFakeTimers();
    try {
      render(<BannerCarousel banners={banners} onSelect={jest.fn()} intervalMs={5000} />);
      expect(screen.getAllByRole('tab')[0]).toHaveAttribute('aria-selected', 'true');
      act(() => { jest.advanceTimersByTime(5000); });
      expect(screen.getAllByRole('tab')[1]).toHaveAttribute('aria-selected', 'true');
    } finally {
      jest.useRealTimers();
    }
  });
});
