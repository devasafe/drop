/**
 * D3b-2a · P1.1 — fundação de Pessoas e Lojas: schema (AdminAccountAction com o CHECK de um alvo
 * só, dívida perdoada, pausa do admin, último acesso), o registro único recordAccountAction, a
 * linha do tempo listTimeline, a validação de motivo e nota e a permissão nova user:debt_forgive.
 */
import request from 'supertest';
import { AdminAccountActionType, CustomerDebtStatus } from '@prisma/client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { storeIdForProduct } from './helpers/storeOwner';
import { recordAccountAction, listTimeline } from '../services/adminAccounts/actions';
import { AccountActionError, parseNoteText, parseOptionalReason, parseRequiredReason } from '../services/adminAccounts/errors';
import { ALL_PERMISSIONS, CEO_ONLY_PERMISSIONS, getEffectivePermissions } from '../controllers/rolePermissionsController';
import { hasPermission, rolePermissions } from '../utils/walletCalculations';

const DOMAIN = '@d3b2ap11.test';
const CHECK_ROW_ID = 'd3b2ap11-check';
let ceo: TestUser;
let alvo: TestUser;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  alvo = await createTestUser('cliente', DOMAIN);
});
afterEach(async () => {
  // A linha sem alvo só existiria se o CHECK faltasse: não fica para a próxima rodada.
  await prisma.$executeRawUnsafe(`DELETE FROM "AdminAccountAction" WHERE "id" = '${CHECK_ROW_ID}'`).catch(() => undefined);
  await cleanupUsersByEmailDomain(DOMAIN);
});

/** "<status> <code>" do AccountActionError lançado por `fn`, ou null se não lançou. */
function errorOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof AccountActionError ? `${err.status} ${err.code}` : `outro erro: ${(err as Error).message}`;
  }
}

describe('schema da D3b-2a', () => {
  it('enums e campos novos', async () => {
    expect(Object.values(AdminAccountActionType).sort()).toEqual(
      ['block', 'debt_forgive', 'disconnect', 'note', 'roles_change', 'store_pause', 'store_unpause', 'unblock'],
    );
    expect(Object.values(CustomerDebtStatus).sort()).toEqual(['collected', 'forgiven', 'pending']);

    const user = await prisma.user.findUniqueOrThrow({ where: { id: alvo.userId } });
    expect(user.lastSeenAt).toBeNull();

    const store = await prisma.store.findUniqueOrThrow({ where: { id: await storeIdForProduct(DOMAIN, 'Loja P1.1') } });
    expect(store.adminPausedAt).toBeNull();
    expect(store.adminPausedBy).toBeNull();
    expect(store.adminPauseReason).toBeNull();

    const debt = await prisma.customerDebt.create({
      data: { customerId: alvo.userId, amount: 9.9, sourceOrderId: 'pedido-p11', reason: 'Cancelamento tardio' },
    });
    expect(debt.forgivenAt).toBeNull();
    expect(debt.forgivenBy).toBeNull();
    const forgiven = await prisma.customerDebt.update({
      where: { id: debt.id },
      data: { status: 'forgiven', forgivenAt: new Date(), forgivenBy: ceo.userId },
    });
    expect(forgiven.status).toBe('forgiven');
    expect(forgiven.forgivenBy).toBe(ceo.userId);
  });

  it('CHECK: exatamente um alvo, pessoa OU loja', async () => {
    const storeId = await storeIdForProduct(DOMAIN, 'Loja CHECK');
    await expect(prisma.$executeRawUnsafe(
      `INSERT INTO "AdminAccountAction" ("id", "actorId", "actorRole", "type") VALUES ('${CHECK_ROW_ID}', 'ator', 'ceo', 'note')`,
    )).rejects.toThrow(/AdminAccountAction_one_target_check/);
    await expect(prisma.adminAccountAction.create({
      data: { actorId: ceo.userId, actorRole: 'ceo', type: 'note', reason: 'dois alvos', userId: alvo.userId, storeId },
    })).rejects.toThrow();
    expect(await prisma.adminAccountAction.count({ where: { actorId: { in: [ceo.userId, 'ator'] } } })).toBe(0);

    const soPessoa = await prisma.adminAccountAction.create({
      data: { actorId: ceo.userId, actorRole: 'ceo', type: 'note', reason: 'só a pessoa', userId: alvo.userId },
    });
    const soLoja = await prisma.adminAccountAction.create({
      data: { actorId: ceo.userId, actorRole: 'ceo', type: 'note', reason: 'só a loja', storeId },
    });
    expect(soPessoa.userId).toBe(alvo.userId);
    expect(soPessoa.storeId).toBeNull();
    expect(soLoja.storeId).toBe(storeId);
    expect(soLoja.userId).toBeNull();
  });
});

