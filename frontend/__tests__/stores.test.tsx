import { render, screen } from '@testing-library/react';
import StoresPage from '../pages/stores';

const push = jest.fn();
const stores = [
  { _id: 'c1', name: 'Loja Comum', plan: 1, isOpen: true },
  { _id: 'p1', name: 'Premium Um', plan: 3, isOpen: true, featuredBannerUrl: 'a.jpg' },
];
const featured = [
  { _id: 'p1', name: 'Premium Um', plan: 3, isOpen: true, featuredBannerUrl: 'a.jpg' },
  { _id: 'p2', name: 'Premium Dois', plan: 3, isOpen: true, featuredBannerUrl: 'b.jpg' },
];

jest.mock('next/router', () => ({ useRouter: () => ({ push, back: jest.fn() }) }));
jest.mock('../hooks/useSync', () => ({
  useStores: () => ({ stores, loading: false }),
  useFeaturedStores: () => ({ stores: featured, loading: false }),
}));

describe('/stores', () => {
  it('mostra o carrossel de premium e a lista com premium primeiro', () => {
    render(<StoresPage />);
    // carrossel dos banners premium (2 → tem dots)
    expect(screen.getByRole('tablist', { name: /lojas em destaque/i })).toBeInTheDocument();
    // lista: loja premium antes da comum
    const names = screen.getAllByText(/Premium Um|Loja Comum/).map((n) => n.textContent);
    expect(names[0]).toBe('Premium Um');
    expect(names).toContain('Loja Comum');
  });
});
