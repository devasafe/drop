import { resolveRedirect, type RedirectRule } from '../../__tests__/helpers/nextRedirects';
// eslint-disable-next-line @typescript-eslint/no-var-requires
const rules: RedirectRule[] = require('../redirects');

describe('resolveRedirect (semântica do next.config)', () => {
  const sample: RedirectRule[] = [
    { source: '/a', has: [{ type: 'query', key: 'tab', value: 'x' }], destination: '/b?secao=x', permanent: true },
    { source: '/a', destination: '/c', permanent: true },
    { source: '/item/:id', destination: '/novo/:id', permanent: true },
  ];
  it('primeira regra que casa vence; has de query; query repassada', () => {
    expect(resolveRedirect(sample, '/a?tab=x')).toEqual({ location: '/b?secao=x&tab=x', permanent: true });
    expect(resolveRedirect(sample, '/a?y=1')).toEqual({ location: '/c?y=1', permanent: true });
    expect(resolveRedirect(sample, '/item/abc?k=2')).toEqual({ location: '/novo/abc?k=2', permanent: true });
    expect(resolveRedirect(sample, '/outra')).toBeNull();
  });
});

describe('lib/redirects.js', () => {
  it('é uma lista de regras válidas para o next.config', () => {
    expect(Array.isArray(rules)).toBe(true);
    for (const r of rules) {
      expect(r.source.startsWith('/')).toBe(true);
      expect(r.destination.startsWith('/')).toBe(true);
      expect(typeof r.permanent).toBe('boolean');
    }
  });
});
