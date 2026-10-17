/**
 * D3b-3 · P1.3 — liberar repasse blindado (spec 4.1).
 * Reivindica (pending → releasing) antes do Asaas; duas liberações simultâneas fazem UMA
 * transferência; recusa definitiva volta a pending sem linha; resposta incerta fica em
 * releasing + uncertainAt (com linha) e não pode ser liberada de novo; modo legado também
 * reivindica; a liberação automática da entrega não transfere o que o admin já reivindicou.
 */
import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import * as socketEmitter from '../utils/socketEmitter';
import * as moneyActions from '../services/adminMoneyAction.service';
import payoutService from '../services/payout.service';
import { releaseOrderViaAsaas } from '../services/asaas/release';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createPayout, createWallet, findWallet, findPayoutById } from './helpers/financePg';
import { fakeObjectId } from './helpers/ids';
import { ownerIdForStore } from './helpers/storeOwner';

const DOMAIN = '@d3b3p13.test';
let ceo: TestUser;
let ceo2: TestUser;
let post: jest.SpyInstance;
let notify: jest.SpyInstance;
const previousGateway = env.PAYMENT_GATEWAY;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  ceo2 = await createTestUser('ceo', DOMAIN);
  env.PAYMENT_GATEWAY = 'asaas';
  // Nunca sai chamada real: o que o caso não programar falha como "não mockado".
  post = jest.spyOn(asaasClient, 'post').mockRejectedValue(new Error('asaasClient.post não mockado neste caso'));
  notify = jest.spyOn(socketEmitter, 'emitAdminNotification').mockImplementation(() => {});
});
afterEach(async () => {
  jest.restoreAllMocks();
  env.PAYMENT_GATEWAY = previousGateway;
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function repasseDeLoja(opts: { amount?: number; walletId?: string | null; blocked?: boolean; orderId?: string } = {}) {
  const amount = opts.amount ?? 70;
  const store = await prisma.store.create({
    data: {
      ownerId: await ownerIdForStore(DOMAIN),
      name: 'Loja P1.3',
      asaas: opts.walletId === null ? { status: 'none' } : { status: 'active', walletId: opts.walletId ?? 'wlt_loja' },
    },
  });
  await createWallet({ owner: store.id, ownerType: 'store', pendingBalance: amount });
  const payout = await createPayout({ recipientType: 'store', recipientId: store.id, orderId: opts.orderId ?? fakeObjectId(), amount, status: 'pending' });
  if (opts.blocked) {
    await prisma.payout.update({ where: { id: payout._id }, data: { blocked: true, blockReason: 'fraude', blockedAt: new Date(), blockedBy: ceo.userId } });
  }
  return { storeId: store.id, payoutId: String(payout._id) };
}

const liberar = (who: TestUser, id: string) =>
  request(app).post(`/api/payouts/admin/${id}/release`).set('Authorization', bearer(who)).send({});

const linhas = (payoutId: string) =>
  prisma.adminMoneyAction.findMany({ where: { targetType: 'payout', targetId: payoutId }, orderBy: { createdAt: 'asc' } });

const atrasado = <T>(value: T, ms = 150) => () => new Promise<T>((r) => setTimeout(() => r(value), ms));

describe('modo Asaas — sucesso', () => {
  it('transfere, baixa released com o id do Asaas, move o saldo e grava uma linha payout_release', async () => {
    const { storeId, payoutId } = await repasseDeLoja();
    post.mockResolvedValue({ id: 'tr_ok', status: 'DONE' });

    const r = await liberar(ceo, payoutId);

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ message: 'Payout liberado com sucesso', payout: { id: payoutId, status: 'released', gatewayTransferId: 'tr_ok' } });
    expect(post).toHaveBeenCalledTimes(1);
    expect(post.mock.calls[0]).toEqual(['/transfers', { value: 70, walletId: 'wlt_loja' }]);
    const p = await findPayoutById(payoutId);
    expect(p).toMatchObject({ status: 'released', gatewayProvider: 'asaas', gatewayTransferId: 'tr_ok', uncertainAt: null });
    expect(p.releasedAt).toBeInstanceOf(Date);
    const w = await findWallet({ owner: storeId, ownerType: 'store' });
    expect(w.pendingBalance).toBe(0);
    expect(w.availableBalance).toBe(70);
    const l = await linhas(payoutId);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      actorId: ceo.userId, actorRole: 'ceo', type: 'payout_release', targetType: 'payout', targetId: payoutId,
      before: { status: 'pending' }, after: { status: 'released', gatewayTransferId: 'tr_ok' },
    });
    expect(Number(l[0].amount)).toBe(70);
  });
});

