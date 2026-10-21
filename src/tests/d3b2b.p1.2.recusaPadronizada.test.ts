/**
 * D3b-2b · P1.2 — recusa padronizada (spec 8): {reasonCode, message?, resend?} ou o formato antigo
 * {reason}, nas cinco rotas de recusa. O item recusado guarda reasonCode, rejectionMessage,
 * resendRequested e o texto pronto em rejectionReason. Toda decisão (aprovar e recusar) grava UMA
 * linha verification_decision na mesma transação. CNPJ e endereço avisam com "Reenvie:"/"Recusado:".
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { MoneyActionError } from '../services/adminMoneyAction.service';
import {
  parseRejectBody, rejectionNoticeText, REJECT_REASON_LABEL, REJECT_REASONS,
} from '../services/verification/rejectReasons';

const DOMAIN = '@d3b2bp12.test';
const SUB = '2026-10-20T09:00:00.000Z';
const BASE = { email: { status: 'verified' }, phone: { status: 'verified', e164: '+5511988887777' } };
let ceo: TestUser;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
});
afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

const pend = (extra: Record<string, unknown> = {}) => ({ status: 'pending', submittedAt: SUB, ...extra });

async function pessoa(role: string, verification: Record<string, unknown>): Promise<string> {
  const u = await createTestUser(role, DOMAIN, { verified: false });
  await prisma.user.update({ where: { id: u.userId }, data: { verification: { ...BASE, ...verification } as any } });
  return u.userId;
}
async function loja(verification?: Record<string, unknown>): Promise<{ storeId: string; donoId: string }> {
  const donoId = await pessoa('lojista', { document: { status: 'approved' }, facial: { status: 'approved' } });
  const store = await prisma.store.create({
    data: {
      ownerId: donoId, name: 'Loja P12', isOpen: true, isVerified: false,
      verification: (verification ?? {
        cnpj: pend({ number: '11444777000161' }),
        address: pend({ comprovanteUrl: 'x' }),
      }) as any,
    },
  });
  return { storeId: store.id, donoId };
}
const userItem = (k: string) => async (id: string) =>
  ((await prisma.user.findUnique({ where: { id } }))!.verification as any)[k];
const storeItem = (k: string) => async (id: string) =>
  ((await prisma.store.findUnique({ where: { id } }))!.verification as any)[k];
const decisionRows = (target: 'user' | 'store', id: string) =>
  prisma.adminAccountAction.findMany({
    where: { type: 'verification_decision', ...(target === 'user' ? { userId: id } : { storeId: id }) },
    orderBy: { createdAt: 'asc' },
  });

/** "<status> <code>" do MoneyActionError lançado por `fn`, ou null se não lançou. */
function errorOf(fn: () => unknown): string | null {
  try {
    fn();
    return null;
  } catch (err) {
    return err instanceof MoneyActionError ? `${err.status} ${err.code}` : `outro erro: ${(err as Error).message}`;
  }
}

