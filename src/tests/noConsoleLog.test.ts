/**
 * Sandbox 2026-10-09: com o logger indo para os Runtime Logs do Coolify, os console.log soltos
 * (ex.: `[listAvailableDeliveries] user: {...}` a cada poll do motoboy) enterravam os logs úteis
 * e expunham dados do usuário. Código de runtime usa o `logger` (CLAUDE.md, princípio 6).
 * Ficam de fora: scripts de CLI, testes e o env.ts (roda antes do logger existir).
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..');
const ALLOWED = [path.join(SRC, 'scripts'), path.join(SRC, 'tests'), path.join(SRC, 'config', 'env.ts')];

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    if (ALLOWED.some((a) => p === a || p.startsWith(a + path.sep))) return [];
    if (e.isDirectory()) return walk(p);
    return p.endsWith('.ts') ? [p] : [];
  });
}

test('código de runtime não usa console.log/info/debug', () => {
  const offenders = walk(SRC).flatMap((file) =>
    fs.readFileSync(file, 'utf8').split('\n')
      .map((line, i) => ({ line, n: i + 1 }))
      // ignora menções dentro de string (ex.: dica de comando no encryption.ts)
      .filter(({ line }) => /(^|[^'"`\w.])console\.(log|info|debug)\(/.test(line))
      .map(({ n }) => `${path.relative(SRC, file)}:${n}`),
  );
  expect(offenders).toEqual([]);
});
