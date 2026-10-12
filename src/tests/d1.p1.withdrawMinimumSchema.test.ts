import { prisma } from '../lib/prisma';
import { getPlatformConfig, updatePlatformConfig, ensurePlatformConfig } from '../repositories/platformConfig.repository';
import { snapshotPlatformConfig } from './helpers/pgCleanup';

let restore: () => Promise<void>;
beforeAll(async () => { restore = await snapshotPlatformConfig(); await ensurePlatformConfig('test'); });
afterAll(async () => { await restore(); });

const num = (v: unknown) => parseFloat(String(v).replace(/[^\d.]/g, ''));

it('as duas colunas de saque mínimo existem com default 10', async () => {
  const rows = await prisma.$queryRaw<Array<{ column_name: string; column_default: string | null }>>`
    SELECT column_name, column_default FROM information_schema.columns
    WHERE table_name = 'PlatformConfig' AND column_name IN ('storeMinimumWithdraw', 'motoboyMinimumWithdraw')`;
  const byName = Object.fromEntries(rows.map((r) => [r.column_name, r.column_default]));
  expect(num(byName.storeMinimumWithdraw)).toBe(10);
  expect(num(byName.motoboyMinimumWithdraw)).toBe(10);
});

it('o repositório devolve os dois mínimos como número', async () => {
  await updatePlatformConfig({ storeMinimumWithdraw: 12.5 } as any, 'test');
  const c = await getPlatformConfig();
  expect(c.storeMinimumWithdraw).toBe(12.5);
  expect(typeof c.motoboyMinimumWithdraw).toBe('number');
});