describe('parseRejectBody', () => {
  it('rótulos e códigos do mestre', () => {
    expect([...REJECT_REASONS]).toEqual(['illegible', 'face_mismatch', 'expired', 'data_mismatch', 'cnpj_invalid', 'address_unproven', 'other']);
    expect(REJECT_REASON_LABEL).toEqual({
      illegible: 'Foto ilegível',
      face_mismatch: 'Selfie não confere com o documento',
      expired: 'Documento vencido',
      data_mismatch: 'Dados não conferem',
      cnpj_invalid: 'CNPJ inválido ou inativo',
      address_unproven: 'Comprovante de endereço não aceito',
      other: 'Outro motivo',
    });
  });

  it('motivo sem mensagem: o texto é o rótulo', () => {
    expect(parseRejectBody({ reasonCode: 'illegible' })).toEqual({ reasonCode: 'illegible', message: null, resend: false, text: 'Foto ilegível' });
  });

  it('motivo com mensagem e reenvio: "Rótulo: mensagem", com trim', () => {
    expect(parseRejectBody({ reasonCode: 'expired', message: '  venceu em 2020 ', resend: true })).toEqual({
      reasonCode: 'expired', message: 'venceu em 2020', resend: true, text: 'Documento vencido: venceu em 2020',
    });
  });

  it('other: o texto é só a mensagem', () => {
    expect(parseRejectBody({ reasonCode: 'other', message: 'Mande a frente inteira' })).toEqual({
      reasonCode: 'other', message: 'Mande a frente inteira', resend: false, text: 'Mande a frente inteira',
    });
  });

  it('formato antigo {reason} vira other com a mensagem', () => {
    expect(parseRejectBody({ reason: 'Rosto cortado' })).toEqual({
      reasonCode: 'other', message: 'Rosto cortado', resend: false, text: 'Rosto cortado',
    });
  });

  it('mensagem em branco no motivo comum vira null', () => {
    expect(parseRejectBody({ reasonCode: 'data_mismatch', message: '   ' })).toMatchObject({ message: null, text: 'Dados não conferem' });
  });

  it('resend só vale com true booleano', () => {
    expect(parseRejectBody({ reasonCode: 'illegible', resend: 'true' }).resend).toBe(false);
    expect(parseRejectBody({ reasonCode: 'illegible', resend: 1 }).resend).toBe(false);
  });

  it.each([
    ['other sem mensagem', { reasonCode: 'other' }],
    ['other com mensagem em branco', { reasonCode: 'other', message: '   ' }],
    ['corpo vazio', {}],
    ['sem corpo', undefined],
    ['reason vazio', { reason: '  ' }],
  ])('%s → 400 REJECT_MESSAGE_REQUIRED', (_n, body) => {
    expect(errorOf(() => parseRejectBody(body))).toBe('400 REJECT_MESSAGE_REQUIRED');
  });

  it('código desconhecido → 400 INVALID_REJECT_REASON', () => {
    expect(errorOf(() => parseRejectBody({ reasonCode: 'blurry', message: 'x' }))).toBe('400 INVALID_REJECT_REASON');
    expect(errorOf(() => parseRejectBody({ reasonCode: 7 }))).toBe('400 INVALID_REJECT_REASON');
  });

  it('mensagem até 300; acima → 400 REJECT_MESSAGE_TOO_LONG (também no formato antigo)', () => {
    expect(parseRejectBody({ reasonCode: 'other', message: 'a'.repeat(300) }).message).toHaveLength(300);
    expect(errorOf(() => parseRejectBody({ reasonCode: 'illegible', message: 'a'.repeat(301) }))).toBe('400 REJECT_MESSAGE_TOO_LONG');
    expect(errorOf(() => parseRejectBody({ reason: 'a'.repeat(301) }))).toBe('400 REJECT_MESSAGE_TOO_LONG');
  });

  it('texto do aviso: "Reenvie:" ou "Recusado:"', () => {
    expect(rejectionNoticeText({ resend: true, text: 'Foto ilegível' })).toBe('Reenvie: Foto ilegível');
    expect(rejectionNoticeText({ resend: false, text: 'Foto ilegível' })).toBe('Recusado: Foto ilegível');
  });
});

interface Caso {
  kind: 'document' | 'facial' | 'courier' | 'cnpj' | 'address';
  target: 'user' | 'store';
  make: () => Promise<string>;
  url: (id: string, acao: 'approve' | 'reject') => string;
  item: (id: string) => Promise<any>;
}
const CASOS: Caso[] = [
  {
    kind: 'document', target: 'user',
    make: () => pessoa('cliente', { document: pend({ type: 'cpf', frontUrl: 'f', backUrl: 'b' }) }),
    url: (id, a) => `/api/verification/admin/${id}/${a}`, item: userItem('document'),
  },
  {
    kind: 'facial', target: 'user',
    make: () => pessoa('lojista', { facial: pend({ selfieUrl: 'https://img/s.jpg' }) }),
    url: (id, a) => `/api/verification/admin/facial/${id}/${a}`, item: userItem('facial'),
  },
  {
    kind: 'courier', target: 'user',
    make: () => pessoa('motoboy', { courier: pend({ cnhNumber: '12345678900', plate: 'ABC1D23' }) }),
    url: (id, a) => `/api/verification/admin/motoboy/${id}/${a}`, item: userItem('courier'),
  },
  {
    kind: 'cnpj', target: 'store',
    make: async () => (await loja()).storeId,
    url: (id, a) => `/api/verification/admin/store/${id}/cnpj/${a}`, item: storeItem('cnpj'),
  },
  {
    kind: 'address', target: 'store',
    make: async () => (await loja()).storeId,
    url: (id, a) => `/api/verification/admin/store/${id}/address/${a}`, item: storeItem('address'),
  },
];
const targetKey = (c: Caso) => (c.target === 'user' ? 'userId' : 'storeId');