describe('concorrência', () => {
  it('duas liberações simultâneas → uma transferência, um 200 e um 409 PAYOUT_NOT_PENDING', async () => {
    const { storeId, payoutId } = await repasseDeLoja();
    post.mockImplementation(atrasado({ id: 'tr_conc', status: 'DONE' }));

    const [a, b] = await Promise.all([liberar(ceo, payoutId), liberar(ceo2, payoutId)]);

    expect(post).toHaveBeenCalledTimes(1);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const conflito = a.status === 409 ? a : b;
    expect(conflito.body.code).toBe('PAYOUT_NOT_PENDING');
    expect(['releasing', 'released']).toContain(conflito.body.currentStatus);
    expect(conflito.body.blocked).toBe(false);
    expect((await findPayoutById(payoutId)).status).toBe('released');
    const w = await findWallet({ owner: storeId, ownerType: 'store' });
    expect(w.availableBalance).toBe(70);
    expect(w.pendingBalance).toBe(0);
    expect(await linhas(payoutId)).toHaveLength(1);
  });

  it('liberação automática da entrega com a do admin em voo não transfere de novo', async () => {
    const orderId = fakeObjectId();
    const { payoutId } = await repasseDeLoja({ orderId });
    post.mockImplementation(atrasado({ id: 'tr_admin', status: 'DONE' }, 200));

    const admin = liberar(ceo, payoutId).then((r) => r);
    for (let i = 0; i < 200 && post.mock.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
    await releaseOrderViaAsaas(orderId);
    const r = await admin;

    expect(r.status).toBe(200);
    expect(post).toHaveBeenCalledTimes(1);
    expect((await findPayoutById(payoutId)).status).toBe('released');
  });

  it('modo legado: duas liberações simultâneas → um 200 e um 409, uma linha, nada no Asaas', async () => {
    env.PAYMENT_GATEWAY = 'none';
    const { storeId, payoutId } = await repasseDeLoja();

    const [a, b] = await Promise.all([liberar(ceo, payoutId), liberar(ceo2, payoutId)]);

    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(post).not.toHaveBeenCalled();
    expect((await findPayoutById(payoutId)).status).toBe('released');
    expect((await findWallet({ owner: storeId, ownerType: 'store' })).availableBalance).toBe(70);
    const l = await linhas(payoutId);
    expect(l).toHaveLength(1);
    expect(l[0].after).toMatchObject({ status: 'released', gatewayTransferId: null });
  });
});

describe('recusa definitiva', () => {
  it('4xx do Asaas → 502 PAYOUT_TRANSFER_REFUSED, volta a pending, sem linha; pode liberar de novo', async () => {
    const { storeId, payoutId } = await repasseDeLoja();
    post.mockRejectedValueOnce(new AsaasApiError(400, [{ code: 'invalid_action', description: 'Saldo insuficiente' }]));

    const r = await liberar(ceo, payoutId);

    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ code: 'PAYOUT_TRANSFER_REFUSED', currentStatus: 'pending' });
    expect(r.body.error).toMatch(/Saldo insuficiente/);
    expect((await findPayoutById(payoutId)).status).toBe('pending');
    expect((await findWallet({ owner: storeId, ownerType: 'store' })).pendingBalance).toBe(70);
    expect(await linhas(payoutId)).toHaveLength(0);

    post.mockResolvedValueOnce({ id: 'tr_2a', status: 'DONE' });
    const r2 = await liberar(ceo, payoutId);
    expect(r2.status).toBe(200);
    expect(post).toHaveBeenCalledTimes(2);
  });

  it('recebedor sem subconta → 502 PAYOUT_TRANSFER_REFUSED sem chamar /transfers, segue pending', async () => {
    const { payoutId } = await repasseDeLoja({ walletId: null });
    const r = await liberar(ceo, payoutId);
    expect(r.status).toBe(502);
    expect(r.body.code).toBe('PAYOUT_TRANSFER_REFUSED');
    expect(post.mock.calls.filter((c) => c[0] === '/transfers')).toHaveLength(0);
    expect((await findPayoutById(payoutId)).status).toBe('pending');
    expect(await linhas(payoutId)).toHaveLength(0);
  });
});

