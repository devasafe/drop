/**
 * D3b-3 · P2.2 — caixa da plataforma (spec 4.5).
 * Pedir retirada grava requestedBy e cashbox_withdrawal_request. Aprovar: quem pediu não aprova
 * se existe outra pessoa apta (403 CASHBOX_SELF_APPROVAL); com uma pessoa só, aprova e o registro
 * mostra actorId === requestedBy. Rejeitar é condicional (409 CASHBOX_WITHDRAWAL_NOT_PENDING).
 * Depositar grava cashbox_deposit. Cada ação grava exatamente uma linha.
 */
import request from 'supertest';
import { Role } from '@prisma/client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import * as cashboxApproval from '../services/cashboxApproval.service';
import * as moneyActions from '../services/adminMoneyAction.service';

const DOMAIN = '@d3b3p22.test';
const TAG = 'd3b3p22';
const FUNDO = 1_000_000;
let ceo: TestUser;
let ceo2: TestUser;

// Override de RolePermissions é global: guardamos e restauramos o papel tocado.
const TOUCHED: Role = 'gerente_motoboys';
let snapshot: { role: Role; permissions: string[]; notificationTargets: Role[]; updatedBy: string }[] = [];

beforeAll(async () => {
  snapshot = await prisma.rolePermissions.findMany({
    where: { role: TOUCHED },
    select: { role: true, permissions: true, notificationTargets: true, updatedBy: true },
  });
});
afterAll(async () => {
  await prisma.rolePermissions.deleteMany({ where: { role: TOUCHED } });
  for (const row of snapshot) await prisma.rolePermissions.create({ data: row });
});

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  ceo2 = await createTestUser('ceo', DOMAIN);
  if (!(await prisma.appCashbox.findFirst())) await prisma.appCashbox.create({ data: {} });
  // o controller lê o caixa com findFirst (sem ordem): garante saldo em todos
  await prisma.appCashbox.updateMany({ data: { balance: { increment: FUNDO } } });
});

