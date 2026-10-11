import { CUSTOMER_ROUTES } from '../lib/routes';
import { themeForPath } from '../lib/routeTheme';

it('toda rota do cliente é clara', () => {
  const escuras = CUSTOMER_ROUTES.filter((r) => themeForPath(r) !== 'light');
  expect(escuras).toEqual([]);
});

it('as telas públicas sem papel também são claras', () => {
  for (const r of ['/login', '/register', '/esqueci-senha', '/termos', '/privacidade', '/cookies', '/404', '/500', '/access-denied']) {
    expect(themeForPath(r)).toBe('light');
  }
});
