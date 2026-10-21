/**
 * D3b-2b · P1.4 — espera da verificação (spec 8): GET /verification/admin/stats devolve a média de
 * horas entre o envio (submittedAt) e a decisão (createdAt da linha verification_decision) nos
 * últimos 30 dias, por item, e quantos itens foram decididos. Itens sem submittedAt ficam fora da
 * média. O CNPJ passa a gravar submittedAt no envio (ruling 5), e as listas de pendentes levam o
 * submittedAt de cada item.
 *
 * As linhas da média usam um "agora" em 2099: o banco de teste é compartilhado e as decisões reais
 * das outras suítes (2026) ficam fora da janela.
 */
import request from 'supertest';
import { Prisma } from '@prisma/client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import * as cnpjLookup from '../services/cnpjLookup';
import { getVerificationStats } from '../services/verification/stats';

const DOMAIN = '@d3b2bp14.test';
const SUB = '2026-10-20T09:00:00.000Z';
const BASE = { email: { status: 'verified' }, phone: { status: 'verified', e164: '+5511988887777' } };
const NOW = new Date('2099-01-31T12:00:00.000Z');
const H = 3_600_000;
const D = 24 * H;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
let ceo: TestUser;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function pessoa(role: string, verification: Record<string, unknown>): Promise<string> {
  const u = await createTestUser(role, DOMAIN, { verified: false });
  await prisma.user.update({ where: { id: u.userId }, data: { verification: { ...BASE, ...verification } as any } });
  return u.userId;
}

async function linha(userId: string, createdAt: Date, submitted: Array<string | null>, type: 'verification_decision' | 'note' = 'verification_decision', meta?: unknown) {
  await prisma.adminAccountAction.create({
    data: {
      actorId: ceo.userId, actorRole: 'ceo', userId, type, createdAt,
      // meta null no Json? do Prisma exige Prisma.DbNull.
      meta: meta === null
        ? Prisma.DbNull
        : ((meta ?? { decision: 'approve', subject: { kind: 'user', id: userId }, items: submitted.map((s) => ({ kind: 'document', userId, submittedAt: s })) }) as any),
    },
  });
}

describe('getVerificationStats', () => {
  it('média por item nos últimos 30 dias, arredondada a 1 casa', async () => {
    const alvo = await pessoa('cliente', {});
    // A: decidida há 1 h; um item esperou 10 h, um sem submittedAt, um com data inválida.
    await linha(alvo, ago(1 * H), [ago(11 * H).toISOString(), null, 'lixo']);
    // B: decidida há 5 dias; esperou 4,25 h.
    await linha(alvo, ago(5 * D), [ago(5 * D + 4.25 * H).toISOString()]);
    // C: fora da janela (31 dias).
    await linha(alvo, ago(31 * D), [ago(31 * D + 100 * H).toISOString()]);
    // D: outro tipo.
    await linha(alvo, ago(2 * H), [ago(500 * H).toISOString()], 'note');
    // E: depois do "agora".
    await linha(alvo, new Date(NOW.getTime() + H), [ago(1 * H).toISOString()]);
    // F: meta nulo não quebra nem conta.
    await linha(alvo, ago(3 * H), [], 'verification_decision', null);
    // G: submittedAt depois da decisão (relógio torto) conta como decisão, fora da média.
    await linha(alvo, ago(6 * H), [ago(2 * H).toISOString()]);

    // (10 + 4,25) / 2 = 7,125 → 7,1. Itens decididos: A(3) + B(1) + G(1) = 5.
    expect(await getVerificationStats(NOW)).toEqual({ avgHoursToDecision: 7.1, decisions30d: 5 });
  });

  it('a janela começa 30 dias antes, sem incluir a borda', async () => {
    const alvo = await pessoa('cliente', {});
    await linha(alvo, ago(30 * D), [ago(30 * D + 2 * H).toISOString()]);
    await linha(alvo, ago(30 * D - 60_000), [ago(30 * D + 6 * H).toISOString()]);
    expect(await getVerificationStats(NOW)).toEqual({ avgHoursToDecision: 6, decisions30d: 1 });
  });

  it('sem decisões na janela → média null e zero', async () => {
    expect(await getVerificationStats(new Date('2098-06-01T00:00:00.000Z'))).toEqual({ avgHoursToDecision: null, decisions30d: 0 });
  });

  it('a decisão real grava o submittedAt que a média usa', async () => {
    const id = await pessoa('cliente', { document: { type: 'cpf', status: 'pending', submittedAt: SUB } });
    await request(app).post(`/api/verification/admin/${id}/approve`).set('Authorization', bearer(ceo)).expect(200);
    const [row] = await prisma.adminAccountAction.findMany({ where: { userId: id, type: 'verification_decision' } });
    const stats = await getVerificationStats(new Date(row.createdAt.getTime() + 1000));
    expect(stats.decisions30d).toBeGreaterThanOrEqual(1);
    expect(stats.avgHoursToDecision).not.toBeNull();
  });
});

