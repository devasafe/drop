import { helpRouteFor } from '../helpRoute';

/** Cada perfil tem a própria Ajuda (a página escura /suporte saiu). */
test.each([
  ['cliente', '/conta/ajuda'],
  ['lojista', '/seller/ajuda'],
  ['motoboy', '/motoboy/perfil/ajuda'],
  ['ceo', '/admin/suporte'],
  ['gerente_clientes', '/admin/suporte'],
  [undefined, '/conta/ajuda'],
])('%s → %s', (role, href) => {
  expect(helpRouteFor(role as any)).toBe(href);
});
