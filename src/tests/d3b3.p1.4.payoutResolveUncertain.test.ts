/**
 * D3b-3 · P1.4 — resolver repasse incerto (spec 4.1).
 * releasing + (uncertainAt OU parado há > 10 min) é resolvível: "released" faz a baixa uma vez;
 * "not_sent" volta a pending. Grava quem/quando/nota e uma linha payout_resolve_uncertain.
 * Não elegível → 409 PAYOUT_NOT_RESOLVABLE. O filtro "Incertos" lista só os resolvíveis.
 */
import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import asaasClient from '../services/asaas/client';
import * as socketEmitter from '../utils/socketEmitter';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createPayout, createWallet, findWallet, findPayoutById } from './helpers/financePg';
import { fakeObjectId } from './helpers/ids';
import { ownerIdForStore } from './helpers/storeOwner';

const DOMAIN = '@d3b3p14.test';
const NOTE = 'Conferido no painel do Asaas em 16/10';
let ceo: TestUser;
let ceo2: TestUser;
let post: jest.SpyInstance;
const previousGateway = env.PAYMENT_GATEWAY;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  ceo2 = await createTestUser('ceo', DOMAIN);
  env.PAYMENT_GATEWAY = 'asaas';
  post = jest.spyOn(asaasClient, 'post').mockRejectedValue(new Error('asaasClient.post não mockado neste caso'));
  jest.spyOn(socketEmitter, 'emitAdminNotification').mockImplementation(() => {});
});
afterEach(async () => {
  jest.restoreAllMocks();
  env.PAYMENT_GATEWAY = previousGateway;
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function repasseEmVoo(opts: { uncertain?: boolean; minutesAgo?: number; status?: string; transferId?: string } = {}) {
  const store = await prisma.store.create({
    data: { ownerId: await ownerIdForStore(DOMAIN), name: 'Loja P1.4', asaas: { status: 'active', walletId: 'wlt_p14' } },
  });
  await createWallet({ owner: store.id, ownerType: 'store', pendingBalance: 40 });
  const p = await createPayout({ recipientType: 'store', recipientId: store.id, orderId: fakeObjectId(), amount: 40, status: opts.status ?? 'releasing' });
  if (opts.uncertain) {
    await prisma.payout.update({
      where: { id: p._id },
      data: { uncertainAt: new Date(), ...(opts.transferId ? { gatewayProvider: 'asaas', gatewayTransferId: opts.transferId } : {}) },
    });
  }
  if (opts.minutesAgo) {
    await prisma.$executeRaw`UPDATE "Payout" SET "updatedAt" = NOW() - make_interval(mins => ${opts.minutesAgo}::int) WHERE id = ${p._id}`;
  }
  return { storeId: store.id, payoutId: String(p._id) };
}

const resolver = (who: TestUser, id: string, body: any) =>
  request(app).post(`/api/payouts/admin/${id}/resolve-uncertain`).set('Authorization', bearer(who)).send(body);
const linhas = (payoutId: string) =>
  prisma.adminMoneyAction.findMany({ where: { targetType: 'payout', targetId: payoutId, type: 'payout_resolve_uncertain' } });

describe('resolver: foi pago', () => {
  it('baixa released com o id informado, move o saldo, grava quem/nota e uma linha', async () => {
    const { storeId, payoutId } = await repasseEmVoo({ uncertain: true });

    const r = await resolver(ceo, payoutId, { outcome: 'released', asaasTransferId: 'tr_painel', note: NOTE });

    expect(r.status).toBe(200);
    expect(r.body).toEqual({ message: 'Repasse resolvido', payout: { id: payoutId, status: 'released' } });
    const p = await findPayoutById(payoutId);
    expect(p).toMatchObject({ status: 'released', gatewayProvider: 'asaas', gatewayTransferId: 'tr_painel', resolvedBy: ceo.userId, resolutionNote: NOTE });
    expect(p.resolvedAt).toBeInstanceOf(Date);
    const w = await findWallet({ owner: storeId, ownerType: 'store' });
    expect(w.pendingBalance).toBe(0);
    expect(w.availableBalance).toBe(40);
    const l = await linhas(payoutId);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ actorId: ceo.userId, reason: NOTE, after: { status: 'released', outcome: 'released', gatewayTransferId: 'tr_painel' } });
    expect(l[0].before).toMatchObject({ status: 'releasing' });
    expect(Number(l[0].amount)).toBe(40);
  });

  it('sem id informado usa o id que o Asaas já tinha devolvido', async () => {
    const { payoutId } = await repasseEmVoo({ uncertain: true, transferId: 'tr_aceita' });
    const r = await resolver(ceo, payoutId, { outcome: 'released', note: NOTE });
    expect(r.status).toBe(200);
    expect((await findPayoutById(payoutId)).gatewayTransferId).toBe('tr_aceita');
  });

  it('resolver de novo → 409 PAYOUT_NOT_RESOLVABLE com currentStatus released', async () => {
    const { payoutId } = await repasseEmVoo({ uncertain: true });
    expect((await resolver(ceo, payoutId, { outcome: 'released', note: NOTE })).status).toBe(200);
    const again = await resolver(ceo, payoutId, { outcome: 'not_sent', note: NOTE });
    expect(again.status).toBe(409);
    expect(again.body).toMatchObject({ code: 'PAYOUT_NOT_RESOLVABLE', currentStatus: 'released' });
    expect(await linhas(payoutId)).toHaveLength(1);
  });

  it('duas resoluções simultâneas → um 200 e um 409, saldo movido uma vez, uma linha', async () => {
    const { storeId, payoutId } = await repasseEmVoo({ uncertain: true });
    const [a, b] = await Promise.all([
      resolver(ceo, payoutId, { outcome: 'released', note: NOTE }),
      resolver(ceo2, payoutId, { outcome: 'released', note: NOTE }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect((await findWallet({ owner: storeId, ownerType: 'store' })).availableBalance).toBe(40);
    expect(await linhas(payoutId)).toHaveLength(1);
  });
});

describe('resolver: não foi enviado', () => {
  it('volta a pending sem marca de incerteza, grava a nota e a linha; depois pode liberar de novo', async () => {
    const { storeId, payoutId } = await repasseEmVoo({ uncertain: true, transferId: 'tr_fantasma' });

    const r = await resolver(ceo, payoutId, { outcome: 'not_sent', note: NOTE });

    expect(r.status).toBe(200);
    expect(r.body.payout).toEqual({ id: payoutId, status: 'pending' });
    const p = await findPayoutById(payoutId);
    expect(p).toMatchObject({ status: 'pending', uncertainAt: null, gatewayTransferId: null, resolvedBy: ceo.userId, resolutionNote: NOTE });
    expect((await findWallet({ owner: storeId, ownerType: 'store' })).pendingBalance).toBe(40);
    const l = await linhas(payoutId);
    expect(l).toHaveLength(1);
    expect(l[0].after).toMatchObject({ status: 'pending', outcome: 'not_sent' });

    post.mockResolvedValueOnce({ id: 'tr_nova', status: 'DONE' });
    const lib = await request(app).post(`/api/payouts/admin/${payoutId}/release`).set('Authorization', bearer(ceo)).send({});
    expect(lib.status).toBe(200);
    expect((await findPayoutById(payoutId)).status).toBe('released');
  });
});

describe('elegibilidade', () => {
  it('releasing sem marca e reivindicado há menos de 10 min → 409 (a transferência pode estar em voo)', async () => {
    const { payoutId } = await repasseEmVoo({ minutesAgo: 2 });
    const r = await resolver(ceo, payoutId, { outcome: 'not_sent', note: NOTE });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'PAYOUT_NOT_RESOLVABLE', currentStatus: 'releasing', uncertainAt: null });
    expect((await findPayoutById(payoutId)).status).toBe('releasing');
  });

  it('releasing parado há mais de 10 min (processo caiu) → resolvível', async () => {
    const { payoutId } = await repasseEmVoo({ minutesAgo: 11 });
    const r = await resolver(ceo, payoutId, { outcome: 'not_sent', note: NOTE });
    expect(r.status).toBe(200);
    expect((await findPayoutById(payoutId)).status).toBe('pending');
  });

  it.each(['pending', 'released', 'paid'])('%s → 409 PAYOUT_NOT_RESOLVABLE', async (status) => {
    const { payoutId } = await repasseEmVoo({ status });
    const r = await resolver(ceo, payoutId, { outcome: 'released', note: NOTE });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'PAYOUT_NOT_RESOLVABLE', currentStatus: status });
  });

  it('id inexistente → 404 PAYOUT_NOT_FOUND', async () => {
    const r = await resolver(ceo, 'nao-existe', { outcome: 'released', note: NOTE });
    expect(r.status).toBe(404);
    expect(r.body.code).toBe('PAYOUT_NOT_FOUND');
  });
});