describe('GET /api/verification/admin/stats', () => {
  it('CEO e gerente com review_* → 200 com o formato', async () => {
    const gerente = await createTestUser('gerente_motoboys', DOMAIN);
    for (const who of [ceo, gerente]) {
      const r = await request(app).get('/api/verification/admin/stats').set('Authorization', bearer(who));
      expect(r.status).toBe(200);
      expect(Object.keys(r.body).sort()).toEqual(['avgHoursToDecision', 'decisions30d']);
      expect(typeof r.body.decisions30d).toBe('number');
      expect(r.body.avgHoursToDecision === null || typeof r.body.avgHoursToDecision === 'number').toBe(true);
    }
  });

  it('sem view_queue nem review_* → 403 PERMISSION_DENIED', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    const r = await request(app).get('/api/verification/admin/stats').set('Authorization', bearer(cliente));
    expect(r.status).toBe(403);
    expect(r.body.code).toBe('PERMISSION_DENIED');
  });

  it('sem login → 401', async () => {
    expect((await request(app).get('/api/verification/admin/stats')).status).toBe(401);
  });
});

describe('submittedAt nas listas de pendentes', () => {
  it('o envio do CNPJ grava submittedAt, e a fila da loja o devolve', async () => {
    jest.spyOn(cnpjLookup, 'consultarCNPJ').mockResolvedValue({ razaoSocial: 'Loja LTDA', situacao: 'ATIVA' });
    const dono = await createTestUser('lojista', DOMAIN);
    const store = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Loja P14', isOpen: true, cnpj: '11444777000161' } });
    const antes = Date.now();
    const r = await request(app).post(`/api/verification/store/${store.id}/cnpj`).set('Authorization', bearer(dono));
    expect(r.status).toBe(200);

    const cnpj = ((await prisma.store.findUnique({ where: { id: store.id } }))!.verification as any).cnpj;
    expect(cnpj.status).toBe('pending');
    expect(typeof cnpj.submittedAt).toBe('string');
    const t = Date.parse(cnpj.submittedAt);
    expect(t).toBeGreaterThanOrEqual(antes - 1000);
    expect(t).toBeLessThanOrEqual(Date.now() + 1000);

    const fila = await request(app).get('/api/verification/admin/store-pending').set('Authorization', bearer(ceo));
    const s = fila.body.stores.find((x: any) => x.id === store.id);
    expect(s.verification.cnpj.submittedAt).toBe(cnpj.submittedAt);
  });

  it('documento, selfie, CNH e endereço já vêm com submittedAt', async () => {
    const cliente = await pessoa('cliente', { document: { type: 'cpf', status: 'pending', submittedAt: SUB } });
    const moto = await pessoa('motoboy', {
      facial: { status: 'pending', selfieUrl: 'https://img/f.jpg', submittedAt: SUB },
      courier: { status: 'pending', cnhNumber: '12345678900', plate: 'ABC1D23', submittedAt: SUB },
    });
    const donoId = await pessoa('lojista', {});
    const store = await prisma.store.create({
      data: { ownerId: donoId, name: 'Loja P14b', isOpen: true, verification: { address: { status: 'pending', comprovanteUrl: 'x', submittedAt: SUB } } as any },
    });

    const docs = await request(app).get('/api/verification/admin/pending').set('Authorization', bearer(ceo));
    expect(docs.body.items.find((u: any) => u.id === cliente).verification.document.submittedAt).toBe(SUB);

    const motos = await request(app).get('/api/verification/admin/motoboy-pending').set('Authorization', bearer(ceo));
    expect(motos.body.items.find((u: any) => u.id === moto).verification.courier.submittedAt).toBe(SUB);

    const lojas = await request(app).get('/api/verification/admin/store-pending').set('Authorization', bearer(ceo));
    expect(lojas.body.facialPendingOwners.find((u: any) => u.id === moto).verification.facial.submittedAt).toBe(SUB);
    expect(lojas.body.stores.find((x: any) => x.id === store.id).verification.address.submittedAt).toBe(SUB);
  });
});
