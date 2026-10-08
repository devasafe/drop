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
import logger from '../config/logger';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';
import { errorHandler } from '../middleware/errorHandler';
import { AppError } from '../utils/AppError';

const DOMAIN = '@saas14.test';
const KEY = '$aact_hmlg_abcdef123456';
let owner: any, other: any, cliente: any, storeId: string;

beforeEach(async () => {
  jest.clearAllMocks();
  owner = await createTestUser('lojista', DOMAIN);
  other = await createTestUser('lojista', DOMAIN);
  cliente = await createTestUser('cliente', DOMAIN);
  storeId = (await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja t14', isOpen: true } })).id;
});
afterEach(() => cleanupUsersByEmailDomain(DOMAIN));

const base = () => `/api/stores/${storeId}/asaas`;
const connect = (u = owner) => request(app).put(base()).set('Authorization', bearer(u)).send({ apiKey: KEY, acceptTerms: true });

describe('t1.4 — rotas de conexão da conta Asaas (lojista)', () => {
  it('dono conecta (200) e lê o status', async () => {
    (asaasClient.getAs as jest.Mock).mockResolvedValueOnce({ balance: 0 });
    const put = await connect();
    expect(put.status).toBe(200);
    expect(put.body.data.status).toBe('valid');
    const get = await request(app).get(base()).set('Authorization', bearer(owner));
    expect(get.status).toBe(200);
    expect(get.body.data.status).toBe('valid');
    expect(get.body.data.apiKeyLast4).toBe('3456');
  });

  it('lojista de outra loja e cliente → 403; sem token → 401', async () => {
    for (const u of [other, cliente]) {
      expect((await connect(u)).status).toBe(403);
      expect((await request(app).get(base()).set('Authorization', bearer(u))).status).toBe(403);
      expect((await request(app).post(`${base()}/test`).set('Authorization', bearer(u))).status).toBe(403);
      expect((await request(app).post(`${base()}/checklist`).set('Authorization', bearer(u)).send({ ipWhitelist: true })).status).toBe(403);
      expect((await request(app).post(`${base()}/auth-token`).set('Authorization', bearer(u))).status).toBe(403);
    }
    expect((await request(app).get(base())).status).toBe(401);
    expect(asaasClient.getAs).not.toHaveBeenCalled();
  });

  it('loja inexistente → 403 (fail closed)', async () => {
    const r = await request(app).get('/api/stores/naoexiste/asaas').set('Authorization', bearer(owner));
    expect(r.status).toBe(403);
  });

  it('contrato: PUT e GET nunca devolvem a chave nem apiKeyEncrypted', async () => {
    (asaasClient.getAs as jest.Mock).mockResolvedValueOnce({ balance: 0 });
    const put = await connect();
    const get = await request(app).get(base()).set('Authorization', bearer(owner));
    for (const r of [put, get]) {
      expect(JSON.stringify(r.body)).not.toMatch(/aact_|apiKeyEncrypted|abcdef123456/);
    }
  });

  it('log: PUT não loga a chave (sucesso e falha)', async () => {
    const spies = (['info', 'warn', 'error', 'debug'] as const).map((l) => jest.spyOn(logger as any, l));
    (asaasClient.getAs as jest.Mock).mockResolvedValueOnce({ balance: 0 });
    await connect();
    (asaasClient.getAs as jest.Mock).mockRejectedValueOnce(new AsaasApiError(500, []));
    await connect();
    const bad = await request(app).put(base()).set('Authorization', bearer(owner)).send({ apiKey: '$aact_hmlg_SEGREDOZZ' + 'x'.repeat(300), acceptTerms: true });
    expect(bad.status).toBe(400);
    const logged = JSON.stringify(spies.flatMap((s) => s.mock.calls));
    expect(logged).not.toContain('abcdef123456');
    expect(logged).not.toContain('SEGREDOZZ');
    spies.forEach((s) => s.mockRestore());
  });

  it('PUT sem apiKey → 400; chave recusada → 400 com code', async () => {
    expect((await request(app).put(base()).set('Authorization', bearer(owner)).send({})).status).toBe(400);
    (asaasClient.getAs as jest.Mock).mockRejectedValueOnce(new AsaasApiError(401, []));
    const r = await connect();
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('ASAAS_KEY_INVALID');
  });

  it('checklist grava/limpa as confirmações manuais; exige conta conectada', async () => {
    const sem = await request(app).post(`${base()}/checklist`).set('Authorization', bearer(owner)).send({ ipWhitelist: true });
    expect(sem.status).toBe(409);
    (asaasClient.getAs as jest.Mock).mockResolvedValueOnce({ balance: 0 });
    await connect();
    const on = await request(app).post(`${base()}/checklist`).set('Authorization', bearer(owner)).send({ ipWhitelist: true, authWebhook: true });
    expect(on.status).toBe(200);
    expect(on.body.data.checklist).toMatchObject({ ipWhitelistConfirmed: true, authWebhookConfirmed: true });
    const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId } });
    expect(row!.ipWhitelistConfirmedAt).not.toBeNull();
    const off = await request(app).post(`${base()}/checklist`).set('Authorization', bearer(owner)).send({ ipWhitelist: false });
    expect(off.body.data.checklist).toMatchObject({ ipWhitelistConfirmed: false, authWebhookConfirmed: true });
    expect((await request(app).post(`${base()}/checklist`).set('Authorization', bearer(owner)).send({ ipWhitelist: 'sim' })).status).toBe(400);
  });

  // Revisão final da Fase 1 (I4): o endpoint do webhook de autorização só existe na Fase 2.
  // Antes: gerava o token (200) e 409 sem conta. Agora: 404 FEATURE_NOT_AVAILABLE, nada gravado.
  it('auth-token: 404 FEATURE_NOT_AVAILABLE até a Fase 2; nada é gravado', async () => {
    (asaasClient.getAs as jest.Mock).mockResolvedValueOnce({ balance: 0 });
    await connect();
    const r = await request(app).post(`${base()}/auth-token`).set('Authorization', bearer(owner));
    expect(r.status).toBe(404);
    expect(r.body.error).toMatchObject({ code: 'FEATURE_NOT_AVAILABLE' });
    const row = await prisma.storeAsaasAccount.findUnique({ where: { storeId } });
    expect(row!.authWebhookTokenHash).toBeNull();
  });

  it('auth-token sem conta conectada → também 404 FEATURE_NOT_AVAILABLE', async () => {
    const r = await request(app).post(`${base()}/auth-token`).set('Authorization', bearer(owner));
    expect(r.status).toBe(404);
    expect(r.body.error).toMatchObject({ code: 'FEATURE_NOT_AVAILABLE' });
  });

  it('test: confere /finance/balance e o webhook de pagamentos (se existir)', async () => {
    (asaasClient.getAs as jest.Mock).mockResolvedValueOnce({ balance: 0 });
    await connect();
    await prisma.storeAsaasAccount.update({ where: { storeId }, data: { paymentWebhookId: 'wh_1' } });
    (asaasClient.getAs as jest.Mock)
      .mockResolvedValueOnce({ balance: 10 })
      .mockResolvedValueOnce({ id: 'wh_1', enabled: true, interrupted: false });
    const ok = await request(app).post(`${base()}/test`).set('Authorization', bearer(owner));
    expect(ok.status).toBe(200);
    expect(ok.body.data.checklist).toMatchObject({ apiKey: true, paymentWebhook: true });
    const calls = (asaasClient.getAs as jest.Mock).mock.calls.map((c) => c[1]);
    expect(calls).toEqual(expect.arrayContaining(['/finance/balance', '/webhooks/wh_1']));
    expect(JSON.stringify(ok.body)).not.toMatch(/aact_|apiKeyEncrypted/);

    (asaasClient.getAs as jest.Mock)
      .mockResolvedValueOnce({ balance: 10 })
      .mockResolvedValueOnce({ id: 'wh_1', enabled: true, interrupted: true });
    const down = await request(app).post(`${base()}/test`).set('Authorization', bearer(owner));
    expect(down.body.data.checklist.paymentWebhook).toBe(false);
  });

  it('test: sem paymentWebhookId não consulta webhook e fica false; 401 do Asaas → apiKey false', async () => {
    (asaasClient.getAs as jest.Mock).mockResolvedValueOnce({ balance: 0 });
    await connect();
    (asaasClient.getAs as jest.Mock).mockClear();
    (asaasClient.getAs as jest.Mock).mockResolvedValueOnce({ balance: 10 });
    const r = await request(app).post(`${base()}/test`).set('Authorization', bearer(owner));
    expect(r.body.data.checklist.paymentWebhook).toBe(false);
    expect(asaasClient.getAs).toHaveBeenCalledTimes(1);

    (asaasClient.getAs as jest.Mock).mockRejectedValueOnce(new AsaasApiError(401, []));
    const bad = await request(app).post(`${base()}/test`).set('Authorization', bearer(owner));
    expect(bad.status).toBe(200);
    expect(bad.body.data.checklist.apiKey).toBe(false);
    expect(bad.body.data.status).toBe('invalid');
  });

  it('test: conta invalid é retestada e volta a valid se o Asaas aceitar', async () => {
    (asaasClient.getAs as jest.Mock).mockResolvedValueOnce({ balance: 0 });
    await connect();
    await prisma.storeAsaasAccount.update({ where: { storeId }, data: { status: 'invalid' } });
    (asaasClient.getAs as jest.Mock).mockResolvedValueOnce({ balance: 1 });
    const r = await request(app).post(`${base()}/test`).set('Authorization', bearer(owner));
    expect(r.status).toBe(200);
    expect(r.body.data.status).toBe('valid');
    expect((await prisma.storeAsaasAccount.findUnique({ where: { storeId } }))!.status).toBe('valid');
  });

  it('test: Asaas fora do ar → 503 ASAAS_UNAVAILABLE', async () => {
    (asaasClient.getAs as jest.Mock).mockResolvedValueOnce({ balance: 0 });
    await connect();
    (asaasClient.getAs as jest.Mock).mockRejectedValueOnce(new AsaasApiError(500, []));
    const r = await request(app).post(`${base()}/test`).set('Authorization', bearer(owner));
    expect(r.status).toBe(503);
    expect(r.body.error.code).toBe('ASAAS_UNAVAILABLE');
  });

  it('test sem conta → 409 STORE_ASAAS_NOT_READY', async () => {
    const r = await request(app).post(`${base()}/test`).set('Authorization', bearer(owner));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('STORE_ASAAS_NOT_READY');
  });
});

describe('errorHandler — code só de AppError', () => {
  const run = (err: any) => {
    const res: any = { status: jest.fn().mockReturnThis(), json: jest.fn() };
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    errorHandler(err, { method: 'GET', url: '/x' } as any, res, jest.fn());
    return res.json.mock.calls[0][0];
  };
  afterEach(() => jest.restoreAllMocks());
  it('erro não-AppError com code (Prisma) não expõe code', () => {
    const e: any = new Error('x'); e.code = 'P2002'; e.statusCode = 409;
    expect(run(e).error.code).toBeUndefined();
  });
  it('AppError expõe code', () => {
    expect(run(new AppError('x', 400, true, 'ASAAS_KEY_INVALID')).error.code).toBe('ASAAS_KEY_INVALID');
  });
});