afterEach(async () => {
  jest.restoreAllMocks();
  // desfaz exatamente o efeito das entradas da suíte no caixa e apaga as entradas e retiradas
  const mine = await prisma.withdrawal.findMany({ where: { reason: { startsWith: TAG } }, select: { id: true } });
  const ids = mine.map((w) => w.id);
  const entries = await prisma.appCashboxEntry.findMany({
    where: { OR: [{ withdrawalId: { in: ids } }, { reason: { startsWith: TAG } }] },
  });
  for (const e of entries) {
    const amount = Number(e.amount);
    await prisma.appCashbox.update({
      where: { id: e.appCashboxId },
      data: e.type === 'deposit'
        ? { balance: { decrement: amount }, totalIncome: { decrement: amount } }
        : { balance: { increment: amount }, totalExpenses: { decrement: amount } },
    });
  }
  await prisma.appCashboxEntry.deleteMany({ where: { id: { in: entries.map((e) => e.id) } } });
  await prisma.withdrawal.deleteMany({ where: { id: { in: ids } } });
  await prisma.adminMoneyAction.deleteMany({ where: { targetId: { in: ids } } });
  await prisma.appCashbox.updateMany({ data: { balance: { decrement: FUNDO } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const pedir = (who: TestUser, amount = 40) =>
  request(app).post('/api/admin/app-cashbox/withdrawal').set('Authorization', bearer(who))
    .send({ amount, reason: `${TAG} retirada de teste`, bankInfo: { pixKey: 'x' } });
const aprovar = (who: TestUser, id: string) =>
  request(app).put(`/api/admin/app-cashbox/withdrawals/${id}/approve`).set('Authorization', bearer(who)).send({});
const rejeitar = (who: TestUser, id: string, rejectionReason = 'Conta errada') =>
  request(app).put(`/api/admin/app-cashbox/withdrawals/${id}/reject`).set('Authorization', bearer(who)).send({ rejectionReason });
const linhas = (id: string, type?: string) =>
  prisma.adminMoneyAction.findMany({ where: { targetId: id, ...(type ? { type: type as any } : {}) } });

describe('pedir retirada', () => {
  it('grava requestedBy e uma linha cashbox_withdrawal_request', async () => {
    const r = await pedir(ceo);
    expect(r.status).toBe(200);
    const id = r.body.withdrawal._id;
    expect(r.body.withdrawal.requestedBy).toBe(ceo.userId);
    const l = await linhas(id);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      type: 'cashbox_withdrawal_request', targetType: 'cashbox_withdrawal', actorId: ceo.userId,
      reason: `${TAG} retirada de teste`, after: { status: 'pending', requestedBy: ceo.userId },
    });
    expect(Number(l[0].amount)).toBe(40);
  });
});

describe('aprovar', () => {
  it('quem pediu, com outra pessoa apta → 403 CASHBOX_SELF_APPROVAL e nada muda', async () => {
    const id = (await pedir(ceo)).body.withdrawal._id;
    const r = await aprovar(ceo, id);
    expect(r.status).toBe(403);
    expect(r.body).toEqual({ error: 'Outra pessoa precisa aprovar esta retirada', code: 'CASHBOX_SELF_APPROVAL' });
    expect((await prisma.withdrawal.findUnique({ where: { id } }))?.status).toBe('pending');
    expect(await prisma.appCashboxEntry.count({ where: { withdrawalId: id } })).toBe(0);
    expect(await linhas(id, 'cashbox_withdrawal_approve')).toHaveLength(0);
  });

  it('outra pessoa aprova → 200, débito no caixa e uma linha com selfApproved false', async () => {
    const id = (await pedir(ceo)).body.withdrawal._id;
    const r = await aprovar(ceo2, id);
    expect(r.status).toBe(200);
    expect(await prisma.appCashboxEntry.count({ where: { withdrawalId: id } })).toBe(1);
    const l = await linhas(id, 'cashbox_withdrawal_approve');
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      actorId: ceo2.userId,
      before: { status: 'pending', requestedBy: ceo.userId },
      after: { status: 'approved', approvedBy: ceo2.userId, selfApproved: false },
    });
  });

  it('uma pessoa só → aprova a própria e o registro mostra actorId === requestedBy', async () => {
    const id = (await pedir(ceo)).body.withdrawal._id;
    jest.spyOn(cashboxApproval, 'hasOtherCashboxApprover').mockResolvedValue(false);
    const r = await aprovar(ceo, id);
    expect(r.status).toBe(200);
    const l = await linhas(id, 'cashbox_withdrawal_approve');
    expect(l).toHaveLength(1);
    expect(l[0].actorId).toBe(ceo.userId);
    expect(l[0].after).toMatchObject({ approvedBy: ceo.userId, selfApproved: true });
  });

  it('já rejeitada → 409 CASHBOX_WITHDRAWAL_NOT_PENDING com currentStatus (antes 400)', async () => {
    const id = (await pedir(ceo)).body.withdrawal._id;
    expect((await rejeitar(ceo2, id)).status).toBe(200);
    const r = await aprovar(ceo2, id);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'CASHBOX_WITHDRAWAL_NOT_PENDING', currentStatus: 'rejected' });
  });

  it('duas aprovações simultâneas → um 200, um 409 e um único débito', async () => {
    const id = (await pedir(ceo)).body.withdrawal._id;
    const gerente = await createTestUser('ceo', DOMAIN);
    const [a, b] = await Promise.all([aprovar(ceo2, id), aprovar(gerente, id)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((a.status === 409 ? a : b).body.code).toBe('CASHBOX_WITHDRAWAL_NOT_PENDING');
    expect(await prisma.appCashboxEntry.count({ where: { withdrawalId: id } })).toBe(1);
    expect(await linhas(id, 'cashbox_withdrawal_approve')).toHaveLength(1);
  });

  it('falha ao gravar a linha desfaz a aprovação e o débito', async () => {
    const id = (await pedir(ceo)).body.withdrawal._id;
    jest.spyOn(moneyActions, 'recordAdminMoneyAction').mockRejectedValueOnce(new Error('falha ao gravar a linha'));
    expect((await aprovar(ceo2, id)).status).toBe(500);
    expect((await prisma.withdrawal.findUnique({ where: { id } }))?.status).toBe('pending');
    expect(await prisma.appCashboxEntry.count({ where: { withdrawalId: id } })).toBe(0);
  });
});

describe('rejeitar', () => {
  it('rejeita com linha cashbox_withdrawal_reject; a segunda vez é 409 e não grava de novo', async () => {
    const id = (await pedir(ceo)).body.withdrawal._id;
    const r = await rejeitar(ceo2, id);
    expect(r.status).toBe(200);
    expect(r.body.withdrawal).toMatchObject({ status: 'rejected', processedBy: ceo2.userId, rejectionReason: 'Conta errada' });
    const again = await rejeitar(ceo2, id, 'Outro motivo');
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'CASHBOX_WITHDRAWAL_NOT_PENDING', currentStatus: 'rejected' });
    expect((await prisma.withdrawal.findUnique({ where: { id } }))?.rejectionReason).toBe('Conta errada');
    const l = await linhas(id, 'cashbox_withdrawal_reject');
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      actorId: ceo2.userId, reason: 'Conta errada',
      before: { status: 'pending', requestedBy: ceo.userId }, after: { status: 'rejected', rejectedBy: ceo2.userId },
    });
  });

  it('duas rejeições simultâneas → um 200 e um 409, uma linha', async () => {
    const id = (await pedir(ceo)).body.withdrawal._id;
    const [a, b] = await Promise.all([rejeitar(ceo, id), rejeitar(ceo2, id)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await linhas(id, 'cashbox_withdrawal_reject')).toHaveLength(1);
  });
});

