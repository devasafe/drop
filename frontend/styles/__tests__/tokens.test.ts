import fs from 'fs';
import path from 'path';
const tokens = fs.readFileSync(path.join(__dirname, '..', 'tokens.css'), 'utf8');
const globals = fs.readFileSync(path.join(__dirname, '..', 'globals.css'), 'utf8');

function block(css: string, selector: string): string {
  const i = css.indexOf(selector);
  if (i < 0) return '';
  const start = css.indexOf('{', i);
  let depth = 0;
  for (let j = start; j < css.length; j++) {
    if (css[j] === '{') depth++;
    if (css[j] === '}' && --depth === 0) return css.slice(start + 1, j);
  }
  return '';
}
const names = (b: string) => new Set(Array.from(b.matchAll(/(--color-[a-z0-9-]+)\s*:/g)).map((m) => m[1]));

describe('tokens v2', () => {
  it('claro e escuro definem os mesmos --color-*', () => {
    const light = names(block(tokens, ':root, [data-theme="light"]'));
    const dark = names(block(tokens, '[data-theme="dark"] {'));
    expect([...light].sort()).toEqual([...dark].sort());
  });
  it('a ponte do claro redefine os tokens antigos que as telas usam', () => {
    const bridge = block(tokens, '/* ponte-claro */');
    for (const old of ['--bg:', '--surface:', '--text:', '--text-strong:', '--text-muted:', '--line:', '--brand:', '--brand-grad:', '--shadow-brand:']) {
      expect(bridge).toContain(old);
    }
    expect(bridge).toMatch(/--bg:\s*var\(--color-bg-primary\)/);
    expect(bridge).toMatch(/--brand-glow:\s*none/);
  });
  it('a ponte cobre todo token antigo de cor/sombra/gradiente do :root', () => {
    const root = block(tokens, ':root {');
    const bridge = block(tokens, '/* ponte-claro */');
    const skip = /^--(font|fs|space|app|r|dur|ease)(-|$)/;
    const old = Array.from(root.matchAll(/(--[a-z0-9-]+)\s*:/g)).map((m) => m[1]).filter((n) => !skip.test(n));
    const missing = old.filter((n) => !bridge.includes(`${n}:`));
    // scrim-soft/strong: preto translúcido neutro, igual nos dois temas
    expect(missing.sort()).toEqual(['--scrim-soft', '--scrim-strong']);
  });
  it('sazonal troca a ação; a ponte é resolvida no body para herdar a cor da data', () => {
    const natal = block(globals, 'body.theme-natal');
    expect(natal).toContain('--color-action-primary:');
    expect(tokens).toMatch(/\[data-theme="light"\],\s*\[data-theme="light"\] body\s*\{/);
  });
});
