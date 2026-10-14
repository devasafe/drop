import { render, screen, fireEvent } from '@testing-library/react';
import { StoreLogo } from '../StoreLogo';
import { StoreCard } from '../StoreCard';
import { mapStore } from '../../../lib/mapStore';

it('com logo: mostra a imagem com texto alternativo, lazy, otimizada no Cloudinary', () => {
  render(<StoreLogo name="Eletro Center" src="https://res.cloudinary.com/x/image/upload/v1/logo.png" className="c" />);
  const img = screen.getByAltText('Logo de Eletro Center');
  expect(img).toHaveAttribute('loading', 'lazy');
  expect(img.getAttribute('src')).toContain('/upload/f_auto,q_auto,c_limit,w_');
  expect(screen.queryByText('EC')).toBeNull();
});

it('sem logo: iniciais', () => {
  render(<StoreLogo name="Eletro Center" src={null} className="c" />);
  expect(screen.getByText('EC')).toBeInTheDocument();
  expect(screen.queryByRole('img')).toBeNull();
});

it('imagem que falha volta para as iniciais', () => {
  render(<StoreLogo name="Eletro Center" src="https://res.cloudinary.com/x/image/upload/v1/logo.png" className="c" />);
  fireEvent.error(screen.getByAltText('Logo de Eletro Center'));
  expect(screen.getByText('EC')).toBeInTheDocument();
  expect(screen.queryByAltText('Logo de Eletro Center')).toBeNull();
});

it('card de loja (resultado) usa o logo; mapStore repassa logoUrl', () => {
  const data = mapStore({ _id: 's1', name: 'Eletro Center', logoUrl: 'https://res.cloudinary.com/x/image/upload/v1/logo.png', isOpen: true });
  render(<StoreCard variant="resultado" onClick={() => {}} store={data} />);
  expect(screen.getByAltText('Logo de Eletro Center')).toBeInTheDocument();
});

describe('card resultado: logo → banner → iniciais', () => {
  const card = (extra: any) => render(<StoreCard variant="resultado" onClick={() => {}} store={{ name: 'Eletro Center', status: 'aberta', category: 'x', ...extra }} />);
  it('sem logo e com banner: mostra o banner', () => {
    const { container } = card({ imageUrl: 'https://cdn/banner.jpg' });
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn/banner.jpg');
  });
  it('sem nada: iniciais', () => {
    const { container } = card({});
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('EC')).toBeInTheDocument();
  });
  it('logo quebrado cai para o banner; banner quebrado cai para iniciais', () => {
    const { container } = card({ logoUrl: 'https://cdn/logo.png', imageUrl: 'https://cdn/banner.jpg' });
    fireEvent.error(screen.getByAltText('Logo de Eletro Center'));
    expect(container.querySelector('img')?.getAttribute('src')).toBe('https://cdn/banner.jpg');
    fireEvent.error(container.querySelector('img')!);
    expect(container.querySelector('img')).toBeNull();
    expect(screen.getByText('EC')).toBeInTheDocument();
  });
});