describe('recordAccountAction', () => {
  it('grava autor, alvo, tipo, motivo e meta na transação de quem chama', async () => {
    const row = await prisma.$transaction((tx) => recordAccountAction(tx, {
      actor: { id: ceo.userId, role: 'ceo' }, userId: alvo.userId, type: 'block',
      reason: '  Fraude confirmada  ', meta: { before: 'active' },
    }));
    expect(row).toMatchObject({
      actorId: ceo.userId, actorRole: 'ceo', userId: alvo.userId, storeId: null,
      type: 'block', reason: 'Fraude confirmada', meta: { before: 'active' },
    });
    expect(row.createdAt).toBeInstanceOf(Date);
  });

  it('se a ação falha depois, a linha sai junto (rollback)', async () => {
    await expect(prisma.$transaction(async (tx) => {
      await recordAccountAction(tx, { actor: { id: ceo.userId, role: 'ceo' }, userId: alvo.userId, type: 'disconnect' });
      throw new Error('a ação falhou');
    })).rejects.toThrow('a ação falhou');
    expect(await prisma.adminAccountAction.count({ where: { userId: alvo.userId } })).toBe(0);
  });

  it('recusa sem alvo, com dois alvos e sem autor', async () => {
    const storeId = await storeIdForProduct(DOMAIN, 'Loja recusa');
    const actor = { id: ceo.userId, role: 'ceo' };
    await expect(prisma.$transaction((tx) => recordAccountAction(tx, { actor, type: 'note', reason: 'sem alvo' })))
      .rejects.toThrow('exatamente um alvo');
    await expect(prisma.$transaction((tx) => recordAccountAction(tx, { actor, userId: alvo.userId, storeId, type: 'note', reason: 'dois' })))
      .rejects.toThrow('exatamente um alvo');
    await expect(prisma.$transaction((tx) => recordAccountAction(tx, { actor: { id: '  ', role: 'ceo' }, userId: alvo.userId, type: 'note' })))
      .rejects.toThrow('sem autor');
    expect(await prisma.adminAccountAction.count({ where: { OR: [{ userId: alvo.userId }, { storeId }] } })).toBe(0);
  });

  it('aceita o ator system (job); motivo só de espaços vira null', async () => {
    const storeId = await storeIdForProduct(DOMAIN, 'Loja job');
    const row = await prisma.$transaction((tx) => recordAccountAction(tx, {
      actor: { id: 'system', role: 'system' }, storeId, type: 'store_pause', reason: '   ',
    }));
    expect(row).toMatchObject({ actorId: 'system', actorRole: 'system', storeId, userId: null, reason: null, meta: null });
  });
});

describe('listTimeline', () => {
  it('a mais nova primeiro, só do alvo pedido, com o nome do autor; system sem nome', async () => {
    const outra = await createTestUser('cliente', DOMAIN);
    const base = Date.now() - 60_000;
    const mk = (userId: string, reason: string, ms: number, actorId = ceo.userId) =>
      prisma.adminAccountAction.create({
        data: { actorId, actorRole: actorId === 'system' ? 'system' : 'ceo', userId, type: 'note', reason, createdAt: new Date(base + ms) },
      });
    await mk(alvo.userId, 'primeira', 0);
    await mk(alvo.userId, 'segunda', 1000, 'system');
    await mk(outra.userId, 'de outra pessoa', 2000);

    const page = await listTimeline({ userId: alvo.userId });
    expect(page.nextCursor).toBeNull();
    expect(page.items.map((i) => i.reason)).toEqual(['segunda', 'primeira']);
    expect(page.items[0].actor).toEqual({ id: 'system', name: null, role: 'system' });
    expect(page.items[1].actor).toEqual({ id: ceo.userId, name: 'User ceo', role: 'ceo' });
    expect(page.items[1]).toMatchObject({ type: 'note', meta: null, createdAt: new Date(base).toISOString() });
    expect(Object.keys(page.items[1]).sort()).toEqual(['actor', 'createdAt', 'id', 'meta', 'reason', 'type']);
  });

  it('cursor com empate de createdAt não repete nem pula', async () => {
    const at = new Date(Date.now() - 30_000);
    const ids: string[] = [];
    for (const reason of ['a', 'b', 'c', 'd', 'e']) {
      const row = await prisma.adminAccountAction.create({
        data: { actorId: ceo.userId, actorRole: 'ceo', userId: alvo.userId, type: 'note', reason, createdAt: at },
      });
      ids.push(row.id);
    }
    const seen: string[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await listTimeline({ userId: alvo.userId, limit: 2, cursor });
      seen.push(...page.items.map((x) => x.id));
      cursor = page.nextCursor ?? undefined;
      pages++;
    } while (cursor && pages < 10);
    expect(pages).toBe(3);
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect([...seen].sort()).toEqual([...ids].sort());
  });

  it('loja: só as linhas da loja; cursor inválido = 400 INVALID_CURSOR; sem alvo lança', async () => {
    const storeId = await storeIdForProduct(DOMAIN, 'Loja timeline');
    await prisma.adminAccountAction.create({ data: { actorId: ceo.userId, actorRole: 'ceo', storeId, type: 'store_pause', reason: 'Fraude' } });
    await prisma.adminAccountAction.create({ data: { actorId: ceo.userId, actorRole: 'ceo', userId: alvo.userId, type: 'note', reason: 'pessoa' } });
    const page = await listTimeline({ storeId });
    expect(page.items.map((i) => i.type)).toEqual(['store_pause']);

    await expect(listTimeline({ storeId, cursor: 'xxx' })).rejects.toMatchObject({ status: 400, code: 'INVALID_CURSOR' });
    await expect(listTimeline({})).rejects.toThrow('exatamente um alvo');
  });
});

