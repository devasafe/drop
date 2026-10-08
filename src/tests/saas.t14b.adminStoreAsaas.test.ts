jest.mock('../services/asaas/client', () => {
  const actual = jest.requireActual('../services/asaas/client');
  return {
    __esModule: true,
    ...actual,
    default: { ...actual.default, getAs: jest.fn(), postAs: jest.fn(), putAs: jest.fn(), deleteAs: jest.fn() },
  };
});
import request from 'supertest';
import app from '../app';
import asaasClient, { AsaasApiError } from '../services/asaas/client';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import jwt from 'jsonwebtoken';
import { createTestUser, bearer, TEST_JWT_SECRET } from './helpers/authUser';

const DOMAIN = '@saas14b.test';
const KEY = '$aact_hmlg_abcdef123456';
const KEY2 = '$aact_hmlg_zzzzzz987654';
let ceo: any, gerente: any, owner: any, cliente: any, storeId: string;

beforeEach(async () => {
  jest.clearAllMocks();
  (asaasClient.getAs as jest.Mock).mockResolvedValue({ balance: 0 });
  ceo = await createTestUser('ceo', DOMAIN);
  gerente = await createTestUser('gerente_geral', DOMAIN);
  owner = await createTestUser('lojista', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
  storeId = (await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja t14b', isOpen: true } })).id;
});
afterEach(async () => {
  await prisma.storeAsaasAudit.deleteMany({ where: { storeId } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const base = () => `/api/admin/stores/${storeId}/asaas`;
const put = (u: any, key = KEY) => request(app).put(base()).set('Authorization', bearer(u)).send({ apiKey: key, acceptTerms: true });
const audits = () => prisma.storeAsaasAudit.findMany({ where: { storeId }, orderBy: { createdAt: 'asc' } });

describe('t1.4b — admin (CEO) gerencia a conta Asaas de qualquer loja', () => {
  it('CEO conecta loja alheia: 200, valid, audit connect com actorId do CEO; de novo = replace', async () => {
    const r = await put(ceo);
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('valid');
    const r2 = await put(ceo, KEY2);
    expect(r2.status).toBe(200);
    const a = await audits();
    expect(a.map((x) => x.action)).toEqual(['connect', 'replace']);
    expect(a[0].actorId).toBe(ceo.userId);
    expect(a[0].apiKeyLast4).toBe('3456');
    expect(a[1].apiKeyLast4).toBe('7654');
  });

  it('GET devolve o status; DELETE apaga a conta e audita disconnect', async () => {
    await put(ceo);
    const get = await request(app).get(base()).set('Authorization', bearer(ceo));
    expect(get.status).toBe(200);
    expect(get.body.data.status).toBe('valid');
    const del = await request(app).delete(base()).set('Authorization', bearer(ceo));
    expect(del.status).toBe(200);
    expect(del.body.data).toMatchObject({ status: 'none', apiKeyLast4: null });
    expect(await prisma.storeAsaasAccount.findUnique({ where: { storeId } })).toBeNull();
    const a = await audits();
    expect(a.map((x) => x.action)).toEqual(['connect', 'disconnect']);
    expect(a[1].actorId).toBe(ceo.userId);
  });

  it('DELETE de loja sem conta → 404 e nada auditado', async () => {
    const del = await request(app).delete(base()).set('Authorization', bearer(ceo));
    expect(del.status).toBe(404);
    expect(await audits()).toHaveLength(0);
  });

  // I4 (revisão final): auth-token responde 404 FEATURE_NOT_AVAILABLE até a Fase 2 (antes: 200 com token).
  it('CEO completa o onboarding: test e checklist; auth-token indisponível (404)', async () => {
    await put(ceo);
    const t = await request(app).post(`${base()}/test`).set('Authorization', bearer(ceo));
    expect(t.status).toBe(200);
    const c = await request(app).post(`${base()}/checklist`).set('Authorization', bearer(ceo)).send({ ipWhitelist: true });
    expect(c.status).toBe(200);
    expect(c.body.data.checklist.ipWhitelistConfirmed).toBe(true);
    const tk = await request(app).post(`${base()}/auth-token`).set('Authorization', bearer(ceo));
    expect(tk.status).toBe(404);
    expect(tk.body.error).toMatchObject({ code: 'FEATURE_NOT_AVAILABLE' });
  });

  it('não-CEO (gerente_geral, lojista dono, cliente) → 403 em todas as rotas admin; sem token → 401', async () => {
    for (const u of [gerente, owner, cliente]) {
      const h = { Authorization: bearer(u) };
      expect((await request(app).put(base()).set(h).send({ apiKey: KEY })).status).toBe(403);
      expect((await request(app).get(base()).set(h)).status).toBe(403);
      expect((await request(app).delete(base()).set(h)).status).toBe(403);
      expect((await request(app).post(`${base()}/test`).set(h)).status).toBe(403);
      expect((await request(app).post(`${base()}/checklist`).set(h).send({ ipWhitelist: true })).status).toBe(403);
      expect((await request(app).post(`${base()}/auth-token`).set(h)).status).toBe(403);
      expect((await request(app).get('/api/admin/stores/asaas').set(h)).status).toBe(403);
    }
    expect((await request(app).get(base())).status).toBe(401);
    expect(asaasClient.getAs).not.toHaveBeenCalled();
    expect(await audits()).toHaveLength(0);
  });

  it('usuário com "ceo" em roles mas activeRole ≠ ceo → 403 em todas as rotas admin de conta Asaas', async () => {
    const u = await prisma.user.create({
      data: {
        name: 'CEO em outro papel', email: `ceo-other-${Date.now()}-${Math.random().toString(36).slice(2)}${DOMAIN}`,
        passwordHash: 'x', role: 'ceo', roles: ['ceo', 'gerente_geral', 'cliente'], activeRole: 'gerente_geral',
      } as any,
    });
    const token = jwt.sign({ id: u.id, role: 'ceo', activeRole: 'gerente_geral', roles: ['ceo', 'gerente_geral', 'cliente'] }, TEST_JWT_SECRET, { expiresIn: '1h' });
    const h = { Authorization: `Bearer ${token}` };
    expect((await request(app).put(base()).set(h).send({ apiKey: KEY })).status).toBe(403);
    expect((await request(app).get(base()).set(h)).status).toBe(403);
    expect((await request(app).delete(base()).set(h)).status).toBe(403);
    expect((await request(app).post(`${base()}/test`).set(h)).status).toBe(403);
    expect((await request(app).post(`${base()}/checklist`).set(h).send({ ipWhitelist: true })).status).toBe(403);
    expect((await request(app).post(`${base()}/auth-token`).set(h)).status).toBe(403);
    expect((await request(app).get('/api/admin/stores/asaas').set(h)).status).toBe(403);
    expect(asaasClient.getAs).not.toHaveBeenCalled();
    expect(await audits()).toHaveLength(0);
  });

  it('loja inexistente → 404 no PUT do CEO', async () => {
    const r = await request(app).put('/api/admin/stores/naoexiste/asaas').set('Authorization', bearer(ceo)).send({ apiKey: KEY, acceptTerms: true });
    expect(r.status).toBe(404);
  });

  it('lista de lojas (CEO): sem chave nem hash, com apiKeyLast4', async () => {
    await put(ceo);
    const r = await request(app).get('/api/admin/stores/asaas').set('Authorization', bearer(ceo));
    expect(r.status).toBe(200);
    const row = r.body.data.find((s: any) => s.storeId === storeId);
    expect(row).toMatchObject({ storeId, name: 'Loja t14b', status: 'valid', environment: 'sandbox', apiKeyLast4: '3456' });
    expect(row.lastCheckedAt).toBeTruthy();
    expect(JSON.stringify(r.body)).not.toMatch(/aact_|apiKeyEncrypted|TokenHash/);
  });

  it('contrato: nenhuma resposta admin contém aact_, apiKeyEncrypted ou hash', async () => {
    const res = [
      await put(ceo),
      await request(app).get(base()).set('Authorization', bearer(ceo)),
      await request(app).post(`${base()}/test`).set('Authorization', bearer(ceo)),
      await request(app).delete(base()).set('Authorization', bearer(ceo)),
    ];
    for (const r of res) expect(JSON.stringify(r.body)).not.toMatch(/aact_|apiKeyEncrypted|TokenHash|abcdef123456/);
  });

  it('chave recusada pelo Asaas não grava conta nem audit', async () => {
    (asaasClient.getAs as jest.Mock).mockRejectedValueOnce(new AsaasApiError(401, []));
    const r = await put(ceo);
    expect(r.status).toBe(400);
    expect(await audits()).toHaveLength(0);
    expect(await prisma.storeAsaasAccount.findUnique({ where: { storeId } })).toBeNull();
  });

  it('o conectar do lojista (rota 1.4) também audita, com actorId do dono', async () => {
    const r = await request(app).put(`/api/stores/${storeId}/asaas`).set('Authorization', bearer(owner)).send({ apiKey: KEY, acceptTerms: true });
    expect(r.status).toBe(200);
    const a = await audits();
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ action: 'connect', actorId: owner.userId, apiKeyLast4: '3456' });
  });
});
