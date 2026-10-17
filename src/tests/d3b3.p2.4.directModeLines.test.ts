/**
 * D3b-3 · P2.4 — modo direto (spec 4.6): retentar e resolver Pix ao motoboy e resolver estorno
 * gravam exatamente uma linha na transação da transição. Recusa (409) não grava; webhook não grava;
 * falha ao gravar a linha desfaz a transição.
 */
import crypto from 'crypto';
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import * as moneyActions from '../services/adminMoneyAction.service';
import { markDirectRefundDone } from '../services/asaasLoja/refund';

const DOMAIN = '@d3b3p24.test';
const PREFIX = 'd3b3p24';
const NOTE = 'Conferido no painel do Asaas em 16/10';
let ceo: TestUser;
let ceo2: TestUser;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  ceo2 = await createTestUser('ceo', DOMAIN);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await prisma.motoboyTransfer.deleteMany({ where: { orderId: { startsWith: PREFIX } } });
  await prisma.directRefund.deleteMany({ where: { orderId: { startsWith: PREFIX } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const uid = () => crypto.randomUUID().slice(0, 8);
const transferencia = (status: string, attempts = 3) =>
  prisma.motoboyTransfer.create({
    data: {
      deliveryId: `${PREFIX}-del-${uid()}`, orderId: `${PREFIX}-ord-${uid()}`, storeId: `${PREFIX}-st`, motoboyId: `${PREFIX}-mb`,
      amount: 8.5, pixKeyEncrypted: encryptSensitiveData('12345678912'), pixKeyType: 'CPF', status, attempts,
    },
  });
const estorno = (status: string) =>
  prisma.directRefund.create({
    data: {
      orderId: `${PREFIX}-ord-${uid()}`, storeId: `${PREFIX}-st`, asaasPaymentId: `pay_${uid()}`,
      amount: 42, status, requestedBy: 'system',
    },
  });
const linhas = (targetId: string) => prisma.adminMoneyAction.findMany({ where: { targetId } });

describe('Pix ao motoboy', () => {
  it('retentar failed_final → uma linha motoboy_transfer_retry com antes/depois', async () => {
    const t = await transferencia('failed_final', 6);
    const r = await request(app).post(`/api/admin/transfers/${t.id}/retry`).set('Authorization', bearer(ceo));
    expect(r.status).toBe(200);
    const l = await linhas(t.id);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      type: 'motoboy_transfer_retry', targetType: 'motoboy_transfer', actorId: ceo.userId,
      before: { status: 'failed_final', attempts: 6 }, after: { status: 'failed', attempts: 0 },
    });
    expect(Number(l[0].amount)).toBe(8.5);
  });

  it('retentar uncertain → 409 TRANSFER_UNCERTAIN e nenhuma linha', async () => {
    const t = await transferencia('uncertain');
    const r = await request(app).post(`/api/admin/transfers/${t.id}/retry`).set('Authorization', bearer(ceo));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('TRANSFER_UNCERTAIN');
    expect(await linhas(t.id)).toHaveLength(0);
  });

  it('resolver uncertain → uma linha motoboy_transfer_resolve com a nota', async () => {
    const t = await transferencia('uncertain');
    const r = await request(app).post(`/api/admin/transfers/${t.id}/resolve`).set('Authorization', bearer(ceo)).send({ note: NOTE });
    expect(r.status).toBe(200);
    const l = await linhas(t.id);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      type: 'motoboy_transfer_resolve', actorId: ceo.userId, reason: NOTE,
      before: { status: 'uncertain' }, after: { status: 'done' },
    });
  });

  it('dois "resolver" simultâneos → um 200, um 409 e uma linha', async () => {
    const t = await transferencia('failed_final');
    const url = `/api/admin/transfers/${t.id}/resolve`;
    const [a, b] = await Promise.all([
      request(app).post(url).set('Authorization', bearer(ceo)).send({ note: NOTE }),
      request(app).post(url).set('Authorization', bearer(ceo2)).send({ note: NOTE }),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    expect(await linhas(t.id)).toHaveLength(1);
  });

  it('falha ao gravar a linha desfaz a resolução', async () => {
    const t = await transferencia('uncertain');
    jest.spyOn(moneyActions, 'recordAdminMoneyAction').mockRejectedValueOnce(new Error('falha ao gravar a linha'));
    const r = await request(app).post(`/api/admin/transfers/${t.id}/resolve`).set('Authorization', bearer(ceo)).send({ note: NOTE });
    expect(r.status).toBe(500);
    expect((await prisma.motoboyTransfer.findUnique({ where: { id: t.id } }))?.status).toBe('uncertain');
  });
});

describe('estorno direto', () => {
  it('resolver → uma linha direct_refund_resolve com a nota e o status anterior', async () => {
    const e = await estorno('failed_final');
    const r = await request(app).post(`/api/admin/direct-refunds/${e.id}/resolve`).set('Authorization', bearer(ceo)).send({ note: NOTE });
    expect(r.status).toBe(200);
    const l = await linhas(e.id);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      type: 'direct_refund_resolve', targetType: 'direct_refund', actorId: ceo.userId, reason: NOTE,
      before: { status: 'failed_final' }, after: { status: 'done' },
    });
    expect(Number(l[0].amount)).toBe(42);
  });

  it('webhook (sem pessoa) conclui sem linha', async () => {
    const e = await estorno('requested');
    expect(await markDirectRefundDone(e.orderId, 'webhook')).toBe(true);
    expect(await linhas(e.id)).toHaveLength(0);
  });

  it('falha ao gravar a linha desfaz a conclusão', async () => {
    const e = await estorno('uncertain');
    jest.spyOn(moneyActions, 'recordAdminMoneyAction').mockRejectedValueOnce(new Error('falha ao gravar a linha'));
    const r = await request(app).post(`/api/admin/direct-refunds/${e.id}/resolve`).set('Authorization', bearer(ceo)).send({ note: NOTE });
    expect(r.status).toBe(500);
    expect((await prisma.directRefund.findUnique({ where: { id: e.id } }))?.status).toBe('uncertain');
  });
});
