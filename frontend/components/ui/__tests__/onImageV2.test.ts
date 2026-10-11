import fs from 'fs';
import path from 'path';
import { cssViolations } from '../../../__tests__/helpers/dsTokens';

const read = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8');
function rule(css: string, selector: string): string {
  const i = css.indexOf(`${selector} {`);
  if (i < 0) return '';
  return css.slice(i, css.indexOf('}', i));
}

describe('sobre imagem e marca no claro', () => {
  it('Logo só usa tokens semânticos (sem gradiente nem sombra de marca)', () => {
    expect(cssViolations(read('drop/Logo.module.css'))).toEqual([]);
  });
  it('Button onImage não usa a cor "sobre ação" como fundo (some no claro)', () => {
    const r = rule(read('ui/Button.module.css'), '.onImage');
    expect(r).toMatch(/background:\s*var\(--color-surface-default\)/);
    expect(r).toMatch(/border:\s*1px solid var\(--color-border-default\)/);
  });
  it('IconButton brand tem superfície e borda próprias', () => {
    const r = rule(read('ui/IconButton.module.css'), '.brand');
    expect(r).toMatch(/background:\s*var\(--color-surface-default\)/);
    expect(r).toMatch(/border:\s*1px solid var\(--color-border-default\)/);
  });
});