describe('resposta incerta', () => {
  it.each([
    ['timeout/rede', () => Promise.reject(Object.assign(new Error('The operation was aborted'), { name: 'AbortError' }))],
    ['5xx do Asaas', () => Promise.reject(new AsaasApiError(503, [{ code: 'unavailable', description: 'Indisponível' }]))],
    ['408 do Asaas', () => Promise.reject(new AsaasApiError(408, [{ code: 'timeout', description: 'Timeout' }]))],
    ['resposta sem id', () => Promise.resolve({ status: 'PENDING' })],
  ])('%s → 502 PAYOUT_TRANSFER_UNCERTAIN, fica releasing + uncertainAt, avisa o admin, e não libera de novo', async (_nome, impl) => {
    const { storeId, payoutId } = await repasseDeLoja();
    post.mockImplementationOnce(impl as any);

    const r = await liberar(ceo, payoutId);

    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ code: 'PAYOUT_TRANSFER_UNCERTAIN', currentStatus: 'releasing' });
    const p = await findPayoutById(payoutId);
    expect(p.status).toBe('releasing');
    expect(p.uncertainAt).toBeInstanceOf(Date);
    expect((await findWallet({ owner: storeId, ownerType: 'store' })).pendingBalance).toBe(70);
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ url: '/admin/payouts', tag: 'payout' }));
    const l = await linhas(payoutId);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ type: 'payout_release', after: { status: 'releasing', uncertain: true } });

    const again = await liberar(ceo2, payoutId);
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'PAYOUT_NOT_PENDING', currentStatus: 'releasing' });
    expect(post).toHaveBeenCalledTimes(1);
  });

  it('transferência aceita mas a baixa local falha → incerto com o id da transferência gravado', async () => {
    const { payoutId } = await repasseDeLoja();
    post.mockResolvedValueOnce({ id: 'tr_aceita', status: 'DONE' });
    jest.spyOn(payoutService, 'settleClaimedRelease').mockRejectedValueOnce(new Error('banco caiu na baixa'));

    const r = await liberar(ceo, payoutId);

    expect(r.status).toBe(502);
    expect(r.body.code).toBe('PAYOUT_TRANSFER_UNCERTAIN');
    const p = await findPayoutById(payoutId);
    expect(p).toMatchObject({ status: 'releasing', gatewayTransferId: 'tr_aceita', gatewayProvider: 'asaas' });
    expect(p.uncertainAt).toBeInstanceOf(Date);
    const l = await linhas(payoutId);
    expect(l).toHaveLength(1);
    expect(l[0].after).toMatchObject({ status: 'releasing', uncertain: true, gatewayTransferId: 'tr_aceita' });
  });

  it('liberação automática com resposta incerta → releasing + uncertainAt, sem linha (não há pessoa)', async () => {
    const orderId = fakeObjectId();
    const { payoutId } = await repasseDeLoja({ orderId });
    post.mockRejectedValueOnce(new Error('socket hang up'));

    await releaseOrderViaAsaas(orderId);

    const p = await findPayoutById(payoutId);
    expect(p.status).toBe('releasing');
    expect(p.uncertainAt).toBeInstanceOf(Date);
    expect(notify).toHaveBeenCalled();
    expect(await linhas(payoutId)).toHaveLength(0);
  });
});

