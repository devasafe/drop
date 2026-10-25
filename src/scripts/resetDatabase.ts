/**
 * Zera o banco para começar a operação real. Ficam só:
 *  - as permissões dos papéis (RolePermissions);
 *  - as taxas e regras (PlatformConfig e PricingPlan);
 *  - a conta indicada (o resto dos usuários sai), sem os dados de sandbox dela (asaas = null).
 * Todo o resto (lojas, produtos, pedidos, carteiras, notificações, históricos…) é apagado.
 *
 * Uso no container de produção (Coolify → Terminal), DEPOIS de um backup do Postgres:
 *   node dist/scripts/resetDatabase.js 2kasafe@gmail.com            → simulação: só mostra as contagens
 *   node dist/scripts/resetDatabase.js 2kasafe@gmail.com --confirm=ZERAR   → apaga de verdade
 *
 * TRUNCATE numa transação só, sem CASCADE: falha inteiro se alguma tabela mantida apontar para
 * uma apagada. As travas próprias das tabelas (StoreAsaasConsent é só-INSERT) saem e voltam dentro
 * da mesma transação.
 */
import { PrismaClient } from '@prisma/client';

export const KEEP_TABLES = ['RolePermissions', 'PlatformConfig', 'PricingPlan'];
const NEVER_TOUCH = ['_prisma_migrations'];

const quote = (t: string) => `"${t.replace(/"/g, '""')}"`;

async function tables(db: PrismaClient): Promise<string[]> {
  const rows = await db.$queryRaw<{ table_name: string }[]>`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
    ORDER BY table_name`;
  return rows.map((r) => r.table_name).filter((t) => !NEVER_TOUCH.includes(t));
}

/** Linhas por tabela (exceto _prisma_migrations). */
export async function countRows(db: PrismaClient): Promise<Record<string, number>> {
  const out: Record<string, number> = {};
  for (const t of await tables(db)) {
    const [{ n }] = await db.$queryRawUnsafe<{ n: bigint }[]>(`SELECT COUNT(*)::bigint AS n FROM ${quote(t)}`);
    out[t] = Number(n);
  }
  return out;
}

export interface ResetResult {
  executed: boolean;
  keptUser: { id: string; email: string; role: string | null };
  truncated: string[];
  before: Record<string, number>;
}

export async function resetDatabase(db: PrismaClient, keepEmail: string, opts: { confirm: boolean }): Promise<ResetResult> {
  const matches = await db.user.findMany({
    where: { email: { equals: keepEmail.trim(), mode: 'insensitive' } },
    select: { id: true, email: true, role: true },
  });
  if (matches.length !== 1) {
    throw new Error(matches.length === 0 ? `Conta ${keepEmail} não encontrada: nada foi apagado` : `Mais de uma conta com ${keepEmail}: nada foi apagado`);
  }
  const keptUser = matches[0] as ResetResult['keptUser'];
  const all = await tables(db);
  const truncated = all.filter((t) => t !== 'User' && !KEEP_TABLES.includes(t));
  const before = await countRows(db);
  if (!opts.confirm) return { executed: false, keptUser, truncated, before };

  // Tabelas com trava própria (ex.: StoreAsaasConsent recusa UPDATE/DELETE/TRUNCATE): as travas
  // saem só durante esta transação e voltam antes do commit; se algo falhar, nada muda.
  const guarded = await db.$queryRaw<{ table_name: string }[]>`
    SELECT DISTINCT c.relname AS table_name FROM pg_trigger t
    JOIN pg_class c ON c.oid = t.tgrelid JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND NOT t.tgisinternal`;
  const toUnguard = guarded.map((g) => g.table_name).filter((t) => truncated.includes(t));

  await db.$transaction(async (tx) => {
    for (const t of toUnguard) await tx.$executeRawUnsafe(`ALTER TABLE ${quote(t)} DISABLE TRIGGER USER`);
    await tx.$executeRawUnsafe(`TRUNCATE TABLE ${truncated.map(quote).join(', ')} RESTART IDENTITY`);
    for (const t of toUnguard) await tx.$executeRawUnsafe(`ALTER TABLE ${quote(t)} ENABLE TRIGGER USER`);
    await tx.$executeRaw`DELETE FROM "User" WHERE "id" <> ${keptUser.id}`;
    await tx.$executeRaw`UPDATE "User" SET "asaas" = NULL WHERE "id" = ${keptUser.id}`;
  }, { timeout: 120_000 });
  return { executed: true, keptUser, truncated, before };
}

async function main() {
  const email = process.argv[2];
  const confirm = process.argv.includes('--confirm=ZERAR');
  if (!email || email.startsWith('--')) {
    console.error('Uso: node dist/scripts/resetDatabase.js <email-da-conta-que-fica> [--confirm=ZERAR]');
    process.exit(2);
  }
  const db = new PrismaClient();
  try {
    const r = await resetDatabase(db, email, { confirm });
    console.log(`Conta que fica: ${r.keptUser.email} (${r.keptUser.role ?? 'sem papel'})`);
    console.log(`Ficam: ${KEEP_TABLES.join(', ')} e essa conta em User.`);
    console.log('Linhas antes:');
    for (const [t, n] of Object.entries(r.before)) if (n > 0) console.log(`  ${t}: ${n}`);
    if (!r.executed) {
      console.log(`\nSIMULAÇÃO: nada foi apagado. ${r.truncated.length} tabelas seriam zeradas e ${r.before.User - 1} usuário(s) sairiam.`);
      console.log('Para apagar de verdade (faça o backup antes): acrescente --confirm=ZERAR');
    } else {
      console.log(`\nFeito: ${r.truncated.length} tabelas zeradas; ficou só ${r.keptUser.email} em User.`);
    }
  } catch (err) {
    console.error(`ERRO: ${(err as Error).message}`);
    process.exitCode = 1;
  } finally {
    await db.$disconnect();
  }
}

if (require.main === module) void main();
