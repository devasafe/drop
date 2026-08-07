import { ensurePlatformConfig, updatePlatformConfig } from '../repositories/platformConfig.repository';
import { snapshotPlatformConfig } from './helpers/pgCleanup';

// PlatformConfig é um singleton compartilhado no Postgres de dev (sem banco de teste
// isolado) — sem restaurar, cardFeePercent=3.5/cardInstallmentMaxCount=10 vazariam
// permanentemente para o dev e para outras suítes que leem a config depois.
let restorePlatformConfig: () => Promise<void>;

beforeAll(async () => {
  restorePlatformConfig = await snapshotPlatformConfig();
});

afterAll(async () => {
  await restorePlatformConfig();
});

test('persiste os campos de parcelamento', async () => {
  await ensurePlatformConfig('system');
  const saved = await updatePlatformConfig({ cardFeePercent: 3.5, cardInstallmentMaxCount: 10 } as any, 'system');
  expect(Number(saved.cardFeePercent)).toBe(3.5);
  expect(saved.cardInstallmentMaxCount).toBe(10);
});
