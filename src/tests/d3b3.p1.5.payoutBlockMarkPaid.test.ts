/**
 * D3b-3 · P1.5 — bloquear, desbloquear e marcar pago (spec 4.2).
 * Bloquear: só pending e livre (409 PAYOUT_NOT_PENDING), motivo 3–500, linha payout_block.
 * Desbloquear: só bloqueado (409 PAYOUT_NOT_BLOCKED), linha payout_unblock com quem.
 * Marcar pago: uma linha payout_mark_paid por repasse, na mesma transação; falhou, nada fica.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createPayout, findPayoutById } from './helpers/financePg';
import { fakeObjectId } from './helpers/ids';

const DOMAIN = '@d3b3p15.test';
let ceo: TestUser;
let ceo2: TestUser;
let motoboy: TestUser;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  ceo2 = await createTestUser('ceo', DOMAIN);
  motoboy = await createTestUser('motoboy', DOMAIN);
});
afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
  // F13: marcar pago debita o AppCashbox global; devolve o valor e apaga a entrada criada.
  const entries = await prisma.appCashboxEntry.findMany({ where: { reason: { contains: 'tr_manual_1' } } });
  for (const e of entries) {
    await prisma.appCashbox.update({
      where: { id: e.appCashboxId },
      data: { balance: { increment: e.amount }, totalExpenses: { decrement: e.amount } },
    });
  }
  await prisma.appCashboxEntry.deleteMany({ where: { reason: { contains: 'tr_manual_1' } } });
});

const repasse = async (status = 'pending', amount = 25) =>
  String((await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount, status }))._id);
const bloquear = (who: TestUser, id: string, body: any = { reason: 'Suspeita de fraude' }) =>
  request(app).post(`/api/payouts/admin/${id}/block`).set('Authorization', bearer(who)).send(body);
const desbloquear = (who: TestUser, id: string) =>
  request(app).post(`/api/payouts/admin/${id}/unblock`).set('Authorization', bearer(who)).send({});
const linhas = (id: string, type: string) =>
  prisma.adminMoneyAction.findMany({ where: { targetType: 'payout', targetId: id, type: type as any } });

describe('bloquear', () => {
  it('bloqueia o pending com motivo e quem, e grava uma linha payout_block', async () => {
    const id = await repasse();
    const r = await bloquear(ceo, id);
    expect(r.status).toBe(200);
    expect(r.body.payout).toMatchObject({ id, blocked: true, blockReason: 'Suspeita de fraude', blockedBy: ceo.userId, amount: 25 });
    const l = await linhas(id, 'payout_block');
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ actorId: ceo.userId, reason: 'Suspeita de fraude', before: { status: 'pending', blocked: false }, after: { status: 'pending', blocked: true } });
    expect(Number(l[0].amount)).toBe(25);
  });

  it.each([[{}], [{ reason: 'ab' }], [{ reason: '   ' }], [{ reason: 'x'.repeat(501) }]])('motivo inválido %j → 400 e nada muda', async (body) => {
    const id = await repasse();
    const r = await bloquear(ceo, id, body);
    expect(r.status).toBe(400);
    expect((await findPayoutById(id)).blocked).toBe(false);
    expect(await linhas(id, 'payout_block')).toHaveLength(0);
  });

  it('já bloqueado → 409 PAYOUT_NOT_PENDING com blocked: true; o motivo original fica', async () => {
    const id = await repasse();
    expect((await bloquear(ceo, id)).status).toBe(200);
    const r = await bloquear(ceo2, id, { reason: 'Outro motivo' });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'PAYOUT_NOT_PENDING', currentStatus: 'pending', blocked: true });
    expect((await findPayoutById(id)).blockReason).toBe('Suspeita de fraude');
    expect(await linhas(id, 'payout_block')).toHaveLength(1);
  });

  it.each(['releasing', 'released', 'requested', 'paid', 'cancelled'])('%s → 409 PAYOUT_NOT_PENDING com o currentStatus', async (status) => {
    const id = await repasse(status);
    const r = await bloquear(ceo, id);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'PAYOUT_NOT_PENDING', currentStatus: status, blocked: false });
    expect((await findPayoutById(id)).blocked).toBe(false);
  });

  it('dois bloqueios simultâneos → um 200 e um 409, uma linha', async () => {
    const id = await repasse();
    const [a, b] = await Promise.all([bloquear(ceo, id), bloquear(ceo2, id, { reason: 'Motivo dois' })]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await linhas(id, 'payout_block')).toHaveLength(1);
  });

  it('id inexistente → 404 PAYOUT_NOT_FOUND', async () => {
    const r = await bloquear(ceo, 'nao-existe');
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('PAYOUT_NOT_FOUND');
  });

  it('sem payout:block → 403', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const id = await repasse();
    expect((await bloquear(gerente, id)).status).toBe(403);
  });
});

describe('desbloquear', () => {
  it('desbloqueia, grava uma linha payout_unblock com quem desbloqueou e o bloqueio anterior', async () => {
    const id = await repasse();
    await bloquear(ceo, id);
    const r = await desbloquear(ceo2, id);
    expect(r.status).toBe(200);
    expect(r.body.payout).toMatchObject({ id, blocked: false, blockReason: null, blockedBy: null });
    const l = await linhas(id, 'payout_unblock');
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      actorId: ceo2.userId,
      before: { blocked: true, blockReason: 'Suspeita de fraude', blockedBy: ceo.userId },
      after: { blocked: false },
    });
  });

  it('não bloqueado → 409 PAYOUT_NOT_BLOCKED; dois desbloqueios simultâneos → um 200 e um 409', async () => {
    const livre = await repasse();
    const r = await desbloquear(ceo, livre);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'PAYOUT_NOT_BLOCKED', currentStatus: 'pending', blocked: false });

    const id = await repasse();
    await bloquear(ceo, id);
    const [a, b] = await Promise.all([desbloquear(ceo, id), desbloquear(ceo2, id)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await linhas(id, 'payout_unblock')).toHaveLength(1);
  });

  it('id inexistente → 404 PAYOUT_NOT_FOUND', async () => {
    const r = await desbloquear(ceo, 'nao-existe');
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('PAYOUT_NOT_FOUND');
  });
});

describe('marcar pago', () => {
  const marcar = (who: TestUser, payoutIds: string[]) =>
    request(app).post('/api/payouts/admin/mark-paid').set('Authorization', bearer(who)).send({ payoutIds, gatewayTransferId: 'tr_manual_1' });

  it('uma linha payout_mark_paid por repasse, com quem e o status anterior', async () => {
    const a = await repasse('released', 10);
    const b = await repasse('requested', 15);
    const r = await marcar(ceo, [a, b]);
    expect(r.status).toBe(200);
    expect(r.body.totalPaid).toBe(25);
    for (const [id, status, amount] of [[a, 'released', 10], [b, 'requested', 15]] as const) {
      expect((await findPayoutById(id)).status).toBe('paid');
      const l = await linhas(id, 'payout_mark_paid');
      expect(l).toHaveLength(1);
      expect(l[0]).toMatchObject({ actorId: ceo.userId, before: { status }, after: { status: 'paid', gatewayTransferId: 'tr_manual_1' } });
      expect(Number(l[0].amount)).toBe(amount);
    }
  });

  it('um repasse não pagável no lote → 400, nenhum pago e nenhuma linha (mesma transação)', async () => {
    const ok = await repasse('released', 10);
    const emVoo = await repasse('releasing', 15);
    const r = await marcar(ceo, [ok, emVoo]);
    expect(r.status).toBe(400);
    expect((await findPayoutById(ok)).status).toBe('released');
    expect(await linhas(ok, 'payout_mark_paid')).toHaveLength(0);
  });
});
