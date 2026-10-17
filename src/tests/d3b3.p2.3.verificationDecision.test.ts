/**
 * D3b-3 · P2.3 — decisão de verificação condicional por item (spec 4.4).
 * Dois itens da mesma pessoa (documento + facial, facial + motoboy) ou da mesma loja
 * (CNPJ + endereço) decididos ao mesmo tempo mantêm as duas decisões. Item não pendente →
 * 409 VERIFICATION_NOT_PENDING com currentStatus. Duas decisões do mesmo item → um 200, um 409.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import userRepository from '../repositories/user.repository';
import * as storeNotify from '../services/storeNotify';

const DOMAIN = '@d3b3p23.test';
let ceo: TestUser;
let ceo2: TestUser;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  ceo2 = await createTestUser('ceo', DOMAIN);
  jest.spyOn(storeNotify, 'notifyStore').mockResolvedValue(undefined as any);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupUsersByEmailDomain(DOMAIN);
});

const BASE = { email: { status: 'verified' }, phone: { status: 'verified', e164: '+5511988887777' } };

async function pessoa(role: string, verification: Record<string, unknown>) {
  const u = await createTestUser(role, DOMAIN, { verified: false });
  await prisma.user.update({ where: { id: u.userId }, data: { verification: { ...BASE, ...verification } as any } });
  return u;
}
const verificationOf = async (userId: string) =>
  ((await prisma.user.findUnique({ where: { id: userId } }))!.verification as any);

/**
 * Barreira: as duas decisões leem o usuário pelo repositório antes de qualquer uma gravar
 * (reproduz a corrida do ler-alterar-gravar). Depois da mudança a decisão não lê mais por
 * aqui; a barreira cai sozinha em 3 s se ninguém chegar.
 */
function barreiraNoFindById() {
  const original = userRepository.findById.bind(userRepository);
  let arrived = 0;
  let open!: () => void;
  const barrier = new Promise<void>((r) => { open = r; });
  jest.spyOn(userRepository, 'findById').mockImplementation(async (id: string) => {
    const row = await original(id);
    if (++arrived === 2) open();
    if (arrived <= 2) await Promise.race([barrier, new Promise((r) => setTimeout(r, 3000))]);
    return row;
  });
}

