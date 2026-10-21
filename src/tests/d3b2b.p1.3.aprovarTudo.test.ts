/**
 * D3b-2b · P1.3 — aprovar tudo de uma pessoa ou loja (spec 8, ruling 4). Numa transação que trava
 * Store e User: confere que os pendentes AGORA (dos itens que este admin decide) são exatamente os `items` que o admin viu; senão 409
 * VERIFICATION_CHANGED {currentPending} e nada é aprovado. Cada item exige a permissão dele (facial
 * = review_stores). Uma linha verification_decision e um aviso só. Os efeitos colaterais (lojas do
 * dono, subconta, verificação da loja, sala motoboys) rodam depois do commit, só para o que foi
 * aprovado de fato.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import * as sideEffects from '../services/verification/sideEffects';
import * as notifier from '../services/notifier';

const DOMAIN = '@d3b2bp13.test';
const SUB = '2026-10-20T09:00:00.000Z';
const BASE = { email: { status: 'verified' }, phone: { status: 'verified', e164: '+5511988887777' } };
let ceo: TestUser;
let ceo2: TestUser;
let spy: {
  owner: jest.SpyInstance;
  store: jest.SpyInstance;
  courier: jest.SpyInstance;
  room: jest.SpyInstance;
};

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  ceo2 = await createTestUser('ceo', DOMAIN);
  spy = {
    owner: jest.spyOn(sideEffects, 'recomputeOwnerStoresSafe').mockResolvedValue(undefined),
    store: jest.spyOn(sideEffects, 'recomputeStoreVerificationSafe').mockResolvedValue(undefined),
    courier: jest.spyOn(sideEffects, 'ensureCourierSubaccountSafe').mockResolvedValue(undefined),
    room: jest.spyOn(notifier, 'syncMotoboysRoom').mockResolvedValue(undefined),
  };
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupUsersByEmailDomain(DOMAIN);
});

const pend = (extra: Record<string, unknown> = {}) => ({ status: 'pending', submittedAt: SUB, ...extra });

async function pessoa(role: string, verification: Record<string, unknown>): Promise<string> {
  const u = await createTestUser(role, DOMAIN, { verified: false });
  await prisma.user.update({ where: { id: u.userId }, data: { verification: { ...BASE, ...verification } as any } });
  return u.userId;
}
async function lojaPendente() {
  const donoId = await pessoa('lojista', {
    document: pend({ type: 'cpf', frontUrl: 'f', backUrl: 'b' }),
    facial: pend({ selfieUrl: 'https://img/dono.jpg' }),
  });
  const store = await prisma.store.create({
    data: {
      ownerId: donoId, name: 'Loja P13', isOpen: true, isVerified: false,
      verification: { cnpj: pend({ number: '11444777000161' }), address: pend({ comprovanteUrl: 'x' }) } as any,
    },
  });
  return { donoId, storeId: store.id };
}
const approveAll = (who: TestUser, kind: string, id: string, items: unknown) =>
  request(app).post(`/api/verification/admin/subject/${kind}/${id}/approve-all`).set('Authorization', bearer(who)).send({ items });
const userV = async (id: string) => (await prisma.user.findUnique({ where: { id } }))!.verification as any;
const storeV = async (id: string) => (await prisma.store.findUnique({ where: { id } }))!.verification as any;
const approveRows = (where: { userId?: string; storeId?: string }) =>
  prisma.adminAccountAction.findMany({ where: { type: 'verification_decision', ...where } })
    .then((rows) => rows.filter((r) => (r.meta as any)?.decision === 'approve'));
const avisos = (userId: string) => prisma.notification.findMany({ where: { userId, title: 'Verificação aprovada' } });

function semEfeitos() {
  expect(spy.owner).not.toHaveBeenCalled();
  expect(spy.store).not.toHaveBeenCalled();
  expect(spy.courier).not.toHaveBeenCalled();
  expect(spy.room).not.toHaveBeenCalled();
}

describe('aprovar tudo', () => {
  it('loja: CNPJ, endereço, selfie e documento do dono numa decisão só', async () => {
    const { donoId, storeId } = await lojaPendente();
    const r = await approveAll(ceo, 'store', storeId, ['document', 'facial', 'address', 'cnpj']);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ approved: ['cnpj', 'address', 'facial', 'document'] });

    const sv = await storeV(storeId);
    const uv = await userV(donoId);
    expect(sv.cnpj).toMatchObject({ status: 'approved', reviewedBy: ceo.userId });
    expect(sv.address).toMatchObject({ status: 'approved', reviewedBy: ceo.userId });
    expect(uv.facial).toMatchObject({ status: 'approved', reviewedBy: ceo.userId });
    expect(uv.document).toMatchObject({ status: 'approved', reviewedBy: ceo.userId });
    // facial aprovada de lojista vira o avatar, como na rota individual
    expect((await prisma.user.findUnique({ where: { id: donoId } }))!.photo).toBe('https://img/dono.jpg');

    const rows = await prisma.adminAccountAction.findMany({ where: { type: 'verification_decision', OR: [{ storeId }, { userId: donoId }] } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ storeId, userId: null, actorId: ceo.userId, actorRole: 'ceo', reason: null });
    expect(rows[0].meta).toEqual({
      decision: 'approve',
      subject: { kind: 'store', id: storeId },
      items: [
        { kind: 'cnpj', storeId, submittedAt: SUB },
        { kind: 'address', storeId, submittedAt: SUB },
        { kind: 'facial', userId: donoId, submittedAt: SUB },
        { kind: 'document', userId: donoId, submittedAt: SUB },
      ],
    });

    const n = await avisos(donoId);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({
      message: 'O DROP aprovou: CNPJ, comprovante de endereço, selfie e documento.',
      link: '/seller/abrir',
      entityId: storeId,
      type: 'system',
    });

    expect(spy.owner).toHaveBeenCalledTimes(1);
    expect(spy.owner).toHaveBeenCalledWith(donoId);
    expect(spy.store).toHaveBeenCalledTimes(1);
    expect(spy.store).toHaveBeenCalledWith(storeId);
    expect(spy.courier).not.toHaveBeenCalled();
    expect(spy.room).toHaveBeenCalledWith(donoId);
  });

  it('motoboy: documento, selfie e CNH; subconta e sala motoboys uma vez', async () => {
    const id = await pessoa('motoboy', {
      document: pend({ type: 'rg' }),
      facial: pend({ selfieUrl: 'https://img/m.jpg' }),
      courier: pend({ cnhNumber: '12345678900', plate: 'ABC1D23' }),
    });
    const r = await approveAll(ceo, 'motoboy', id, ['courier', 'document', 'facial']);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ approved: ['document', 'facial', 'courier'] });
    const v = await userV(id);
    expect([v.document.status, v.facial.status, v.courier.status]).toEqual(['approved', 'approved', 'approved']);

    const rows = await approveRows({ userId: id });
    expect(rows).toHaveLength(1);
    expect((rows[0].meta as any).subject).toEqual({ kind: 'motoboy', id });

    const n = await avisos(id);
    expect(n).toHaveLength(1);
    expect(n[0]).toMatchObject({ message: 'O DROP aprovou: documento, selfie e dados de motoboy.', link: '/motoboy/cadastro', entityId: id });

    expect(spy.courier).toHaveBeenCalledTimes(1);
    expect(spy.courier).toHaveBeenCalledWith(id);
    expect(spy.owner).toHaveBeenCalledTimes(1);
    expect(spy.room).toHaveBeenCalledTimes(1);
    expect(spy.room).toHaveBeenCalledWith(id);
    expect(spy.store).not.toHaveBeenCalled();
  });

  it('cliente só com documento: efeitos só do documento', async () => {
    const id = await pessoa('cliente', { document: pend({ type: 'cpf' }) });
    const r = await approveAll(ceo, 'client', id, ['document']);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ approved: ['document'] });
    const [n] = await avisos(id);
    expect(n).toMatchObject({ message: 'O DROP aprovou: documento.', link: '/verificacao' });
    expect(spy.owner).toHaveBeenCalledTimes(1);
    expect(spy.courier).not.toHaveBeenCalled();
    expect(spy.store).not.toHaveBeenCalled();
  });
});

describe('o item mudou entre a leitura e a aprovação', () => {
  it('outro admin recusou a selfie: 409 VERIFICATION_CHANGED, nada aprovado, nenhum efeito', async () => {
    const id = await pessoa('motoboy', {
      document: pend({ type: 'rg' }),
      facial: { status: 'rejected', rejectionReason: 'Foto ilegível' },
    });
    const r = await approveAll(ceo, 'motoboy', id, ['document', 'facial']);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'VERIFICATION_CHANGED', currentPending: ['document'] });
    expect(typeof r.body.error).toBe('string');
    expect((await userV(id)).document.status).toBe('pending');
    expect(await approveRows({ userId: id })).toHaveLength(0);
    expect(await avisos(id)).toHaveLength(0);
    semEfeitos();
  });

  it('a pessoa reenviou a selfie (voltou a pending): 409 com o conjunto atual', async () => {
    const id = await pessoa('lojista', {
      document: pend({ type: 'cpf' }),
      facial: pend({ selfieUrl: 'https://img/nova.jpg' }),
    });
    const r = await approveAll(ceo, 'client', id, ['document']);
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'VERIFICATION_CHANGED', currentPending: ['document', 'facial'] });
    const v = await userV(id);
    expect([v.document.status, v.facial.status]).toEqual(['pending', 'pending']);
    expect((await prisma.user.findUnique({ where: { id } }))!.photo).not.toBe('https://img/nova.jpg');
    semEfeitos();
  });

  it('loja: o endereço já foi decidido: 409 e o CNPJ continua pendente', async () => {
    const { donoId, storeId } = await lojaPendente();
    await prisma.store.update({
      where: { id: storeId },
      data: { verification: { cnpj: pend({ number: '11444777000161' }), address: { status: 'approved' } } as any },
    });
    const r = await approveAll(ceo, 'store', storeId, ['cnpj', 'address', 'facial', 'document']);
    expect(r.status).toBe(409);
    expect(r.body.currentPending).toEqual(['cnpj', 'facial', 'document']);
    expect((await storeV(storeId)).cnpj.status).toBe('pending');
    expect((await userV(donoId)).facial.status).toBe('pending');
    expect(await approveRows({ storeId })).toHaveLength(0);
    semEfeitos();
  });

  it('corrida real: aprovar tudo e recusar a CNH ao mesmo tempo → um vence, e os efeitos seguem o vencedor', async () => {
    const id = await pessoa('motoboy', {
      document: pend({ type: 'rg' }),
      courier: pend({ cnhNumber: '12345678900', plate: 'ABC1D23' }),
    });
    const [all, rej] = await Promise.all([
      approveAll(ceo, 'motoboy', id, ['document', 'courier']),
      request(app).post(`/api/verification/admin/motoboy/${id}/reject`).set('Authorization', bearer(ceo2)).send({ reasonCode: 'illegible' }),
    ]);
    expect([all.status, rej.status].sort()).toEqual([200, 409]);
    const v = await userV(id);
    if (all.status === 200) {
      expect(rej.body.code).toBe('VERIFICATION_NOT_PENDING');
      expect([v.document.status, v.courier.status]).toEqual(['approved', 'approved']);
      expect(spy.courier).toHaveBeenCalledTimes(1);
      expect(await approveRows({ userId: id })).toHaveLength(1);
    } else {
      expect(all.body).toMatchObject({ code: 'VERIFICATION_CHANGED', currentPending: ['document'] });
      expect([v.document.status, v.courier.status]).toEqual(['pending', 'rejected']);
      expect(spy.courier).not.toHaveBeenCalled();
      expect(await approveRows({ userId: id })).toHaveLength(0);
    }
  });
});

describe('permissões', () => {
  it('facial sem review_stores → 403 PERMISSION_DENIED e nada muda', async () => {
    const gerente = await createTestUser('gerente_clientes', DOMAIN);
    const id = await pessoa('lojista', { document: pend({ type: 'cpf' }), facial: pend({ selfieUrl: 'https://img/x.jpg' }) });
    const r = await approveAll(gerente, 'client', id, ['document', 'facial']);
    expect(r.status).toBe(403);
    expect(r.body).toMatchObject({ code: 'PERMISSION_DENIED', missing: ['verification:review_stores'] });
    const v = await userV(id);
    expect([v.document.status, v.facial.status]).toEqual(['pending', 'pending']);
    expect(await approveRows({ userId: id })).toHaveLength(0);
    semEfeitos();
  });

  it('gerente de lojas (sem review_clients): aprova o que decide; o documento pendente do dono fica para quem decide', async () => {
    const gerente = await createTestUser('gerente_lojistas', DOMAIN);
    const { donoId, storeId } = await lojaPendente();
    const r = await approveAll(gerente, 'store', storeId, ['cnpj', 'address', 'facial']);
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ approved: ['cnpj', 'address', 'facial'] });
    expect((await userV(donoId)).document.status).toBe('pending');
    expect((await userV(donoId)).facial.status).toBe('approved');
    // Mandar o documento sem a permissão dele continua 403 (nada muda).
    const { storeId: outra } = await lojaPendente();
    const r2 = await approveAll(gerente, 'store', outra, ['cnpj', 'address', 'facial', 'document']);
    expect(r2.status).toBe(403);
    expect(r2.body).toMatchObject({ code: 'PERMISSION_DENIED', missing: ['verification:review_clients'] });
  });

  it('com a permissão de todos os itens, o gerente aprova', async () => {
    const gerente = await createTestUser('gerente_clientes', DOMAIN);
    const id = await pessoa('cliente', { document: pend({ type: 'cpf' }) });
    const r = await approveAll(gerente, 'client', id, ['document']);
    expect(r.status).toBe(200);
    const [row] = await approveRows({ userId: id });
    expect(row).toMatchObject({ actorId: gerente.userId, actorRole: 'gerente_clientes' });
  });

  it('sem a permissão do tipo → 403 da rota', async () => {
    const gerente = await createTestUser('gerente_clientes', DOMAIN);
    const id = await pessoa('motoboy', { document: pend({ type: 'rg' }) });
    const r = await approveAll(gerente, 'motoboy', id, ['document']);
    expect(r.status).toBe(403);
    expect((await userV(id)).document.status).toBe('pending');
  });

  it('cliente comum → 403', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    const id = await pessoa('cliente', { document: pend({ type: 'cpf' }) });
    expect((await approveAll(cliente, 'client', id, ['document'])).status).toBe(403);
  });
});

describe('entradas inválidas', () => {
  it.each([
    ['lista vazia', []],
    ['não é lista', 'document'],
    ['repetido', ['document', 'document']],
    ['item que não vale para o tipo', ['cnpj']],
    ['CNH no cliente (é do motoboy)', ['courier']],
    ['item desconhecido', ['selfie']],
  ])('%s → 400 INVALID_ITEMS', async (_n, items) => {
    const id = await pessoa('cliente', { document: pend({ type: 'cpf' }) });
    const r = await approveAll(ceo, 'client', id, items);
    expect(r.status).toBe(400);
    expect(r.body.code).toBe('INVALID_ITEMS');
    expect((await userV(id)).document.status).toBe('pending');
  });

  it('pessoa ou loja inexistente → 404', async () => {
    const a = await approveAll(ceo, 'client', 'nao-existe', ['document']);
    expect(a.status).toBe(404);
    expect(a.body.code).toBe('USER_NOT_FOUND');
    const b = await approveAll(ceo, 'store', 'nao-existe', ['cnpj']);
    expect(b.status).toBe(404);
    expect(b.body.code).toBe('STORE_NOT_FOUND');
  });

  it('tipo desconhecido → 404', async () => {
    const id = await pessoa('cliente', { document: pend({ type: 'cpf' }) });
    expect((await approveAll(ceo, 'pessoa', id, ['document'])).status).toBe(404);
  });
});
