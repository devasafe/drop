/**
 * Lote pré-deploy 2 — item A: saque em dobro na custódia.
 * A aprovação só lia o status, chamava o gateway (o Pix sai) e só depois gravava. Duas aprovações
 * concorrentes (dois admins, dois cliques, admin + auto-approve) enviavam o Pix duas vezes.
 * Agora a aprovação reivindica o saque (pending → approved, updateMany condicional) ANTES do
 * gateway; recusa clara volta para pending; resposta incerta fica em approved + alerta ao admin.
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
import { maybeAutoApproveWithdrawal } from '../controllers/withdrawalController';
import * as withdrawalRepo from '../repositories/withdrawal.repository';

const DOMAIN = '@t50wd.test';

let ceo: TestUser;
let ceo2: TestUser;
let motoboy: TestUser;
const transfer = jest.fn();

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  ceo2 = await createTestUser('ceo', DOMAIN);
  motoboy = await createTestUser('motoboy', DOMAIN);
  transfer.mockReset();
  jest.spyOn(payoutGateway, 'getPayoutGateway').mockReturnValue({
    provider: 'test',
    transfer,
    getStatus: jest.fn(),
  } as any);
});

afterEach(async () => {
  jest.restoreAllMocks();
  await prisma.withdrawalRequest.deleteMany({ where: { motoboyId: motoboy.userId } });
  await prisma.payout.deleteMany({ where: { recipientId: motoboy.userId } });
  await prisma.platformConfig.updateMany({ data: { autoApproveWithdrawals: false } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function saquePendente(amount = 30) {
  const payout = await createPayout({
    recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount, status: 'requested',
  });
  return prisma.withdrawalRequest.create({
    data: {
      motoboyId: motoboy.userId, motoboyName: 'Moto', motoboyEmail: 'm@x.com', amount,
      status: 'pending', payoutIds: [String(payout._id)],
    },
  });
}

const aprovar = (who: TestUser, withdrawalId: string) =>
  request(app).post('/api/withdrawals/approve').set('Authorization', bearer(who)).send({ withdrawalId });

/** Gateway que só responde depois que o teste liberar — segura a 1ª aprovação "em voo". */
function gatewayLento(result: any) {
  let liberar!: () => void;
  const portao = new Promise<void>((r) => { liberar = r; });
  transfer.mockImplementation(async () => { await portao; return result; });
  return () => liberar();
}

