/**
 * D3b-3 · P2.1 — saques (WithdrawalRequest) com linha de registro (spec 4.3).
 * Aprovar pela rota grava withdrawal_approve na transação de `processed` (ou com uncertain:true
 * na marca de incerteza); auto-aprovação e recusa clara do gateway não gravam. Rejeitar grava
 * withdrawal_reject com quem rejeitou. Resolver incerto grava withdrawal_resolve_uncertain.
 * Os 409 WITHDRAWAL_NOT_PENDING trazem currentStatus.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createPayout } from './helpers/financePg';
import { fakeObjectId } from './helpers/ids';
import * as payoutGateway from '../services/payoutGateway';
import * as socketEmitter from '../utils/socketEmitter';
import * as moneyActions from '../services/adminMoneyAction.service';
import { maybeAutoApproveWithdrawal } from '../controllers/withdrawalController';

const DOMAIN = '@d3b3p21.test';
let ceo: TestUser;
let ceo2: TestUser;
let motoboy: TestUser;
const transfer = jest.fn();

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  ceo2 = await createTestUser('ceo', DOMAIN);
  motoboy = await createTestUser('motoboy', DOMAIN);
  transfer.mockReset();
  jest.spyOn(payoutGateway, 'getPayoutGateway').mockReturnValue({ provider: 'test', transfer, getStatus: jest.fn() } as any);
  jest.spyOn(socketEmitter, 'emitAdminNotification').mockImplementation(() => {});
});

afterEach(async () => {
  jest.restoreAllMocks();
  await prisma.withdrawalRequest.deleteMany({ where: { motoboyId: motoboy.userId } });
  await prisma.payout.deleteMany({ where: { recipientId: motoboy.userId } });
  await prisma.platformConfig.updateMany({ data: { autoApproveWithdrawals: false } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function saque(status: 'pending' | 'approved' = 'pending', extra: Record<string, any> = {}) {
  const payout = await createPayout({
    recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 30, status: 'requested',
  });
  return prisma.withdrawalRequest.create({
    data: {
      motoboyId: motoboy.userId, motoboyName: 'Moto', motoboyEmail: 'm@x.com', amount: 30,
      status, payoutIds: [String(payout._id)], ...extra,
    },
  });
}

const aprovar = (who: TestUser, withdrawalId: string) =>
  request(app).post('/api/withdrawals/approve').set('Authorization', bearer(who)).send({ withdrawalId });
const rejeitar = (who: TestUser, withdrawalId: string, reason = 'Dados bancários errados') =>
  request(app).post('/api/withdrawals/reject').set('Authorization', bearer(who)).send({ withdrawalId, reason });
const resolver = (who: TestUser, id: string, body: any) =>
  request(app).post(`/api/withdrawals/${id}/resolve-uncertain`).set('Authorization', bearer(who)).send(body);
const linhas = (id: string, type?: string) =>
  prisma.adminMoneyAction.findMany({ where: { targetType: 'withdrawal_request', targetId: id, ...(type ? { type: type as any } : {}) } });

describe('aprovar', () => {
  it('fluxo feliz → uma linha withdrawal_approve com autor, valor e antes/depois', async () => {
    const wr = await saque();
    transfer.mockResolvedValue({ status: 'paid', gatewayTransferId: 'tr_ok_1' });
    const r = await aprovar(ceo, wr.id);
    expect(r.status).toBe(200);
    const l = await linhas(wr.id);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      type: 'withdrawal_approve', actorId: ceo.userId, actorRole: 'ceo',
      before: { status: 'pending' },
      after: { status: 'processed', transactionId: 'tr_ok_1', payoutIds: wr.payoutIds },
    });
    expect(Number(l[0].amount)).toBe(30);
  });

  it('resposta incerta → linha withdrawal_approve com uncertain:true; nova aprovação 409 sem linha nova', async () => {
    const wr = await saque();
    transfer.mockResolvedValueOnce({ status: 'failed', uncertain: true, gatewayTransferId: '', errorMessage: 'Timeout (20000ms)' });
    expect((await aprovar(ceo, wr.id)).status).toBe(502);
    const l = await linhas(wr.id);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ type: 'withdrawal_approve', actorId: ceo.userId, after: { status: 'approved', uncertain: true } });

    const again = await aprovar(ceo2, wr.id);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'WITHDRAWAL_NOT_PENDING', currentStatus: 'approved' });
    expect(await linhas(wr.id)).toHaveLength(1);
  });

  it('recusa clara do gateway → volta a pending e não grava linha', async () => {
    const wr = await saque();
    transfer.mockResolvedValueOnce({ status: 'failed', gatewayTransferId: '', errorMessage: 'Chave PIX inexistente' });
    expect((await aprovar(ceo, wr.id)).status).toBe(502);
    expect((await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } }))?.status).toBe('pending');
    expect(await linhas(wr.id)).toHaveLength(0);
  });

  it('auto-aprovação (sem pessoa) não grava linha', async () => {
    const wr = await saque();
    await prisma.platformConfig.updateMany({ data: { autoApproveWithdrawals: true } });
    transfer.mockResolvedValue({ status: 'paid', gatewayTransferId: 'tr_auto_1' });
    await maybeAutoApproveWithdrawal(wr.id);
    expect((await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } }))?.status).toBe('processed');
    expect(await linhas(wr.id)).toHaveLength(0);
  });

  it('duas aprovações simultâneas → um 200, um 409 com currentStatus, uma linha', async () => {
    const wr = await saque();
    transfer.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 150));
      return { status: 'paid', gatewayTransferId: 'tr_par_1' };
    });
    const [a, b] = await Promise.all([aprovar(ceo, wr.id), aprovar(ceo2, wr.id)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const perdedor = a.status === 409 ? a : b;
    expect(perdedor.body.code).toBe('WITHDRAWAL_NOT_PENDING');
    expect(['approved', 'processed']).toContain(perdedor.body.currentStatus);
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(await linhas(wr.id, 'withdrawal_approve')).toHaveLength(1);
  });

  it('saque já processado → 409 com currentStatus processed', async () => {
    const wr = await saque('pending');
    await prisma.withdrawalRequest.update({ where: { id: wr.id }, data: { status: 'processed' } });
    const r = await aprovar(ceo, wr.id);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'WITHDRAWAL_NOT_PENDING', currentStatus: 'processed' });
  });
});

describe('rejeitar', () => {
  it('grava withdrawal_reject com quem rejeitou e o motivo', async () => {
    const wr = await saque();
    const r = await rejeitar(ceo, wr.id);
    expect(r.status).toBe(200);
    const l = await linhas(wr.id);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      type: 'withdrawal_reject', actorId: ceo.userId, reason: 'Dados bancários errados',
      before: { status: 'pending' }, after: { status: 'rejected', rejectedBy: ceo.userId },
    });
  });

  it('rejeitar duas vezes → 409 com currentStatus rejected e uma linha só', async () => {
    const wr = await saque();
    expect((await rejeitar(ceo, wr.id)).status).toBe(200);
    const r = await rejeitar(ceo2, wr.id);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'WITHDRAWAL_NOT_PENDING', currentStatus: 'rejected' });
    expect(await linhas(wr.id, 'withdrawal_reject')).toHaveLength(1);
  });

  it('falha ao gravar a linha desfaz a rejeição (mesma transação)', async () => {
    const wr = await saque();
    jest.spyOn(moneyActions, 'recordAdminMoneyAction').mockRejectedValueOnce(new Error('falha ao gravar a linha'));
    const r = await rejeitar(ceo, wr.id);
    expect(r.status).toBe(500);
    expect((await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } }))?.status).toBe('pending');
    expect((await prisma.payout.findUnique({ where: { id: wr.payoutIds[0] } }))?.status).toBe('requested');
  });
});

describe('resolver incerto', () => {
  const NOTE = 'Conferido no painel do Asaas em 16/10';

  it('paid → uma linha withdrawal_resolve_uncertain com a nota e o desfecho', async () => {
    const wr = await saque('approved', { approvedBy: 'auto', approvedAt: new Date(), uncertainAt: new Date() });
    const r = await resolver(ceo, wr.id, { outcome: 'paid', asaasTransferId: 'tr_painel_9', note: NOTE });
    expect(r.status).toBe(200);
    const l = await linhas(wr.id);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      type: 'withdrawal_resolve_uncertain', actorId: ceo.userId, reason: NOTE,
      before: { status: 'approved' },
      after: { status: 'processed', outcome: 'paid', transactionId: 'tr_painel_9' },
    });
    expect(typeof (l[0].before as any).uncertainAt).toBe('string');
  });

  it('not_sent → linha com status pending; falha ao gravar a linha desfaz (saque segue approved)', async () => {
    const ok = await saque('approved', { approvedBy: 'auto', approvedAt: new Date(), uncertainAt: new Date() });
    expect((await resolver(ceo, ok.id, { outcome: 'not_sent', note: NOTE })).status).toBe(200);
    const l = await linhas(ok.id);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ after: { status: 'pending', outcome: 'not_sent' } });

    const falha = await saque('approved', { approvedBy: 'auto', approvedAt: new Date(), uncertainAt: new Date() });
    jest.spyOn(moneyActions, 'recordAdminMoneyAction').mockRejectedValueOnce(new Error('falha ao gravar a linha'));
    expect((await resolver(ceo, falha.id, { outcome: 'not_sent', note: NOTE })).status).toBe(500);
    expect((await prisma.withdrawalRequest.findUnique({ where: { id: falha.id } }))?.status).toBe('approved');
  });

  it('não elegível → 409 WITHDRAWAL_NOT_RESOLVABLE e nenhuma linha', async () => {
    const wr = await saque('approved', { approvedBy: 'auto', approvedAt: new Date() });
    const r = await resolver(ceo, wr.id, { outcome: 'paid', note: NOTE });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('WITHDRAWAL_NOT_RESOLVABLE');
    expect(await linhas(wr.id)).toHaveLength(0);
  });
});
