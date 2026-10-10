/**
 * Lote final F2 — a migration da busca nunca derruba o boot.
 * Se as extensões existem mas CREATE FUNCTION/INDEX falha (permissão, search_path, lock), o
 * `prisma migrate deploy` do boot não pode falhar: o bloco só avisa e a busca usa o fallback.
 * Reproduz a falha rodando o 2º bloco DO com um search_path sem schema (nada é criado; a
 * transação é desfeita no fim de qualquer jeito).
 */
import fs from 'fs';
import path from 'path';
import { prisma } from '../lib/prisma';

const MIGRATION = path.join(__dirname, '../../prisma/migrations/20261012110000_search_trgm/migration.sql');

function doBlocks(sql: string): string[] {
  return sql.match(/DO \$\$[\s\S]*?END \$\$;/g) ?? [];
}

afterAll(async () => {
  await prisma.$disconnect();
});

describe('migration search_trgm', () => {
  it('tem os dois blocos DO e ambos tratam qualquer erro', () => {
    const blocks = doBlocks(fs.readFileSync(MIGRATION, 'utf8'));
    expect(blocks).toHaveLength(2);
    for (const b of blocks) expect(b).toMatch(/EXCEPTION WHEN OTHERS THEN\s+RAISE NOTICE/);
  });

  it('falha ao criar função/índices vira NOTICE, não erro', async () => {
    const second = doBlocks(fs.readFileSync(MIGRATION, 'utf8'))[1];
    const ROLLBACK = new Error('rollback-f2');
    let ran = false;
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.$executeRawUnsafe('SET LOCAL search_path TO schema_inexistente_f2');
        await tx.$executeRawUnsafe(second);
        ran = true;
        throw ROLLBACK;
      }),
    ).rejects.toBe(ROLLBACK);
    expect(ran).toBe(true);
  });
});
