import fs from 'fs';
import path from 'path';

// Preço é sempre Space Grotesk 700: o shorthand `font:` numa regra `.current` tem que ser --text-price*.
test('PriceTag: toda regra .current com shorthand font usa --text-price*', () => {
  const css = fs.readFileSync(path.join(__dirname, '../components/ui/PriceTag.module.css'), 'utf8');
  const rules = [...css.matchAll(/([^{}]*\.current[^{}]*)\{([^}]*)\}/g)];
  const withFont = rules.filter((r) => /(^|[\s;])font\s*:/.test(r[2]));
  expect(withFont.length).toBeGreaterThan(0);
  withFont.forEach((r) => expect(r[2]).toMatch(/font\s*:\s*var\(--text-price/));
});