describe('recusa padronizada nas cinco rotas', () => {
  it.each(CASOS.map((c) => [c.kind, c] as const))('%s: grava motivo, reenvio e a decisão', async (_k, c) => {
    const id = await c.make();
    const r = await request(app).post(c.url(id, 'reject')).set('Authorization', bearer(ceo))
      .send({ reasonCode: 'illegible', message: 'Frente cortada', resend: true });
    expect(r.status).toBe(200);

    expect(await c.item(id)).toMatchObject({
      status: 'rejected',
      reviewedBy: ceo.userId,
      reasonCode: 'illegible',
      rejectionMessage: 'Frente cortada',
      resendRequested: true,
      rejectionReason: 'Foto ilegível: Frente cortada',
      submittedAt: SUB,
    });

    const rows = await decisionRows(c.target, id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: ceo.userId, actorRole: 'ceo', reason: 'Foto ilegível: Frente cortada' });
    expect(rows[0].meta).toEqual({
      decision: 'reject',
      subject: { kind: c.target, id },
      items: [{ kind: c.kind, [targetKey(c)]: id, submittedAt: SUB, reasonCode: 'illegible', resend: true }],
    });
  });

  it.each(CASOS.map((c) => [c.kind, c] as const))('%s: aprovar também grava a decisão, sem motivo', async (_k, c) => {
    const id = await c.make();
    const r = await request(app).post(c.url(id, 'approve')).set('Authorization', bearer(ceo));
    expect(r.status).toBe(200);
    const rows = await decisionRows(c.target, id);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ actorId: ceo.userId, reason: null });
    expect(rows[0].meta).toEqual({
      decision: 'approve',
      subject: { kind: c.target, id },
      items: [{ kind: c.kind, [targetKey(c)]: id, submittedAt: SUB }],
    });
  });

  it.each(CASOS.map((c) => [c.kind, c] as const))('%s: corpo inválido → 400, item pendente e nenhuma decisão', async (_k, c) => {
    const id = await c.make();
    const r = await request(app).post(c.url(id, 'reject')).set('Authorization', bearer(ceo)).send({ reasonCode: 'other' });
    expect(r.status).toBe(400);
    expect(r.body).toMatchObject({ code: 'REJECT_MESSAGE_REQUIRED' });
    expect(typeof r.body.error).toBe('string');
    expect((await c.item(id)).status).toBe('pending');
    expect(await decisionRows(c.target, id)).toHaveLength(0);
  });

  it('formato antigo {reason} continua funcionando', async () => {
    const id = await pessoa('lojista', { facial: pend({ selfieUrl: 'https://img/s.jpg' }) });
    const r = await request(app).post(`/api/verification/admin/facial/${id}/reject`).set('Authorization', bearer(ceo)).send({ reason: 'Rosto cortado' });
    expect(r.status).toBe(200);
    expect(await userItem('facial')(id)).toMatchObject({
      status: 'rejected', reasonCode: 'other', rejectionMessage: 'Rosto cortado', resendRequested: false, rejectionReason: 'Rosto cortado',
    });
  });

  it('aprovar tira os campos de uma recusa antiga', async () => {
    const id = await pessoa('cliente', {
      document: pend({ type: 'cpf', reasonCode: 'expired', rejectionMessage: 'x', resendRequested: true, rejectionReason: 'antigo' }),
    });
    await request(app).post(`/api/verification/admin/${id}/approve`).set('Authorization', bearer(ceo)).expect(200);
    const doc = await userItem('document')(id);
    expect(doc.status).toBe('approved');
    for (const f of ['reasonCode', 'rejectionMessage', 'resendRequested', 'rejectionReason']) expect(doc).not.toHaveProperty(f);
  });

  it('item não pendente → 409 e nenhuma decisão gravada', async () => {
    const id = await pessoa('cliente', { document: { type: 'cpf', status: 'approved' } });
    const r = await request(app).post(`/api/verification/admin/${id}/reject`).set('Authorization', bearer(ceo)).send({ reasonCode: 'illegible' });
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('VERIFICATION_NOT_PENDING');
    expect(await decisionRows('user', id)).toHaveLength(0);
  });

  it('item sem submittedAt grava submittedAt null', async () => {
    const { storeId } = await loja({ cnpj: { status: 'pending', number: '11444777000161' } });
    await request(app).post(`/api/verification/admin/store/${storeId}/cnpj/approve`).set('Authorization', bearer(ceo)).expect(200);
    const [row] = await decisionRows('store', storeId);
    expect((row.meta as any).items[0]).toEqual({ kind: 'cnpj', storeId, submittedAt: null });
  });

  it('o papel do autor vem do papel de equipe', async () => {
    const gerente = await createTestUser('gerente_lojistas', DOMAIN);
    const { storeId } = await loja();
    await request(app).post(`/api/verification/admin/store/${storeId}/address/reject`).set('Authorization', bearer(gerente))
      .send({ reasonCode: 'address_unproven' }).expect(200);
    const [row] = await decisionRows('store', storeId);
    expect(row).toMatchObject({ actorId: gerente.userId, actorRole: 'gerente_lojistas', reason: 'Comprovante de endereço não aceito' });
  });
});

