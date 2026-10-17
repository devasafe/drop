/**
 * D3b-3 · P3.4 — GET /admin/money/actions (spec 8): filtros, nome e papel de quem fez,
 * dias de São Paulo inclusivos e paginação por cursor. Linhas criadas direto no banco
 * (createMany com createdAt escolhido); as consultas filtram pelos atores da suíte.
 */
import request from 'supertest';
import { Prisma } from '@prisma/client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { listAdminMoneyActions } from '../services/moneyHistory.service';

const DOMAIN = '@d3b3p34.test';
let ceo: TestUser;
let gerente: TestUser;

const named = async (role: string, name: string) => {
  const u = await createTestUser(role, DOMAIN);
  await prisma.user.update({ where: { id: u.userId }, data: { name } });
  return u;
};

beforeEach(async () => {
  ceo = await named('ceo', 'Carla CEO');
  gerente = await named('gerente_geral', 'Gil Gerente');
});
afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

const row = (actor: TestUser, createdAt: string | Date, extra: Partial<Prisma.AdminMoneyActionCreateManyInput> = {}): Prisma.AdminMoneyActionCreateManyInput => ({
  actorId: actor.userId,
  actorRole: actor.role,
  type: 'payout_block',
  targetType: 'payout',
  targetId: 'p1',
  createdAt: new Date(createdAt),
  ...extra,
});

