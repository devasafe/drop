import { render, screen, fireEvent } from '@testing-library/react';
import CookieBanner from '../CookieBanner';

beforeEach(() => localStorage.clear());

test('mostra na 1ª visita e some após aceitar, salvando a preferência', () => {
  render(<CookieBanner />);
  expect(screen.getByText(/cookies/i)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /aceitar/i }));
  expect(localStorage.getItem('drop_cookie_consent')).toBe('all');
  expect(screen.queryByText(/cookies/i)).not.toBeInTheDocument();
});

test('não aparece se já houver preferência salva', () => {
  localStorage.setItem('drop_cookie_consent', 'essential');
  render(<CookieBanner />);
  expect(screen.queryByText(/cookies/i)).not.toBeInTheDocument();
});