describe('A — aprovação de saque é reivindicada antes do gateway', () => {
  it('duas aprovações concorrentes → gateway chamado 1×, um 200 e um 409', async () => {
    const wr = await saquePendente();
    const liberar = gatewayLento({ status: 'paid', gatewayTransferId: 'tr_1' });

    const p1 = aprovar(ceo, wr.id).then((r) => r);
    // espera a 1ª chegar ao gateway (já reivindicou) antes de disparar a 2ª
    for (let i = 0; i < 200 && transfer.mock.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
    const p2 = aprovar(ceo2, wr.id).then((r) => r);
    const r2 = await p2;
    liberar();
    const r1 = await p1;

    expect(transfer).toHaveBeenCalledTimes(1);
    expect([r1.status, r2.status].sort()).toEqual([200, 409]);
    const final = await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } });
    expect(final?.status).toBe('processed');
    const payout = await prisma.payout.findUnique({ where: { id: wr.payoutIds[0] } });
    expect(payout?.status).toBe('paid');
  });

  it('Promise.all de duas aprovações → gateway 1×, um 200 e um 409', async () => {
    const wr = await saquePendente();
    transfer.mockResolvedValue({ status: 'paid', gatewayTransferId: 'tr_2' });

    const [a, b] = await Promise.all([aprovar(ceo, wr.id), aprovar(ceo2, wr.id)]);

    expect(transfer).toHaveBeenCalledTimes(1);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
  });

  it('aprovação manual com o auto-approve em voo → 409 e o gateway não é chamado de novo', async () => {
    const wr = await saquePendente();
    await prisma.platformConfig.updateMany({ data: { autoApproveWithdrawals: true } });
    const liberar = gatewayLento({ status: 'paid', gatewayTransferId: 'tr_auto' });

    const auto = maybeAutoApproveWithdrawal(wr.id);
    for (let i = 0; i < 200 && transfer.mock.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
    const manual = await aprovar(ceo, wr.id);
    liberar();
    await auto;

    expect(manual.status).toBe(409);
    expect(transfer).toHaveBeenCalledTimes(1);
    expect((await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } }))?.status).toBe('processed');
  });

  it('rejeitar com a aprovação em voo → 409 e os repasses não voltam para released', async () => {
    const wr = await saquePendente();
    const liberar = gatewayLento({ status: 'paid', gatewayTransferId: 'tr_rej' });

    const p1 = aprovar(ceo, wr.id).then((r) => r);
    for (let i = 0; i < 200 && transfer.mock.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
    const rej = await request(app).post('/api/withdrawals/reject').set('Authorization', bearer(ceo2))
      .send({ withdrawalId: wr.id, reason: 'x' });
    liberar();
    const r1 = await p1;

    expect(rej.status).toBe(409);
    expect(r1.status).toBe(200);
    const payout = await prisma.payout.findUnique({ where: { id: wr.payoutIds[0] } });
    expect(payout?.status).toBe('paid');
  });

  it('recusa clara do gateway → volta para pending e pode ser aprovado de novo', async () => {
    const wr = await saquePendente();
    transfer.mockResolvedValueOnce({ status: 'failed', gatewayTransferId: '', errorMessage: 'Chave PIX inexistente' });

    const r1 = await aprovar(ceo, wr.id);
    expect(r1.status).toBe(502);
    const meio = await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } });
    expect(meio?.status).toBe('pending');
    expect(meio?.rejectionReason).toMatch(/Chave PIX inexistente/);
    expect((await prisma.payout.findUnique({ where: { id: wr.payoutIds[0] } }))?.status).toBe('requested');

    transfer.mockResolvedValueOnce({ status: 'paid', gatewayTransferId: 'tr_ok' });
    const r2 = await aprovar(ceo, wr.id);
    expect(r2.status).toBe(200);
    expect(transfer).toHaveBeenCalledTimes(2);
    expect((await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } }))?.status).toBe('processed');
  });

  it('resposta incerta (timeout) → NÃO volta para pending, marca a incerteza e alerta o admin', async () => {
    const wr = await saquePendente();
    const alerta = jest.spyOn(socketEmitter, 'emitAdminNotification').mockImplementation(() => {});
    transfer.mockResolvedValueOnce({ status: 'failed', uncertain: true, gatewayTransferId: '', errorMessage: 'Timeout (20000ms)' });

    const r1 = await aprovar(ceo, wr.id);
    expect(r1.status).toBe(502);
    expect(r1.body.code).toBe('WITHDRAWAL_UNCERTAIN');
    const depois = await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } });
    expect(depois?.status).toBe('approved');
    expect(depois?.uncertainAt).toBeInstanceOf(Date);
    expect(alerta).toHaveBeenCalledWith(expect.objectContaining({ tag: 'withdrawal', url: '/admin/withdrawals' }));
    expect((await prisma.payout.findUnique({ where: { id: wr.payoutIds[0] } }))?.status).toBe('requested');

    // nova tentativa não reenvia o Pix
    const r2 = await aprovar(ceo, wr.id);
    expect(r2.status).toBe(409);
    expect(transfer).toHaveBeenCalledTimes(1);
  });

  it('gateway lança exceção → tratado como incerto (fail closed)', async () => {
    const wr = await saquePendente();
    jest.spyOn(socketEmitter, 'emitAdminNotification').mockImplementation(() => {});
    transfer.mockRejectedValueOnce(new Error('socket hang up'));

    const r1 = await aprovar(ceo, wr.id);
    expect(r1.status).toBe(502);
    expect((await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } }))?.status).toBe('approved');
  });

  it('fluxo feliz não muda: 200, saque processed, repasses paid', async () => {
    const wr = await saquePendente();
    transfer.mockResolvedValue({ status: 'paid', gatewayTransferId: 'tr_feliz' });

    const r = await aprovar(ceo, wr.id);
    expect(r.status).toBe(200);
    expect(r.body.gatewayStatus).toBe('paid');
    const final = await prisma.withdrawalRequest.findUnique({ where: { id: wr.id } });
    expect(final?.status).toBe('processed');
    expect(final?.transactionId).toBe('tr_feliz');
    expect(final?.approvedBy).toBe(ceo.userId);
    expect(final?.uncertainAt).toBeNull();
  });
});

describe('A — saque do AppCashbox (sem gateway): aprovação condicional', () => {
  it('duas aprovações que leram pending → um 200, um 409 e um único débito no caixa', async () => {
    let cashbox = await prisma.appCashbox.findFirst();
    if (!cashbox) cashbox = await prisma.appCashbox.create({ data: { balance: 0 } as any });
    // o controller lê o caixa com findFirst (sem ordem): garante saldo em todos
    await prisma.appCashbox.updateMany({ data: { balance: { increment: 1000000 } } });
    const w = await prisma.withdrawal.create({ data: { appCashboxId: cashbox.id, amount: 50, status: 'pending', reason: 't50' } });
    // barreira: as duas aprovações leem o saque (pending) antes de qualquer uma gravar
    const original = withdrawalRepo.findWithdrawalById;
    let arrived = 0;
    let openBarrier!: () => void;
    const barrier = new Promise<void>((r) => { openBarrier = r; });
    jest.spyOn(withdrawalRepo, 'findWithdrawalById').mockImplementation(async (id: string) => {
      const row = await original(id);
      if (++arrived === 2) openBarrier();
      if (arrived <= 2) await Promise.race([barrier, new Promise((r) => setTimeout(r, 3000))]);
      return row;
    });
    try {
      const url = `/api/admin/app-cashbox/withdrawals/${w.id}/approve`;
      const [a, b] = await Promise.all([
        request(app).put(url).set('Authorization', bearer(ceo)),
        request(app).put(url).set('Authorization', bearer(ceo2)),
      ]);
      const statuses = [a.status, b.status].sort();
      expect(statuses[0]).toBe(200);
      expect(statuses[1]).toBe(409);
      expect(await prisma.appCashboxEntry.count({ where: { withdrawalId: w.id } })).toBe(1);
    } finally {
      await prisma.appCashboxEntry.deleteMany({ where: { withdrawalId: w.id } });
      await prisma.withdrawal.delete({ where: { id: w.id } });
      await prisma.appCashbox.updateMany({ data: { balance: { decrement: 1000000 } } });
    }
  });
});
