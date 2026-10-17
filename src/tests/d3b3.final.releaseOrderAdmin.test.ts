/**
 * D3b-3 · revisão final I2 — "Re-liberar pedido" do admin (POST /admin/asaas/release-order/:orderId,
 * gateway:manage) é uma pessoa disparando transferências: cada repasse liberado (ou incerto)
 * grava a linha payout_release com o autor; erro inesperado devolve mensagem fixa, sem o texto cru.
 */
import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import asaasClient from '../services/asaas/client';
import * as socketEmitter from '../utils/socketEmitter';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createPayout, createWallet, findPayoutById } from './helpers/financePg';
import { fakeObjectId } from './helpers/ids';
import { ownerIdForStore } from './helpers/storeOwner';

const DOMAIN = '@d3b3final2.test';
let ceo: TestUser;
let post: jest.SpyInstance;
const previousGateway = env.PAYMENT_GATEWAY;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  env.PAYMENT_GATEWAY = 'asaas';
  post = jest.spyOn(asaasClient, 'post').mockRejectedValue(new Error('asaasClient.post não mockado neste caso'));
  jest.spyOn(socketEmitter, 'emitAdminNotification').mockImplementation(() => {});
});
afterEach(async () => {
  jest.restoreAllMocks();
  env.PAYMENT_GATEWAY = previousGateway;
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function pedidoComRepasses(opts: { blockedSecond?: boolean } = {}) {
  const orderId = fakeObjectId();
  const ids: string[] = [];
  for (const [i, amount] of [70, 30].entries()) {
    const store = await prisma.store.create({
      data: { ownerId: await ownerIdForStore(DOMAIN), name: `Loja I2 ${i}`, asaas: { status: 'active', walletId: `wlt_${i}` } },
    });
    await createWallet({ owner: store.id, ownerType: 'store', pendingBalance: amount });
    const p = await createPayout({ recipientType: 'store', recipientId: store.id, orderId, amount, status: 'pending' });
    ids.push(String(p!._id));
  }
  if (opts.blockedSecond) {
    await prisma.payout.update({ where: { id: ids[1] }, data: { blocked: true, blockReason: 'fraude', blockedAt: new Date(), blockedBy: ceo.userId } });
  }
  return { orderId, ids };
}

const reliberar = (who: TestUser, orderId: string) =>
  request(app).post(`/api/admin/asaas/release-order/${orderId}`).set('Authorization', bearer(who)).send({});

const linhas = (payoutId: string) =>
  prisma.adminMoneyAction.findMany({ where: { targetType: 'payout', targetId: payoutId } });

describe('POST /admin/asaas/release-order/:orderId', () => {
  it('libera cada repasse pending e grava uma linha payout_release por repasse, com o autor', async () => {
    const { orderId, ids } = await pedidoComRepasses();
    post.mockResolvedValueOnce({ id: 'tr_a', status: 'DONE' }).mockResolvedValueOnce({ id: 'tr_b', status: 'DONE' });

    const r = await reliberar(ceo, orderId);

    expect(r.status).toBe(200);
    expect(post).toHaveBeenCalledTimes(2);
    for (const id of ids) {
      expect((await findPayoutById(id))!.status).toBe('released');
      const l = await linhas(id);
      expect(l).toHaveLength(1);
      expect(l[0]).toEqual(expect.objectContaining({ type: 'payout_release', actorId: ceo.userId }));
    }
    expect(r.body.payouts).toHaveLength(2);
  });

  it('resposta incerta: repasse fica releasing com a linha; o outro segue; bloqueado não é tocado', async () => {
    const { orderId, ids } = await pedidoComRepasses({ blockedSecond: true });
    post.mockRejectedValueOnce(Object.assign(new Error('timeout'), { name: 'AsaasApiError', status: 504 }));

    const r = await reliberar(ceo, orderId);

    expect(r.status).toBe(200);
    expect(post).toHaveBeenCalledTimes(1);
    expect((await findPayoutById(ids[0]))!.status).toBe('releasing');
    const l = await linhas(ids[0]);
    expect(l).toHaveLength(1);
    expect(l[0]).toEqual(expect.objectContaining({ type: 'payout_release', actorId: ceo.userId }));
    expect((await findPayoutById(ids[1]))!.status).toBe('pending');
    expect(await linhas(ids[1])).toHaveLength(0);
  });

  it('erro inesperado: 500 com mensagem fixa, sem o texto cru do erro', async () => {
    jest.spyOn(prisma.payout, 'findMany').mockRejectedValueOnce(new Error('detalhe-interno-do-banco'));

    const r = await reliberar(ceo, fakeObjectId());

    expect(r.status).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain('detalhe-interno-do-banco');
    expect(r.body.error).toBe('Erro ao re-liberar o pedido');
  });
});

describe('M1 — releitura depois da reivindicação falha', () => {
  it('devolve o repasse a pending, não chama o Asaas e responde 500 fixo', async () => {
    const { ids } = await pedidoComRepasses();
    jest.spyOn(prisma.payout, 'findUniqueOrThrow').mockRejectedValueOnce(new Error('banco fora'));

    const r = await request(app).post(`/api/payouts/admin/${ids[0]}/release`).set('Authorization', bearer(ceo)).send({});

    expect(r.status).toBe(500);
    expect(post).not.toHaveBeenCalled();
    expect((await findPayoutById(ids[0]))!.status).toBe('pending');
    expect(await linhas(ids[0])).toHaveLength(0);
  });
});