describe('aviso de CNPJ e endereço', () => {
  const avisos = (donoId: string) => prisma.notification.findMany({ where: { userId: donoId }, orderBy: { createdAt: 'asc' } });

  it('CNPJ com reenvio → "Reenvie o CNPJ" e "Reenvie: …"', async () => {
    const { storeId, donoId } = await loja();
    await request(app).post(`/api/verification/admin/store/${storeId}/cnpj/reject`).set('Authorization', bearer(ceo))
      .send({ reasonCode: 'cnpj_invalid', message: 'Situação baixada', resend: true }).expect(200);
    const [n] = await avisos(donoId);
    expect(n).toMatchObject({
      title: 'Reenvie o CNPJ',
      message: 'Reenvie: CNPJ inválido ou inativo: Situação baixada',
      link: '/seller/abrir',
      entityId: storeId,
    });
  });

  it('endereço sem reenvio → "Endereço recusado" e "Recusado: …"', async () => {
    const { storeId, donoId } = await loja();
    await request(app).post(`/api/verification/admin/store/${storeId}/address/reject`).set('Authorization', bearer(ceo))
      .send({ reasonCode: 'address_unproven' }).expect(200);
    const [n] = await avisos(donoId);
    expect(n).toMatchObject({ title: 'Endereço recusado', message: 'Recusado: Comprovante de endereço não aceito' });
  });

  it('endereço com reenvio → "Reenvie o comprovante de endereço"', async () => {
    const { storeId, donoId } = await loja();
    await request(app).post(`/api/verification/admin/store/${storeId}/address/reject`).set('Authorization', bearer(ceo))
      .send({ reasonCode: 'illegible', resend: true }).expect(200);
    const [n] = await avisos(donoId);
    expect(n).toMatchObject({ title: 'Reenvie o comprovante de endereço', message: 'Reenvie: Foto ilegível' });
  });

  it('corpo inválido não avisa', async () => {
    const { storeId, donoId } = await loja();
    await request(app).post(`/api/verification/admin/store/${storeId}/cnpj/reject`).set('Authorization', bearer(ceo))
      .send({ reasonCode: 'nao-existe' }).expect(400);
    expect(await avisos(donoId)).toHaveLength(0);
  });
});