describe('validação e permissão', () => {
  it.each([
    [{ outcome: 'released', note: 'curta' }],
    [{ outcome: 'outro', note: NOTE }],
    [{ outcome: 'not_sent', asaasTransferId: 'tr_x', note: NOTE }],
    [{ outcome: 'released' }],
  ])('corpo inválido %j → 400 e nada muda', async (body) => {
    const { payoutId } = await repasseEmVoo({ uncertain: true });
    const r = await resolver(ceo, payoutId, body);
    expect(r.status).toBe(400);
    expect((await findPayoutById(payoutId)).status).toBe('releasing');
  });

  it('sem payout:release → 403', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const { payoutId } = await repasseEmVoo({ uncertain: true });
    expect((await resolver(gerente, payoutId, { outcome: 'released', note: NOTE })).status).toBe(403);
  });
});

describe('filtro "Incertos" da lista do admin', () => {
  it('GET /payouts/admin?uncertain=1 traz só os resolvíveis, com os campos de incerto', async () => {
    const incerto = await repasseEmVoo({ uncertain: true });
    const parado = await repasseEmVoo({ minutesAgo: 11 });
    const emVoo = await repasseEmVoo({ minutesAgo: 1 });
    const pendente = await repasseEmVoo({ status: 'pending' });

    const r = await request(app).get('/api/payouts/admin?uncertain=1&limit=200').set('Authorization', bearer(ceo));

    expect(r.status).toBe(200);
    const ids = r.body.payouts.map((p: any) => p.id);
    expect(ids).toEqual(expect.arrayContaining([incerto.payoutId, parado.payoutId]));
    expect(ids).not.toContain(emVoo.payoutId);
    expect(ids).not.toContain(pendente.payoutId);
    const linha = r.body.payouts.find((p: any) => p.id === incerto.payoutId);
    expect(linha.uncertainAt).toBeTruthy();
    expect(linha).toHaveProperty('resolutionNote', null);
    expect(linha).toHaveProperty('updatedAt');
  });
});
