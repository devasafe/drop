/**
 * D3b-2b · P2.4 — troca de plano (spec 9, ruling 10): recusar exige motivo (5 a 500), grava plan_reject
 * na mesma transação e avisa o lojista; o lojista pode mandar um motivo ao pedir (requestReason),
 * que a fila e a lista de assinaturas devolvem; pedido novo e desistência sobrescrevem o campo.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { grantRolePermissions } from './helpers/d3b1Ops';

const DOMAIN = '@d3b2bp24.test';
const REASON = 'Plano 3 exige vitrine completa';
const PEDIDO = 'Quero aparecer nos destaques';
let dono: TestUser;
let ceo: TestUser;
let storeId: string;

beforeEach(async () => {
  dono = await createTestUser('lojista', DOMAIN);
  ceo = await createTestUser('ceo', DOMAIN);
  storeId = (await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P24', isOpen: true, plan: 1 } as any })).id;
});
afterEach(async () => {
  await prisma.storeSubscription.deleteMany({ where: { storeId } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const pedir = (body: Record<string, unknown>) =>
  request(app).post('/api/settings/store-subscription/request-change').set('Authorization', bearer(dono)).send(body);
const desistir = () => request(app).delete('/api/settings/store-subscription/request-change').set('Authorization', bearer(dono));
const recusar = (by: TestUser, body: Record<string, unknown>) =>
  request(app).post('/api/settings/reject-plan-change').set('Authorization', bearer(by)).send(body);
const sub = () => prisma.storeSubscription.findUniqueOrThrow({ where: { storeId } });
const rejects = () => prisma.adminAccountAction.findMany({ where: { storeId, type: 'plan_reject' } });
const avisos = () => prisma.notification.findMany({ where: { userId: dono.userId, title: 'Troca de plano recusada' } });

describe('pedido do lojista com motivo', () => {
  it('grava requestReason (trim); a fila e a lista de assinaturas devolvem o campo', async () => {
    const r = await pedir({ newPlan: 'plan3', reason: `  ${PEDIDO}  ` });
    expect(r.status).toBe(200);
    expect(r.body.subscription).toMatchObject({ requestedPlan: 'plan3', requestReason: PEDIDO });
    expect((await sub()).requestReason).toBe(PEDIDO);

    const fila = await request(app).get('/api/settings/pending-plan-changes').set('Authorization', bearer(ceo));
    expect(fila.status).toBe(200);
    expect(fila.body.find((s: any) => s.storeId === storeId)).toMatchObject({ requestedPlan: 'plan3', requestReason: PEDIDO });
    const todas = await request(app).get('/api/settings/all-store-subscriptions').set('Authorization', bearer(ceo));
    expect(todas.body.find((s: any) => s.storeId === storeId)).toMatchObject({ requestReason: PEDIDO });
  });

  it('desistir limpa o motivo; pedido novo sem motivo grava null', async () => {
    expect((await pedir({ newPlan: 'plan3', reason: 'Motivo do pedido antigo' })).status).toBe(200);
    expect((await sub()).requestReason).toBe('Motivo do pedido antigo');
    expect((await desistir()).status).toBe(200);
    expect((await sub()).requestReason).toBeNull();
    expect((await pedir({ newPlan: 'plan2', reason: '   ' })).status).toBe(200);
    expect((await sub()).requestReason).toBeNull();
  });

  it('motivo acima de 500 ou que não é texto → 400 REASON_TOO_LONG e nada muda', async () => {
    for (const reason of ['x'.repeat(501), 123]) {
      const r = await pedir({ newPlan: 'plan3', reason });
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ error: 'O motivo pode ter até 500 caracteres.', code: 'REASON_TOO_LONG' });
    }
    expect(await prisma.storeSubscription.findUnique({ where: { storeId } })).toBeNull();
    expect((await pedir({ newPlan: 'plan3', reason: 'x'.repeat(500) })).status).toBe(200);
  });
});

describe('POST /settings/reject-plan-change', () => {
  let subId: string;
  beforeEach(async () => {
    expect((await pedir({ newPlan: 'plan3', reason: PEDIDO })).status).toBe(200);
    subId = (await sub()).id;
  });

  it('sem motivo, motivo curto ou só espaços → 400 REASON_REQUIRED e o pedido continua pendente', async () => {
    for (const body of [{ subscriptionId: subId }, { subscriptionId: subId, reason: 'não' }, { subscriptionId: subId, reason: '      ' }]) {
      const r = await recusar(ceo, body);
      expect(r.status).toBe(400);
      expect(r.body).toEqual({ error: expect.any(String), code: 'REASON_REQUIRED' });
    }
    expect((await sub()).planChangeStatus).toBe('pending');
    expect(await rejects()).toHaveLength(0);
  });

  it('com motivo: rejected + rejectionReason, plan_reject na loja e aviso ao lojista', async () => {
    const r = await recusar(ceo, { subscriptionId: subId, reason: `  ${REASON}  ` });
    expect(r.status).toBe(200);
    expect(r.body.subscription).toMatchObject({ planChangeStatus: 'rejected', rejectionReason: REASON });

    const rows = await rejects();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ reason: REASON, actorId: ceo.userId, actorRole: 'ceo', storeId, userId: null });
    expect(rows[0].meta).toEqual({ subscriptionId: subId, requestedPlan: 'plan3', requestReason: PEDIDO });

    const [aviso] = await avisos();
    expect(aviso).toMatchObject({ message: `O DROP recusou a troca para o Plano 3. Motivo: ${REASON}`, link: '/seller/plano', entityId: storeId });
  });

  it('pedido que não está mais pendente: 409 PLAN_CHANGE_NOT_PENDING, sem histórico nem aviso', async () => {
    expect((await desistir()).status).toBe(200);
    const r = await recusar(ceo, { subscriptionId: subId, reason: REASON });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('PLAN_CHANGE_NOT_PENDING');
    expect(await rejects()).toHaveLength(0);
    expect(await avisos()).toHaveLength(0);
  });

  it('assinatura que não existe: 404', async () => {
    const r = await recusar(ceo, { subscriptionId: 'nao-existe', reason: REASON });
    expect(r.status).toBe(404);
  });

  it('permissão: sem plan:approve → 403; papel de equipe com plan:approve → 200', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restore = await grantRolePermissions('gerente_geral', ['plan:view']);
    try {
      expect((await recusar(gerente, { subscriptionId: subId, reason: REASON })).status).toBe(403);
      await grantRolePermissions('gerente_geral', ['plan:view', 'plan:approve']);
      expect((await recusar(gerente, { subscriptionId: subId, reason: REASON })).status).toBe(200);
      expect((await rejects())[0]).toMatchObject({ actorId: gerente.userId, actorRole: 'gerente_geral' });
    } finally {
      await restore();
    }
  });
});
