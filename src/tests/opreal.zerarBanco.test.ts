/**
 * Zerar o banco para a operação real: ficam só as permissões (RolePermissions), as taxas
 * (PlatformConfig e PricingPlan) e a conta indicada; todo o resto é apagado.
 * ATENÇÃO: roda no banco de teste e apaga tudo nele (as suítes criam os próprios dados).
 */
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { resetDatabase, countRows, KEEP_TABLES } from '../scripts/resetDatabase';
import { grantStoreConsent } from './helpers/storeConsent';

const KEEP = 'Fica@OprealZerar.test';

beforeAll(() => prisma.user.deleteMany({ where: { email: { equals: KEEP, mode: 'insensitive' } } }));

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: { equals: KEEP, mode: 'insensitive' } } });
  await prisma.$disconnect();
});

async function seed() {
  const ceo = await prisma.user.create({ data: { name: 'Dono', email: KEEP.toLowerCase(), passwordHash: 'x', role: 'ceo', roles: ['ceo'], asaas: { walletId: 'w_sandbox' } } as any });
  const outro = await prisma.user.create({ data: { name: 'Lojista', email: `lojista${Date.now()}@oprealzerar.test`, passwordHash: 'x', role: 'lojista', roles: ['lojista'] } as any });
  const store = await prisma.store.create({ data: { ownerId: outro.id, name: 'Loja Zerar', isOpen: true } as any });
  await prisma.storeAsaasAccount.create({ data: { storeId: store.id, apiKeyEncrypted: encryptSensitiveData('$aact_hmlg_Z'), apiKeyLast4: 'ZZZZ', environment: 'sandbox', status: 'valid' } });
  await grantStoreConsent(store.id); // tabela só-INSERT: o TRUNCATE precisa passar por ela
  await prisma.order.create({ data: { customerId: ceo.id, storeId: store.id, totalValue: 10, deliveryFee: 0, status: 'entregue', paymentMethod: 'pix', paymentStatus: 'paid' } as any });
  return ceo;
}

describe('resetDatabase', () => {
  it('simulação: só conta, não apaga nada', async () => {
    await seed();
    const before = await countRows(prisma);
    const plan = await resetDatabase(prisma, KEEP, { confirm: false });
    expect(plan.executed).toBe(false);
    expect(await countRows(prisma)).toEqual(before);
    expect(plan.keptUser.email).toBe(KEEP.toLowerCase());
  });

  it('zera tudo, menos permissões, taxas e a conta indicada (sem os dados de sandbox dela)', async () => {
    const roleRows = await prisma.rolePermissions.count();
    const cfg = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
    const plans = await prisma.pricingPlan.count();

    const result = await resetDatabase(prisma, KEEP, { confirm: true });
    expect(result.executed).toBe(true);

    const after = await countRows(prisma);
    for (const [table, n] of Object.entries(after)) {
      if (table === 'User') expect(n).toBe(1);
      else if (!KEEP_TABLES.includes(table)) expect({ table, n }).toEqual({ table, n: 0 });
    }
    expect(await prisma.rolePermissions.count()).toBe(roleRows);
    expect(await prisma.pricingPlan.count()).toBe(plans);
    const cfgAfter = await prisma.platformConfig.findFirst({ orderBy: { updatedAt: 'asc' } });
    expect(cfgAfter?.id).toBe(cfg?.id);
    const [kept] = await prisma.user.findMany();
    expect(kept.email).toBe(KEEP.toLowerCase());
    expect(kept.asaas).toBeNull();
    // A trava da tabela de aceites voltou ligada depois do zeramento.
    const loja = await prisma.store.create({ data: { ownerId: kept.id, name: 'Loja Trava', isOpen: true } as any });
    await grantStoreConsent(loja.id);
    await expect(prisma.$executeRawUnsafe('DELETE FROM "StoreAsaasConsent"')).rejects.toThrow();
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe('SET LOCAL session_replication_role = replica');
      await tx.$executeRawUnsafe('DELETE FROM "StoreAsaasConsent"');
    });
    await prisma.store.delete({ where: { id: loja.id } });
  });

  it('recusa sem a conta indicada (não apaga nada)', async () => {
    await expect(resetDatabase(prisma, 'ninguem@oprealzerar.test', { confirm: true })).rejects.toThrow('não encontrada');
    expect(await prisma.user.count()).toBe(1);
  });
});
