import { maskEmail } from '../maskEmail';
it.each([
  ['ana.souza@email.com', 'a***@email.com'],
  ['a@b.com', 'a***@b.com'],
  ['sem-arroba', 'sem-arroba'],
])('%s → %s', (e, m) => expect(maskEmail(e)).toBe(m));
