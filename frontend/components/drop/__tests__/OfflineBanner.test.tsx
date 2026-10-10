import { render, screen, act } from '@testing-library/react';
import { OfflineBanner } from '../OfflineBanner';

const setOnline = (v: boolean) => Object.defineProperty(window.navigator, 'onLine', { value: v, configurable: true });

it('mostra a faixa ao perder a conexão e some ao voltar', () => {
  setOnline(true);
  render(<OfflineBanner />);
  expect(screen.queryByText(/Sem conexão/)).toBeNull();
  act(() => { setOnline(false); window.dispatchEvent(new Event('offline')); });
  expect(screen.getByRole('status')).toHaveTextContent('Sem conexão. Mostrando o que já estava salvo.');
  act(() => { setOnline(true); window.dispatchEvent(new Event('online')); });
  expect(screen.queryByText(/Sem conexão/)).toBeNull();
});