describe('depositar', () => {
  it('grava uma linha cashbox_deposit com saldo antes e depois', async () => {
    const r = await request(app).post('/api/admin/app-cashbox/deposit').set('Authorization', bearer(ceo))
      .send({ amount: 12.5, reason: `${TAG} aporte` });
    expect(r.status).toBe(200);
    const cashboxId = r.body.cashbox.id;
    const l = await prisma.adminMoneyAction.findMany({ where: { type: 'cashbox_deposit', actorId: ceo.userId } });
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ targetType: 'cashbox', targetId: cashboxId, reason: `${TAG} aporte` });
    expect(Number(l[0].amount)).toBe(12.5);
    const { balance: depois } = l[0].after as any;
    const { balance: antes } = l[0].before as any;
    expect(Math.round((depois - antes) * 100)).toBe(1250);
    expect(depois).toBe(r.body.cashbox.balance);
  });
});

describe('pessoa apta (predicado no banco de verdade)', () => {
  it('inclui CEO e papel com a permissão concedida; exclui bloqueado, sem permissão e quem pediu', async () => {
    await prisma.rolePermissions.upsert({
      where: { role: TOUCHED },
      create: { role: TOUCHED, permissions: ['cashbox:approve_withdrawal'], notificationTargets: [], updatedBy: 'test' },
      update: { permissions: ['cashbox:approve_withdrawal'] },
    });
    const gerente = await createTestUser(TOUCHED, DOMAIN);
    const bloqueado = await createTestUser('ceo', DOMAIN);
    await prisma.user.update({ where: { id: bloqueado.userId }, data: { status: 'blocked' } });
    const cliente = await createTestUser('cliente', DOMAIN);
    const lojista = await createTestUser('lojista', DOMAIN);

    const roles = await cashboxApproval.cashboxApproverRoles();
    expect(roles).toEqual(expect.arrayContaining(['ceo', TOUCHED]));
    expect(roles).not.toContain('cliente');

    const aptos = await prisma.user.findMany({
      where: { AND: [cashboxApproval.cashboxApproverWhere(roles, ceo.userId), { email: { endsWith: DOMAIN } }] },
      select: { id: true },
    });
    const ids = aptos.map((u) => u.id).sort();
    expect(ids).toEqual([ceo2.userId, gerente.userId].sort());
    expect(ids).not.toContain(bloqueado.userId);
    expect(ids).not.toContain(cliente.userId);
    expect(ids).not.toContain(lojista.userId);
  });
});
