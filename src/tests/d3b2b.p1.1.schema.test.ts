/**
 * D3b-2b · P1.1 — migration d3b2b_verificacao_planos: os quatro tipos novos do histórico das contas
 * (no client E no banco), o cancelamento da mensalidade (cancelledAt/cancelledBy) e o motivo do
 * pedido de plano (requestReason). Os valores novos do enum são usados aqui, depois do commit da
 * migration: ADD VALUE não pode ser usado na mesma transação em que é criado.
 */
import { AdminAccountActionType } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser } from './helpers/authUser';

const DOMAIN = '@d3b2bp11.test';
const NEW_TYPES = ['plan_reject', 'saas_cancel', 'trial_extend', 'verification_decision'];

afterEach(async () => {
  // StoreSubscription não tem FK com Store: sai antes, pela loja da suíte.
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  await prisma.storeSubscription.deleteMany({ where: { storeId: { in: stores.map((s) => s.id) } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function lojaDaSuite(name: string) {
  const dono = await createTestUser('lojista', DOMAIN);
  return prisma.store.create({ data: { ownerId: dono.userId, name, isOpen: true } });
}

describe('schema da D3b-2b', () => {
  it('AdminAccountActionType tem os quatro tipos novos, no client e no banco', async () => {
    expect(Object.values(AdminAccountActionType).sort()).toEqual([
      'block', 'debt_forgive', 'disconnect', 'note', 'plan_reject', 'roles_change',
      'saas_cancel', 'store_pause', 'store_unpause', 'trial_extend', 'unblock', 'verification_decision',
    ]);
    const rows = await prisma.$queryRaw<{ v: string }[]>`SELECT unnest(enum_range(NULL::"AdminAccountActionType"))::text AS v`;
    expect(rows.map((r) => r.v)).toEqual(expect.arrayContaining(NEW_TYPES));
  });

  it('grava uma linha de cada tipo novo', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createTestUser('cliente', DOMAIN);
    for (const type of NEW_TYPES) {
      await prisma.adminAccountAction.create({
        data: { actorId: ceo.userId, actorRole: 'ceo', userId: alvo.userId, type: type as AdminAccountActionType },
      });
    }
    const got = await prisma.adminAccountAction.findMany({ where: { userId: alvo.userId }, select: { type: true } });
    expect(got.map((g) => g.type).sort()).toEqual(NEW_TYPES);
  });

  it('StoreSaasBilling ganha cancelledAt e cancelledBy, nulos por padrão', async () => {
    const store = await lojaDaSuite('Loja P11');
    const b = await prisma.storeSaasBilling.create({ data: { storeId: store.id, trialEndsAt: new Date('2026-11-01T00:00:00Z') } });
    expect(b).toMatchObject({ cancelledAt: null, cancelledBy: null });
    const when = new Date('2026-10-21T12:00:00Z');
    const saved = await prisma.storeSaasBilling.update({
      where: { id: b.id },
      data: { status: 'cancelled', cancelledAt: when, cancelledBy: 'admin-1' },
    });
    expect(saved).toMatchObject({ status: 'cancelled', cancelledAt: when, cancelledBy: 'admin-1' });
  });

  it('StoreSubscription ganha requestReason, nulo por padrão', async () => {
    const store = await lojaDaSuite('Loja P11b');
    const s = await prisma.storeSubscription.create({ data: { storeId: store.id, storeName: store.name } });
    expect(s.requestReason).toBeNull();
    const saved = await prisma.storeSubscription.update({ where: { id: s.id }, data: { requestReason: 'Quero vender mais' } });
    expect(saved.requestReason).toBe('Quero vender mais');
  });
});
