import { safeNext, authHref } from '@/lib/routes';

/**
 * I1 (revisão final C2): `next` externo nunca passa. O `new URL` do navegador remove
 * TAB/LF/CR e trata `\` como `/`, então `/\t/evil.com` vira `//evil.com`.
 */
describe('safeNext — só caminho interno', () => {
  it.each([
    ['/\t/evil.com'],
    ['/\n/evil.com'],
    ['/\r/evil.com'],
    ['/\r\n/evil.com'],
    [decodeURIComponent('/%09/evil.com')],
    [decodeURIComponent('/%0a/evil.com')],
    ['//evil.com'],
    ['/\\evil.com'],
    ['/\\/evil.com'],
    ['\\\\evil.com'],
    ['https://evil.com'],
    ['javascript:alert(1)'],
    [' /sacola'],
    ['/ /evil.com'],
    ['sacola'],
    [''],
  ])('recusa %j', (v) => {
    expect(safeNext(v)).toBeNull();
  });

  it.each([
    ['/sacola', '/sacola'],
    ['/pedido/abc?x=1', '/pedido/abc?x=1'],
    ['/buscar?q=p%C3%A3o#topo', '/buscar?q=p%C3%A3o#topo'],
  ])('aceita %j', (v, out) => {
    expect(safeNext(v)).toBe(out);
  });

  it('aceita o primeiro de um array e recusa não-string', () => {
    expect(safeNext(['/sacola', '//evil.com'])).toBe('/sacola');
    expect(safeNext(undefined)).toBeNull();
    expect(safeNext(42)).toBeNull();
  });

  it('authHref não leva next externo', () => {
    expect(authHref('/login', '/\t/evil.com')).toBe('/login');
    expect(authHref('/login', '/sacola')).toBe('/login?next=%2Fsacola');
  });
});