describe('listAdminMoneyActions', () => {
  it('mais recente primeiro, com nome e papel de quem fez; filtra por pessoa', async () => {
    await prisma.adminMoneyAction.createMany({
      data: [
        row(ceo, '2031-06-10T12:00:00.000Z', {
          type: 'wallet_adjust', targetType: 'wallet', targetId: 'w1', amount: 25.5, reason: 'Correção de saldo',
          before: { balance: 10 }, after: { balance: 35.5 },
        }),
        row(gerente, '2031-06-10T13:00:00.000Z', { reason: 'Suspeita' }),
        row(ceo, '2031-06-10T11:00:00.000Z', { type: 'cashbox_deposit', targetType: 'cashbox', targetId: 'c1', amount: 100 }),
      ],
    });

    const mine = await listAdminMoneyActions({ actorId: ceo.userId });
    expect(mine.nextCursor).toBeNull();
    expect(mine.items).toHaveLength(2);
    expect(mine.items[0]).toEqual({
      id: expect.any(String), at: '2031-06-10T12:00:00.000Z', actorId: ceo.userId, actorName: 'Carla CEO', actorRole: 'ceo',
      type: 'wallet_adjust', targetType: 'wallet', targetId: 'w1', amount: 25.5, reason: 'Correção de saldo',
      before: { balance: 10 }, after: { balance: 35.5 },
    });
    expect(mine.items[1]).toMatchObject({ type: 'cashbox_deposit', amount: 100, reason: null, before: null, after: null });

    const his = await listAdminMoneyActions({ actorId: gerente.userId });
    expect(his.items).toEqual([
      expect.objectContaining({ actorName: 'Gil Gerente', actorRole: 'gerente_geral', type: 'payout_block', amount: null, reason: 'Suspeita' }),
    ]);
  });

  it('filtra por tipo', async () => {
    await prisma.adminMoneyAction.createMany({
      data: [
        row(ceo, '2031-06-11T10:00:00.000Z'),
        row(ceo, '2031-06-11T11:00:00.000Z', { type: 'wallet_adjust', targetType: 'wallet' }),
        row(ceo, '2031-06-11T12:00:00.000Z'),
      ],
    });
    const page = await listAdminMoneyActions({ actorId: ceo.userId, type: 'payout_block' });
    expect(page.items.map((i) => i.at)).toEqual(['2031-06-11T12:00:00.000Z', '2031-06-11T10:00:00.000Z']);
  });

  it('from/to são dias de São Paulo, inclusivos', async () => {
    await prisma.adminMoneyAction.createMany({
      data: [
        row(ceo, '2031-07-01T02:59:59.999Z', { targetId: 'a' }), // 30/06 23:59 em SP
        row(ceo, '2031-07-01T03:00:00.000Z', { targetId: 'b' }), // 01/07 00:00
        row(ceo, '2031-07-02T02:59:59.999Z', { targetId: 'c' }), // 01/07 23:59
        row(ceo, '2031-07-02T03:00:00.000Z', { targetId: 'd' }), // 02/07 00:00
      ],
    });
    const ids = async (f: { from?: string; to?: string }) =>
      (await listAdminMoneyActions({ actorId: ceo.userId, ...f })).items.map((i) => i.targetId);
    expect(await ids({ from: '2031-07-01', to: '2031-07-01' })).toEqual(['c', 'b']);
    expect(await ids({ from: '2031-07-01' })).toEqual(['d', 'c', 'b']);
    expect(await ids({ to: '2031-06-30' })).toEqual(['a']);
  });

  it('pagina de 50 em 50 pelo cursor, sem repetir nem pular, com horários iguais', async () => {
    const T = new Date('2031-08-01T15:00:00.000Z');
    await prisma.adminMoneyAction.createMany({
      data: [
        ...Array.from({ length: 60 }, (_, i) => row(ceo, T, { targetId: `t${i}` })),
        ...Array.from({ length: 60 }, (_, i) => row(ceo, new Date(T.getTime() - (i + 1) * 1000), { targetId: `s${i}` })),
      ],
    });
    const sizes: number[] = [];
    const seen: string[] = [];
    const ats: number[] = [];
    let cursor: string | undefined;
    for (let i = 0; i < 5; i++) {
      const page = await listAdminMoneyActions({ actorId: ceo.userId, cursor });
      sizes.push(page.items.length);
      for (const it of page.items) {
        seen.push(it.id);
        ats.push(new Date(it.at).getTime());
      }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    expect(sizes).toEqual([50, 50, 20]);
    expect(new Set(seen).size).toBe(120);
    for (let i = 1; i < ats.length; i++) expect(ats[i]).toBeLessThanOrEqual(ats[i - 1]);
  });
});

const nulCursor = Buffer.from(JSON.stringify({ at: '2031-06-10T12:00:00.000Z', id: 'a\u0000b' }), 'utf8').toString('base64url');

describe('GET /api/admin/money/actions', () => {
  const get = (u: TestUser, qs = '') => request(app).get(`/api/admin/money/actions${qs}`).set('Authorization', bearer(u));

  it('CEO recebe { items, nextCursor } e o filtro por pessoa', async () => {
    await prisma.adminMoneyAction.createMany({ data: [row(ceo, '2031-06-10T12:00:00.000Z')] });
    const r = await get(ceo, `?actorId=${ceo.userId}&type=&from=&to=`);
    expect(r.status).toBe(200);
    expect(Object.keys(r.body).sort()).toEqual(['items', 'nextCursor']);
    expect(r.body.items).toHaveLength(1);
    expect(r.body.items[0]).toMatchObject({ actorId: ceo.userId, actorName: 'Carla CEO', actorRole: 'ceo', type: 'payout_block' });
  });

  it.each([
    ['?type=nao_existe'],
    ['?from=2031-7-1'],
    ['?from=2031-02-31'],
    ['?from=2031-07-02&to=2031-07-01'],
    ['?cursor=nao-e-cursor'],
    ['?to=9999-12-31'],
    ['?from=0000-01-01'],
    ['?from=0001-01-01'],
    ['?actorId=%00'],
    [`?cursor=${nulCursor}`],
  ])('%s → 400', async (qs) => {
    const r = await get(ceo, qs);
    expect(r.status).toBe(400);
    expect(typeof r.body.error).toBe('string');
  });

  it('papel sem money:overview → 403', async () => {
    expect((await get(gerente)).status).toBe(403);
  });
});

describe('GET /api/admin/money/movements com NUL no cursor', () => {
  it('→ 400', async () => {
    const r = await request(app).get(`/api/admin/money/movements?cursor=${nulCursor}`).set('Authorization', bearer(ceo));
    expect(r.status).toBe(400);
  });
});
