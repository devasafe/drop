/**
 * Fix round 1 — R27: saque incerto (approved + uncertainAt) ou travado em `approved` há mais de
 * 10 min tinha três saídas fechadas (aprovar 409, rejeitar 409, "Marcar Pago" 404). Nova rota
 * POST /withdrawals/:id/resolve-uncertain: `paid` conclui e baixa os payouts uma vez;
 * `not_sent` volta a pending. Transição condicional a partir de `approved`.
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
import * as wrRepo from '../repositories/withdrawalRequest.repository';
import * as logger from '../config/logger';

const DOMAIN = '@t54wd.test';
let ceo: TestUser;
let ceo2: TestUser;
let motoboy: TestUser;
let lojista: TestUser;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  ceo2 = await createTestUser('ceo', DOMAIN);
  motoboy = await createTestUser('motoboy', DOMAIN);
  lojista = await createTestUser('lojista', DOMAIN);
  jest.spyOn(socketEmitter, 'emitAdminNotification').mockImplementation(() => {});
});
afterEach(async () => {
  jest.restoreAllMocks();
  await prisma.withdrawalRequest.deleteMany({ where: { motoboyId: motoboy.userId } });
  await prisma.payout.deleteMany({ where: { recipientId: motoboy.userId } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function saqueEmApproved(opts: { uncertain?: boolean; approvedMinAgo?: number } = {}) {
  const payout = await createPayout({
    recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 25, status: 'requested',
  });
  return prisma.withdrawalRequest.create({
    data: {
      motoboyId: motoboy.userId, motoboyName: 'Moto', motoboyEmail: 'm@x.com', amount: 25,
      status: 'approved', payoutIds: [String(payout._id)], approvedBy: 'auto',
      approvedAt: new Date(Date.now() - (opts.approvedMinAgo ?? 1) * 60_000),
      uncertainAt: opts.uncertain ? new Date() : null,
    },
  });
}

const resolve = (who: TestUser, id: string, body: any) =>
  request(app).post(`/api/withdrawals/${id}/resolve-uncertain`).set('Authorization', bearer(who)).send(body);
const NOTE = 'Conferido no painel do Asaas em 08/10';

describe('R27 — resolver saque incerto', () => {
  it('paid: conclui o saque e baixa os payouts uma vez, gravando quem resolveu e a nota', async () => {
    const wr = await saqueEmApproved({ uncertain: true });
    const r = await resolve(ceo, wr.id, { outcome: 'paid', asaasTransferId: 'tr_painel_1', note: NOTE });
    expect(r.status).toBe(200);
    const final = await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } });
    expect(final).toMatchObject({ status: 'processed', transactionId: 'tr_painel_1', resolvedBy: ceo.userId, resolutionNote: NOTE });
    expect(final?.resolvedAt).toBeInstanceOf(Date);
    const p = await prisma.payout.findUnique({ where: { id: wr.payoutIds[0] } });
    expect(p?.status).toBe('paid');
    expect(p?.gatewayTransferId).toBe('tr_painel_1');

    // segunda resolução não baixa de novo
    const again = await resolve(ceo, wr.id, { outcome: 'paid', note: NOTE });
    expect(again.status).toBe(409);
  });

  it('not_sent: volta a pending (limpa uncertainAt) e pode ser aprovado de novo', async () => {
    const wr = await saqueEmApproved({ uncertain: true });
    const r = await resolve(ceo, wr.id, { outcome: 'not_sent', note: NOTE });
    expect(r.status).toBe(200);
    const final = await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } });
    expect(final).toMatchObject({ status: 'pending', uncertainAt: null, approvedAt: null, resolvedBy: ceo.userId, resolutionNote: NOTE });
    expect((await prisma.payout.findUnique({ where: { id: wr.payoutIds[0] } }))?.status).toBe('requested');

    const transfer = jest.fn().mockResolvedValue({ status: 'paid', gatewayTransferId: 'tr_novo' });
    jest.spyOn(payoutGateway, 'getPayoutGateway').mockReturnValue({ provider: 'test', transfer, getStatus: jest.fn() } as any);
    const ap = await request(app).post('/api/withdrawals/approve').set('Authorization', bearer(ceo)).send({ withdrawalId: wr.id });
    expect(ap.status).toBe(200);
    expect(transfer).toHaveBeenCalledTimes(1);
  });

  it('duas resoluções concorrentes → uma 200 e outra 409; payout baixado uma vez', async () => {
    const wr = await saqueEmApproved({ uncertain: true });
    const [a, b] = await Promise.all([
      resolve(ceo, wr.id, { outcome: 'paid', note: NOTE }),
      resolve(ceo2, wr.id, { outcome: 'not_sent', note: NOTE }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const final = await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } });
    const p = await prisma.payout.findUnique({ where: { id: wr.payoutIds[0] } });
    if (final?.status === 'processed') expect(p?.status).toBe('paid');
    else expect(p?.status).toBe('requested');
  });

  it('approved recente sem uncertainAt (aprovação em voo) → 409 e nada muda', async () => {
    const wr = await saqueEmApproved({ approvedMinAgo: 2 });
    const r = await resolve(ceo, wr.id, { outcome: 'paid', note: NOTE });
    expect(r.status).toBe(409);
    expect((await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } }))?.status).toBe('approved');
    expect((await prisma.payout.findUnique({ where: { id: wr.payoutIds[0] } }))?.status).toBe('requested');
  });

  it('approved há mais de 10 min sem uncertainAt (processo caiu) → resolvível', async () => {
    const wr = await saqueEmApproved({ approvedMinAgo: 11 });
    const r = await resolve(ceo, wr.id, { outcome: 'not_sent', note: NOTE });
    expect(r.status).toBe(200);
    expect((await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } }))?.status).toBe('pending');
  });

  it('validação: nota curta / outcome inválido → 400; sem permissão → 403', async () => {
    const wr = await saqueEmApproved({ uncertain: true });
    expect((await resolve(ceo, wr.id, { outcome: 'paid', note: 'curta' })).status).toBe(400);
    expect((await resolve(ceo, wr.id, { outcome: 'talvez', note: NOTE })).status).toBe(400);
    expect((await resolve(lojista, wr.id, { outcome: 'paid', note: NOTE })).status).toBe(403);
    expect((await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } }))?.status).toBe('approved');
  });
});

describe('M-2 — falha ao gravar a marca de incerteza não é silenciosa', () => {
  it('timeout + updateWR falhando → logger.error e alerta ao admin', async () => {
    const payout = await createPayout({
      recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 10, status: 'requested',
    });
    const wr = await prisma.withdrawalRequest.create({
      data: { motoboyId: motoboy.userId, motoboyName: 'Moto', motoboyEmail: 'm@x.com', amount: 10, status: 'pending', payoutIds: [String(payout._id)] },
    });
    const transfer = jest.fn().mockResolvedValue({ status: 'failed', uncertain: true, gatewayTransferId: '', errorMessage: 'Timeout' });
    jest.spyOn(payoutGateway, 'getPayoutGateway').mockReturnValue({ provider: 'test', transfer, getStatus: jest.fn() } as any);
    jest.spyOn(wrRepo, 'updateWR').mockRejectedValue(new Error('banco fora'));
    const logErr = jest.spyOn(logger.default, 'error');
    const alerta = socketEmitter.emitAdminNotification as jest.Mock;

    const r = await request(app).post('/api/withdrawals/approve').set('Authorization', bearer(ceo)).send({ withdrawalId: wr.id });
    expect(r.status).toBe(502);
    expect(logErr).toHaveBeenCalledWith('[saque] falha ao gravar a marca de incerteza', expect.anything(), expect.objectContaining({ withdrawalId: wr.id }));
    expect(alerta).toHaveBeenCalledWith(expect.objectContaining({ tag: 'withdrawal', body: expect.stringMatching(/NÃO foi gravada/) }));
    expect((await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } }))?.status).toBe('approved');
  });
});
