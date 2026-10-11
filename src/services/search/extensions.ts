import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';

/**
 * A busca usa pg_trgm + unaccent quando o banco tem as duas extensões E a função
 * `immutable_unaccent` (criada pela migration `*_search_trgm` só quando as extensões existem).
 * Sem isso, cai no fallback (ILIKE sobre translate()). A detecção roda UMA vez por processo
 * e fica em cache; instalar a extensão depois exige reiniciar a API (e reaplicar a migration
 * para criar a função e os índices).
 */
let cached: Promise<boolean> | null = null;

async function detect(): Promise<boolean> {
  const exts = await prisma.$queryRaw<{ extname: string }[]>`
    SELECT extname FROM pg_extension WHERE extname IN ('pg_trgm', 'unaccent')`;
  const names = new Set(exts.map((e) => e.extname));
  if (!names.has('pg_trgm') || !names.has('unaccent')) return false;
  const fn = await prisma.$queryRaw<{ n: number }[]>`
    SELECT 1 AS n FROM pg_proc WHERE proname = 'immutable_unaccent' LIMIT 1`;
  return fn.length > 0;
}

/**
 * Só o RESULTADO de uma detecção bem-sucedida fica em cache. Se a consulta falhar (banco
 * indisponível etc.), esta chamada usa o fallback e o cache é limpo: a próxima tenta de novo,
 * em vez de deixar o processo inteiro sem índice até reiniciar.
 */
export function hasSearchExtensions(): Promise<boolean> {
  if (!cached) {
    const attempt: Promise<boolean> = detect().then(
      (ok) => {
        logger.info(`busca: ${ok ? 'pg_trgm + unaccent' : 'fallback sem extensão (ILIKE/translate)'}`);
        return ok;
      },
      (err: unknown) => {
        logger.warn('busca: falha ao detectar extensões, usando fallback nesta chamada', {
          error: err instanceof Error ? err.message : String(err),
        });
        if (cached === attempt) cached = null;
        return false;
      },
    );
    cached = attempt;
  }
  return cached;
}

/** Só para teste: esquece a detecção em cache. */
export function resetSearchExtensionsCache(): void {
  cached = null;
}