describe('dois itens da mesma pessoa ao mesmo tempo', () => {
  it('aprovar documento e facial em paralelo mantém os dois aprovados', async () => {
    const alvo = await pessoa('lojista', {
      document: { type: 'cpf', status: 'pending', frontUrl: 'f', backUrl: 'b' },
      facial: { status: 'pending', selfieUrl: 'https://img/selfie.jpg' },
    });
    barreiraNoFindById();
    const [a, b] = await Promise.all([
      request(app).post(`/api/verification/admin/${alvo.userId}/approve`).set('Authorization', bearer(ceo)),
      request(app).post(`/api/verification/admin/facial/${alvo.userId}/approve`).set('Authorization', bearer(ceo2)),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const v = await verificationOf(alvo.userId);
    expect(v.document).toMatchObject({ status: 'approved', reviewedBy: ceo.userId, frontUrl: 'f' });
    expect(v.facial).toMatchObject({ status: 'approved', reviewedBy: ceo2.userId });
    expect(v.email.status).toBe('verified');
    // facial aprovada de lojista vira o avatar (comportamento mantido)
    expect((await prisma.user.findUnique({ where: { id: alvo.userId } }))!.photo).toBe('https://img/selfie.jpg');
  });

  it('recusar facial e aprovar motoboy em paralelo mantém as duas decisões', async () => {
    const alvo = await pessoa('motoboy', {
      document: { type: 'rg', status: 'approved' },
      facial: { status: 'pending', selfieUrl: 'https://img/s2.jpg' },
      courier: { status: 'pending', cnhNumber: '00000000000', plate: 'ABC1D23' },
    });
    barreiraNoFindById();
    const [a, b] = await Promise.all([
      request(app).post(`/api/verification/admin/facial/${alvo.userId}/reject`).set('Authorization', bearer(ceo)).send({ reason: 'Rosto cortado' }),
      request(app).post(`/api/verification/admin/motoboy/${alvo.userId}/approve`).set('Authorization', bearer(ceo2)),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const v = await verificationOf(alvo.userId);
    expect(v.facial).toMatchObject({ status: 'rejected', rejectionReason: 'Rosto cortado' });
    expect(v.courier).toMatchObject({ status: 'approved', reviewedBy: ceo2.userId, plate: 'ABC1D23' });
  });
});

describe('mesmo item duas vezes', () => {
  it('duas aprovações simultâneas do documento → um 200 e um 409 VERIFICATION_NOT_PENDING', async () => {
    const alvo = await pessoa('cliente', { document: { type: 'cpf', status: 'pending' } });
    const url = `/api/verification/admin/${alvo.userId}/approve`;
    const [a, b] = await Promise.all([
      request(app).post(url).set('Authorization', bearer(ceo)),
      request(app).post(url).set('Authorization', bearer(ceo2)),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const perdedor = a.status === 409 ? a : b;
    expect(perdedor.body).toMatchObject({ code: 'VERIFICATION_NOT_PENDING', currentStatus: 'approved', error: 'Documento não está pendente' });
  });

  it.each([
    ['documento', (id: string) => `/api/verification/admin/${id}/reject`, { document: { status: 'approved' } }, 'approved'],
    ['facial', (id: string) => `/api/verification/admin/facial/${id}/approve`, { facial: { status: 'rejected' } }, 'rejected'],
    ['motoboy', (id: string) => `/api/verification/admin/motoboy/${id}/approve`, {}, 'none'],
  ])('%s não pendente → 409 com currentStatus (antes 400)', async (_n, url, verification, currentStatus) => {
    const alvo = await pessoa('motoboy', verification as any);
    const r = await request(app).post(url(alvo.userId)).set('Authorization', bearer(ceo)).send({ reason: 'x' });
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'VERIFICATION_NOT_PENDING', currentStatus });
  });

  it('recusar documento grava motivo, quem e quando', async () => {
    const alvo = await pessoa('cliente', { document: { type: 'cpf', status: 'pending', rejectionReason: 'antigo' } });
    const r = await request(app).post(`/api/verification/admin/${alvo.userId}/reject`).set('Authorization', bearer(ceo)).send({ reason: 'Foto ilegível' });
    expect(r.status).toBe(200);
    const v = await verificationOf(alvo.userId);
    expect(v.document).toMatchObject({ status: 'rejected', reviewedBy: ceo.userId, rejectionReason: 'Foto ilegível' });
    expect(typeof v.document.reviewedAt).toBe('string');
  });

  it('usuário inexistente → 404 como antes', async () => {
    const r = await request(app).post('/api/verification/admin/nao-existe/approve').set('Authorization', bearer(ceo));
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('Usuário não encontrado');
  });
});

describe('loja: CNPJ e endereço', () => {
  async function loja() {
    const dono = await pessoa('lojista', { document: { status: 'approved' }, facial: { status: 'approved' } });
    return prisma.store.create({
      data: {
        ownerId: dono.userId, name: 'Loja P23', isOpen: true, isVerified: false,
        verification: { cnpj: { status: 'pending', number: '11444777000161' }, address: { status: 'pending', comprovanteUrl: 'x' } },
      } as any,
    });
  }

  it('aprovar CNPJ e endereço em paralelo mantém os dois e verifica a loja', async () => {
    const store = await loja();
    const [a, b] = await Promise.all([
      request(app).post(`/api/verification/admin/store/${store.id}/cnpj/approve`).set('Authorization', bearer(ceo)),
      request(app).post(`/api/verification/admin/store/${store.id}/address/approve`).set('Authorization', bearer(ceo2)),
    ]);
    expect([a.status, b.status]).toEqual([200, 200]);
    const s = await prisma.store.findUnique({ where: { id: store.id } });
    expect((s!.verification as any).cnpj).toMatchObject({ status: 'approved', number: '11444777000161' });
    expect((s!.verification as any).address).toMatchObject({ status: 'approved', comprovanteUrl: 'x' });
    expect(s!.isVerified).toBe(true);
  });

  it('CNPJ já decidido → 409 VERIFICATION_NOT_PENDING; loja inexistente → 404', async () => {
    const store = await loja();
    expect((await request(app).post(`/api/verification/admin/store/${store.id}/cnpj/reject`).set('Authorization', bearer(ceo)).send({ reason: 'Baixado' })).status).toBe(200);
    const r = await request(app).post(`/api/verification/admin/store/${store.id}/cnpj/approve`).set('Authorization', bearer(ceo2));
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'VERIFICATION_NOT_PENDING', currentStatus: 'rejected', error: 'cnpj não está pendente' });
    const nf = await request(app).post('/api/verification/admin/store/nao-existe/address/approve').set('Authorization', bearer(ceo));
    expect(nf.status).toBe(404);
  });
});