describe('não liberável', () => {
  it('bloqueado → 409 PAYOUT_NOT_PENDING com blocked: true, sem chamar o Asaas', async () => {
    const { payoutId } = await repasseDeLoja({ blocked: true });
    const r = await liberar(ceo, payoutId);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'PAYOUT_NOT_PENDING', currentStatus: 'pending', blocked: true });
    expect(post).not.toHaveBeenCalled();
  });

  it.each(['released', 'requested', 'paid'])('já %s → 409 PAYOUT_NOT_PENDING com o currentStatus ("já feito" para o lote)', async (status) => {
    const { payoutId } = await repasseDeLoja();
    await prisma.payout.update({ where: { id: payoutId }, data: { status: status as any } });
    const r = await liberar(ceo, payoutId);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'PAYOUT_NOT_PENDING', currentStatus: status, blocked: false });
    expect(post).not.toHaveBeenCalled();
  });

  it('id inexistente → 404 PAYOUT_NOT_FOUND', async () => {
    const r = await liberar(ceo, 'nao-existe');
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('PAYOUT_NOT_FOUND');
  });

  it('sem payout:release → 403 e nada muda', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const { payoutId } = await repasseDeLoja();
    const r = await liberar(gerente, payoutId);
    expect(r.status).toBe(403);
    expect((await findPayoutById(payoutId)).status).toBe('pending');
  });
});

describe('a linha vive na transação da baixa', () => {
  it('modo legado: se gravar a linha falha, a liberação é desfeita (500, segue pending, saldo intacto)', async () => {
    env.PAYMENT_GATEWAY = 'none';
    const { storeId, payoutId } = await repasseDeLoja();
    jest.spyOn(moneyActions, 'recordAdminMoneyAction').mockRejectedValueOnce(new Error('falha ao gravar a linha'));

    const r = await liberar(ceo, payoutId);

    expect(r.status).toBe(500);
    expect((await findPayoutById(payoutId)).status).toBe('pending');
    const w = await findWallet({ owner: storeId, ownerType: 'store' });
    expect(w.pendingBalance).toBe(70);
    expect(w.availableBalance).toBe(0);
  });

  it('modo Asaas: se gravar a linha da baixa falha, nunca fica released sem linha — vira incerto (F10)', async () => {
    const { storeId, payoutId } = await repasseDeLoja();
    post.mockResolvedValueOnce({ id: 'tr_x', status: 'DONE' });
    jest.spyOn(moneyActions, 'recordAdminMoneyAction').mockRejectedValueOnce(new Error('falha ao gravar a linha'));

    const r = await liberar(ceo, payoutId);

    expect(r.status).toBe(502);
    expect(r.body).toMatchObject({ code: 'PAYOUT_TRANSFER_UNCERTAIN', currentStatus: 'releasing' });
    const p = await findPayoutById(payoutId);
    expect(p).toMatchObject({ status: 'releasing', gatewayTransferId: 'tr_x' });
    expect(p.uncertainAt).toBeInstanceOf(Date);
    const w = await findWallet({ owner: storeId, ownerType: 'store' });
    expect(w.pendingBalance).toBe(70);
    expect(w.availableBalance).toBe(0);
    const l = await linhas(payoutId);
    expect(l).toHaveLength(1);
    expect(l[0].after).toMatchObject({ status: 'releasing', uncertain: true, gatewayTransferId: 'tr_x' });
  });
});
