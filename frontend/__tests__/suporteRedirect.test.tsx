import { render } from '@testing-library/react';

const replace = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace, query: {} }) }));
import AuthContext from '../contexts/AuthContext';
import SuportePage from '../pages/suporte';

const renderAs = (user: any, loading = false) => render(
  <AuthContext.Provider value={{ user, token: user ? 't' : null, loading } as any}><SuportePage /></AuthContext.Provider>,
);

beforeEach(() => replace.mockReset());

/** A página escura /suporte saiu: cada perfil vai para a própria Ajuda (links antigos continuam valendo). */
test.each([
  ['cliente', '/conta/ajuda'],
  ['lojista', '/seller/ajuda'],
  ['motoboy', '/motoboy/perfil/ajuda'],
  ['ceo', '/admin/suporte'],
])('/suporte com %s vai para %s', (role, href) => {
  renderAs({ _id: 'u1', activeRole: role, role });
  expect(replace).toHaveBeenCalledWith(href);
});

test('sem sessão vai para o login', () => {
  renderAs(null);
  expect(replace).toHaveBeenCalledWith('/login');
});

test('sessão carregando: espera', () => {
  renderAs(null, true);
  expect(replace).not.toHaveBeenCalled();
});
