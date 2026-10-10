import { render } from '@testing-library/react';
import { useRouteTheme } from '../routeTheme';

let mockPathname = '/pedidos';
jest.mock('next/router', () => ({
  useRouter: () => ({ pathname: mockPathname }),
}));

function Probe() {
  useRouteTheme();
  return null;
}

describe('useRouteTheme', () => {
  it('troca o data-theme quando a rota muda (claro no styleguide, escuro de volta)', () => {
    mockPathname = '/pedidos';
    const { rerender } = render(<Probe />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');

    mockPathname = '/_styleguide';
    rerender(<Probe />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('light');

    mockPathname = '/pedidos';
    rerender(<Probe />);
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
  });

  it('aplica o tema antes dos efeitos dos filhos (layout effect)', () => {
    mockPathname = '/_styleguide';
    let themeSeenByChildEffect: string | null = null;
    const { useEffect } = jest.requireActual('react');
    function Child() {
      useEffect(() => {
        themeSeenByChildEffect = document.documentElement.getAttribute('data-theme');
      }, []);
      return null;
    }
    document.documentElement.setAttribute('data-theme', 'dark');
    function Parent() {
      useRouteTheme();
      return <Child />;
    }
    render(<Parent />);
    expect(themeSeenByChildEffect).toBe('light');
  });
});
