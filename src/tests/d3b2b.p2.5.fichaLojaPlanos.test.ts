/**
 * D3b-2b · P2.5 — ficha da loja (GET /admin/stores/:id): bloco "Conta Asaas · histórico" só para o
 * CEO (a chave nem existe para os outros), `can.extendTrial` (plan:manage + trialing),
 * `can.cancelSaas` (plan:manage + mensalidade não cancelada) e `plan.saas.cancelledAt`.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { grantRolePermissions } from './helpers/d3b1Ops';

const DOMAIN = '@d3b2bp25.test';
let ceo: TestUser;
let dono: TestUser;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  dono = await createTestUser('lojista', DOMAIN);
});
afterEach(async () => {
  const stores = await prisma.store.findMany({ where: { owner: { email: { endsWith: DOMAIN } } }, select: { id: true } });
  const ids = stores.map((s) => s.id);
  // StoreAsaasAudit e StoreSubscription não têm FK com Store: saem à mão. O aceite sai no cleanup.
  await prisma.storeAsaasAudit.deleteMany({ where: { storeId: { in: ids } } });
  await prisma.storeSubscription.deleteMany({ where: { storeId: { in: ids } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const loja = () => prisma.store.create({ data: { ownerId: dono.userId, name: `Loja p25 ${Math.random().toString(36).slice(2, 8)}`, isOpen: true } });
const detail = (id: string, who: TestUser = ceo) => request(app).get(`/api/admin/stores/${id}`).set('Authorization', bearer(who));

describe('GET /admin/stores/:id · mensalidade e conta Asaas', () => {
  it('CEO: os 20 registros Asaas mais novos com autor, o último aceite, plan.saas.cancelledAt e can com as duas ações', async () => {
    const store = await loja();
    await prisma.storeSaasBilling.create({ data: { storeId: store.id, status: 'trialing', trialEndsAt: new Date('2026-11-01T00:00:00.000Z') } });
    const base = Date.parse('2026-10-01T12:00:00.000Z');
    for (let i = 0; i < 22; i++) {
      await prisma.storeAsaasAudit.create({
        data: {
          storeId: store.id,
          actorId: i % 2 ? ceo.userId : 'actor-sem-conta',
          action: i === 21 ? 'replace' : 'connect',
          apiKeyLast4: String(1000 + i),
          createdAt: new Date(base + i * 60_000),
        },
      });
    }
    await prisma.storeAsaasConsent.create({
      data: { storeId: store.id, actorId: dono.userId, actorRole: 'lojista', termsVersion: 'p25-v1', ip: '10.0.0.1', userAgent: 'jest-agente', acceptedAt: new Date('2026-09-01T10:00:00.000Z') },
    });
    await prisma.storeAsaasConsent.create({
      data: { storeId: store.id, actorId: ceo.userId, actorRole: 'admin', termsVersion: 'p25-v2', ip: '10.0.0.2', userAgent: 'jest-agente', acceptedAt: new Date('2026-10-05T10:00:00.000Z') },
    });

    const res = await detail(store.id);
    expect(res.status).toBe(200);
    const h = res.body.asaasHistory;
    expect(h.audits).toHaveLength(20);
    expect(h.audits[0]).toEqual({ action: 'replace', apiKeyLast4: '1021', actor: { id: ceo.userId, name: 'User ceo' }, createdAt: new Date(base + 21 * 60_000).toISOString() });
    expect(h.audits[1]).toEqual({ action: 'connect', apiKeyLast4: '1020', actor: { id: 'actor-sem-conta', name: null }, createdAt: new Date(base + 20 * 60_000).toISOString() });
    expect(h.audits[19].apiKeyLast4).toBe('1002');
    expect(h.consent).toEqual({ termsVersion: 'p25-v2', ip: '10.0.0.2', acceptedAt: '2026-10-05T10:00:00.000Z', actorRole: 'admin' });
    expect(JSON.stringify(h)).not.toContain('jest-agente');

    // coveredUntil: 01/11 00:00Z = 31/10 21:00 em Brasília; o dia acaba em 01/11 03:00Z; o último instante é 1 ms antes.
    expect(res.body.plan.saas).toEqual({
      status: 'trialing', trialEndsAt: '2026-11-01T00:00:00.000Z', paidUntil: null, cancelledAt: null, coveredUntil: '2026-11-01T02:59:59.999Z',
    });
    expect(res.body.can).toEqual({ pause: true, unpause: false, note: true, extendTrial: true, cancelSaas: true });
  });

  it('CEO, loja sem histórico e com a mensalidade cancelada: audits [] e consent null; cancelledAt; can sem as duas ações', async () => {
    const store = await loja();
    await prisma.storeSaasBilling.create({
      data: { storeId: store.id, status: 'cancelled', trialEndsAt: new Date('2026-09-01T00:00:00.000Z'), cancelledAt: new Date('2026-10-15T12:00:00.000Z'), cancelledBy: ceo.userId },
    });
    const res = await detail(store.id);
    expect(res.status).toBe(200);
    expect(res.body.asaasHistory).toEqual({ audits: [], consent: null });
    expect(res.body.plan.saas.cancelledAt).toBe('2026-10-15T12:00:00.000Z');
    // Sem período pago: a cobertura é o fim do dia do teste em Brasília (31/08), já passado.
    expect(res.body.plan.saas.coveredUntil).toBe('2026-09-01T02:59:59.999Z');
    expect(res.body.can).toMatchObject({ extendTrial: false, cancelSaas: false });
  });

  it('gerente com store:view_all: sem a chave asaasHistory e sem as ações; com plan:manage, conforme o status', async () => {
    const store = await loja();
    await prisma.storeSaasBilling.create({ data: { storeId: store.id, status: 'trialing', trialEndsAt: new Date(Date.now() + 86_400_000) } });
    await prisma.storeAsaasAudit.create({ data: { storeId: store.id, actorId: ceo.userId, action: 'connect', apiKeyLast4: '9876' } });
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restore = await grantRolePermissions('gerente_geral', ['store:view_all']);
    try {
      const res = await detail(store.id, gerente);
      expect(res.status).toBe(200);
      expect(Object.prototype.hasOwnProperty.call(res.body, 'asaasHistory')).toBe(false);
      expect(res.text).not.toContain('9876');
      expect(res.body.can).toEqual({ pause: false, unpause: false, note: true, extendTrial: false, cancelSaas: false });

      await grantRolePermissions('gerente_geral', ['store:view_all', 'plan:manage']);
      expect((await detail(store.id, gerente)).body.can).toMatchObject({ extendTrial: true, cancelSaas: true });
      await prisma.storeSaasBilling.update({ where: { storeId: store.id }, data: { status: 'active' } });
      expect((await detail(store.id, gerente)).body.can).toMatchObject({ extendTrial: false, cancelSaas: true });
      await prisma.storeSaasBilling.update({ where: { storeId: store.id }, data: { status: 'cancelled', cancelledAt: new Date() } });
      expect((await detail(store.id, gerente)).body.can).toMatchObject({ extendTrial: false, cancelSaas: false });
      await prisma.storeSaasBilling.delete({ where: { storeId: store.id } });
      expect((await detail(store.id, gerente)).body.can).toMatchObject({ extendTrial: false, cancelSaas: false });
    } finally {
      await restore();
    }
  });
});