describe('motivo e nota', () => {
  it('motivo obrigatório: trim, de 5 a 500', () => {
    expect(parseRequiredReason('  Fraude  ')).toBe('Fraude');
    expect(parseRequiredReason('x'.repeat(500))).toHaveLength(500);
    for (const raw of [undefined, null, '', '    ', 'abcd', '  abcd  ', 'x'.repeat(501), 42, { reason: 'Fraude' }]) {
      expect(errorOf(() => parseRequiredReason(raw))).toBe('400 REASON_REQUIRED');
    }
  });

  it('motivo opcional: ausente ou vazio vira null; se vier, de 5 a 500', () => {
    for (const raw of [undefined, null, '', '   ']) expect(parseOptionalReason(raw)).toBeNull();
    expect(parseOptionalReason(' Pagou tudo ')).toBe('Pagou tudo');
    for (const raw of ['ok', 'x'.repeat(501), 7]) {
      expect(errorOf(() => parseOptionalReason(raw))).toBe('400 REASON_REQUIRED');
    }
  });

  it('nota: trim, de 1 a 2000', () => {
    expect(parseNoteText('  a  ')).toBe('a');
    expect(parseNoteText('x'.repeat(2000))).toHaveLength(2000);
    for (const raw of [undefined, '', '   ', 'x'.repeat(2001), 10]) {
      expect(errorOf(() => parseNoteText(raw))).toBe('400 NOTE_INVALID');
    }
  });
});

describe('permissão user:debt_forgive', () => {
  it('está no catálogo (Usuários), só o CEO tem por padrão e é delegável', () => {
    expect(ALL_PERMISSIONS).toContainEqual({
      key: 'user:debt_forgive', label: 'Perdoar dívida de cliente (multa de cancelamento)', category: 'Usuários',
    });
    expect(hasPermission('ceo', 'user:debt_forgive')).toBe(true);
    for (const role of Object.keys(rolePermissions).filter((r) => r !== 'ceo')) {
      expect(rolePermissions[role]).not.toContain('user:debt_forgive');
    }
    expect(CEO_ONLY_PERMISSIONS).not.toContain('user:debt_forgive');
  });

  it('o CEO concede a permissão a um gerente em Permissões', async () => {
    const list = await request(app).get('/api/role-permissions').set('Authorization', bearer(ceo));
    expect(list.status).toBe(200);
    expect(list.body.allPermissions.map((p: any) => p.key)).toContain('user:debt_forgive');

    const previous = await prisma.rolePermissions.findUnique({ where: { role: 'gerente_geral' } });
    try {
      const base = (await getEffectivePermissions('gerente_geral')).permissions;
      const r = await request(app)
        .put('/api/role-permissions/gerente_geral')
        .set('Authorization', bearer(ceo))
        .send({ permissions: [...base, 'user:debt_forgive'], notificationTargets: [] });
      expect(r.status).toBe(200);
      expect((await getEffectivePermissions('gerente_geral')).permissions).toContain('user:debt_forgive');
    } finally {
      if (previous) {
        await prisma.rolePermissions.update({
          where: { role: 'gerente_geral' },
          data: { permissions: previous.permissions, notificationTargets: previous.notificationTargets, updatedBy: previous.updatedBy },
        });
      } else {
        await prisma.rolePermissions.deleteMany({ where: { role: 'gerente_geral' } });
      }
    }
  });
});
