/**
 * D3a · sem diálogo nativo no admin (spec 1 e 7.2): window.prompt, confirm( e alert( não entram em
 * pages/admin nem em components/admin. Confirmação e formulário curto vão para a AdminSheet; aviso, para o toast.
 *
 * NATIVE_DIALOG_EXCEPTIONS: as telas foram migradas uma a uma na D3a e cada uma tirou a sua linha; desde a P5.3
 * a lista é vazia e um caso abaixo cobra isso (nenhuma página do admin pode voltar a ter diálogo nativo).
 */
import fs from 'fs';
import path from 'path';

/** Fim da D3a (P5.3): nenhuma página do admin tem diálogo nativo. A lista fica vazia e assim deve ficar. */
const NATIVE_DIALOG_EXCEPTIONS: string[] = [];

const NATIVE_DIALOG_RE = /(?:\b(?:window|globalThis|self)\.|(?<![\w.$]))(?:prompt|confirm|alert)\s*\(/;

const ROOT = path.join(__dirname, '..');
const DIRS = ['pages/admin', 'components/admin'];

const walk = (rel: string): string[] => {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) return [];
  return fs.readdirSync(abs, { withFileTypes: true }).flatMap((e) => {
    if (e.name === '__tests__') return [];
    const child = `${rel}/${e.name}`;
    if (e.isDirectory()) return walk(child);
    return /\.(tsx?|jsx?)$/.test(e.name) ? [child] : [];
  });
};

const hits = (file: string) =>
  fs.readFileSync(path.join(ROOT, file), 'utf8').split('\n')
    .map((line, i) => ({ line, n: i + 1 }))
    .filter(({ line }) => NATIVE_DIALOG_RE.test(line))
    .map(({ line, n }) => `${file}:${n}: ${line.trim()}`);

describe('o detector', () => {
  it.each([
    "window.prompt('Motivo')", "if (!confirm('Apagar?')) return;", "alert('Erro')", "  return alert('x');",
    'globalThis.confirm("x")', 'const r = prompt ("x")',
  ])('pega %s', (src) => {
    expect(NATIVE_DIALOG_RE.test(src)).toBe(true);
  });
  it.each([
    'onConfirm()', 'handleAlert(x)', 'toast.alert(x)', 'confirmar()', 'setConfirmOpen(true)', "<Alert tone='error'>", 'promptText',
  ])('ignora %s', (src) => {
    expect(NATIVE_DIALOG_RE.test(src)).toBe(false);
  });
});

describe('sem diálogo nativo no admin', () => {
  it('nenhum arquivo fora das exceções tem prompt/confirm/alert', () => {
    const files = DIRS.flatMap(walk).filter((f) => !NATIVE_DIALOG_EXCEPTIONS.includes(f));
    expect(files.flatMap(hits)).toEqual([]);
  });

  it('toda exceção existe e ainda tem diálogo (senão tire a linha de NATIVE_DIALOG_EXCEPTIONS)', () => {
    const stale = NATIVE_DIALOG_EXCEPTIONS.filter((f) => !fs.existsSync(path.join(ROOT, f)) || hits(f).length === 0);
    expect(stale).toEqual([]);
  });

  it('a lista de exceções está vazia (fim da D3a)', () => {
    expect(NATIVE_DIALOG_EXCEPTIONS).toEqual([]);
  });
});
