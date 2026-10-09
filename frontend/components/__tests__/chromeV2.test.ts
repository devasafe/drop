// Fase B / Task 9: o chrome do app (Nav, header, tabbar, chat, painéis) lê só a camada semântica.
import fs from 'fs';
import path from 'path';
import { cssViolations } from '../../__tests__/helpers/dsTokens';

const root = path.join(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

const chatDir = 'components/drop/chat';
const files = [
  'components/Nav.module.css',
  'components/ChatWidgetWithTabs.module.css',
  'components/drop/AppHeader.module.css',
  'components/drop/AddressBar.module.css',
  'components/drop/TabBar.module.css',
  'components/drop/CustomerAppChrome.module.css',
  'components/nav/AccountMenu.module.css',
  'components/nav/AccountMenuButton.module.css',
  'components/nav/AppSidebar.module.css',
  'components/nav/PanelBottomNav.module.css',
  ...fs
    .readdirSync(path.join(root, chatDir))
    .filter((f) => f.endsWith('.module.css'))
    .map((f) => `${chatDir}/${f}`),
];

const stripComments = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('chrome em tokens semânticos', () => {
  it.each(files)('%s sem hex, token antigo, gradiente, rgba ou --fs-*', (f) => {
    const c = stripComments(read(f));
    const extra = c
      .split('\n')
      .filter((l) => /rgba?\(|var\(--fs-/.test(l));
    expect({ f, v: cssViolations(c), extra }).toEqual({ f, v: [], extra: [] });
  });

  it('z-index do chrome fica abaixo do Sheet (1000)', () => {
    for (const f of files) {
      for (const m of stripComments(read(f)).matchAll(/z-index:\s*(\d+)/g)) {
        expect({ f, z: Number(m[1]) < 1000 }).toEqual({ f, z: true });
      }
    }
  });

  it('globals.css: bloco .nav-header sem hex/rgba', () => {
    const css = stripComments(read('styles/globals.css'));
    const block = css.match(/\.nav-header\s*\{[^}]*\}/);
    expect(block).not.toBeNull();
    expect(block![0]).not.toMatch(/#[0-9a-fA-F]{3,8}\b|rgba?\(/);
  });
});
