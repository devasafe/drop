/**
 * V13 · as variáveis das fontes (next/font) valem no documento inteiro.
 * tokens.css define --font-display/--font-body no :root a partir de --font-space-grotesk/--font-inter.
 * Por isso as classes `.variable` precisam estar no <html> (e não só no <main>): assim a Nav, as
 * sheets/portais (no <body>) e a barra de abas resolvem a Space Grotesk, e não a fonte de reserva.
 */
import fs from 'fs';
import path from 'path';

const read = (...p: string[]) => fs.readFileSync(path.join(__dirname, '..', ...p), 'utf8');

test('_document aplica spaceGrotesk.variable e inter.variable no <Html>', () => {
  const src = read('pages', '_document.tsx');
  const html = src.match(/<Html\b[^>]*>/)?.[0] ?? '';
  expect(html).toContain('spaceGrotesk.variable');
  expect(html).toContain('inter.variable');
});

test('as fontes declaram as variáveis que os tokens do :root usam', () => {
  const fonts = read('lib', 'fonts.ts');
  expect(fonts).toMatch(/Space_Grotesk\([^)]*variable:\s*'--font-space-grotesk'/);
  expect(fonts).toMatch(/Inter\([^)]*variable:\s*'--font-inter'/);
  const tokens = read('styles', 'tokens.css');
  expect(tokens).toMatch(/--font-display:\s*var\(--font-space-grotesk\)/);
  expect(tokens).toMatch(/--font-body:\s*var\(--font-inter\)/);
});
