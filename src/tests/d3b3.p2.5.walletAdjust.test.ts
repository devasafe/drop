/**
 * D3b-3 · P2.5 — Ajustar saldo (spec 5).
 * Crédito/débito auditado, só CEO, motivo 10–500, valor > 0 e ≤ 50.000 com 2 casas, chave uuid.
 * A mesma chave (em sequência ou em paralelo, na mesma carteira ou não) muda o saldo uma vez só.
 * Débito acima do saldo → 409 INSUFFICIENT_BALANCE. Rotas antigas → 404.
 */
import crypto from 'crypto';
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import * as moneyActions from '../services/adminMoneyAction.service';

const DOMAIN = '@d3b3p25.test';
const MOTIVO = 'Compensação por pedido extraviado #123';
let ceo: TestUser;
let alvo: TestUser;

beforeEach(async () => {
  ceo = await createTestUser('ceo', DOMAIN);
  alvo = await createTestUser('cliente', DOMAIN);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupUsersByEmailDomain(DOMAIN);
});

const carteira = (owner: string, balance = 0) =>
  prisma.wallet.create({ data: { owner, ownerType: 'user', balance, totalIncome: balance } });
const ajustar = (who: TestUser, walletId: string, body: Record<string, unknown>) =>
  request(app).post(`/api/admin/wallets/${walletId}/adjust`).set('Authorization', bearer(who)).send(body);
const corpo = (extra: Record<string, unknown> = {}) => ({
  direction: 'credit', amount: 25, reason: MOTIVO, idempotencyKey: crypto.randomUUID(), ...extra,
});
const saldo = async (walletId: string) => Number((await prisma.wallet.findUnique({ where: { id: walletId } }))!.balance);

describe('crédito e débito', () => {
  it('crédito → 200, saldo, lançamento "Ajuste da plataforma" e uma linha wallet_adjust', async () => {
    const w = await carteira(alvo.userId, 10);
    const body = corpo();
    const r = await ajustar(ceo, w.id, body);
    expect(r.status).toBe(200);
    expect(r.body).toMatchObject({
      message: 'Saldo ajustado',
      replayed: false,
      adjustment: { walletId: w.id, direction: 'credit', amount: 25, reason: MOTIVO, balanceBefore: 10, balanceAfter: 35 },
    });
    expect(await saldo(w.id)).toBe(35);

    const entry = await prisma.walletEntry.findUnique({ where: { id: r.body.adjustment.walletEntryId } });
    expect(entry).toMatchObject({ walletId: w.id, type: 'credit', category: 'adjustment', reason: `Ajuste da plataforma: ${MOTIVO}` });
    expect(entry!.reference).toBe(`ADMIN_ADJUST:${ceo.userId}:${body.idempotencyKey}`);
    expect(Number(entry!.amount)).toBe(25);

    const l = await prisma.adminMoneyAction.findMany({ where: { type: 'wallet_adjust', targetId: w.id } });
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({
      id: r.body.adjustment.actionId, actorId: ceo.userId, targetType: 'wallet', reason: MOTIVO,
      idempotencyKey: body.idempotencyKey,
      before: { balance: 10 }, after: { balance: 35, direction: 'credit', walletEntryId: entry!.id },
    });
  });

  it('débito → 200 e lançamento de débito', async () => {
    const w = await carteira(alvo.userId, 40);
    const r = await ajustar(ceo, w.id, corpo({ direction: 'debit', amount: 15.5 }));
    expect(r.status).toBe(200);
    expect(r.body.adjustment).toMatchObject({ direction: 'debit', amount: 15.5, balanceBefore: 40, balanceAfter: 24.5 });
    const entry = await prisma.walletEntry.findUnique({ where: { id: r.body.adjustment.walletEntryId } });
    expect(entry).toMatchObject({ type: 'debit', category: 'adjustment' });
  });

  it('débito acima do saldo → 409 INSUFFICIENT_BALANCE com available; nada muda', async () => {
    const w = await carteira(alvo.userId, 20);
    const r = await ajustar(ceo, w.id, corpo({ direction: 'debit', amount: 20.01 }));
    expect(r.status).toBe(409);
    expect(r.body).toEqual({ error: 'Saldo insuficiente para este débito', code: 'INSUFFICIENT_BALANCE', available: 20 });
    expect(await saldo(w.id)).toBe(20);
    expect(await prisma.walletEntry.count({ where: { walletId: w.id } })).toBe(0);
    expect(await prisma.adminMoneyAction.count({ where: { targetId: w.id } })).toBe(0);
  });

  it('dois débitos simultâneos (chaves diferentes) que somados passam do saldo → um 200, um 409 INSUFFICIENT_BALANCE', async () => {
    const w = await carteira(alvo.userId, 30);
    const [a, b] = await Promise.all([
      ajustar(ceo, w.id, corpo({ direction: 'debit', amount: 20 })),
      ajustar(ceo, w.id, corpo({ direction: 'debit', amount: 20 })),
    ]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const conflito = a.status === 409 ? a : b;
    expect(conflito.body).toEqual({ error: 'Saldo insuficiente para este débito', code: 'INSUFFICIENT_BALANCE', available: 10 });
    expect(await saldo(w.id)).toBe(10);
    expect(await prisma.walletEntry.count({ where: { walletId: w.id } })).toBe(1);
    expect(await prisma.adminMoneyAction.count({ where: { targetId: w.id } })).toBe(1);
  });

  it('carteira inexistente → 404', async () => {
    const r = await ajustar(ceo, 'nao-existe', corpo());
    expect(r.status).toBe(404);
    expect(r.body.error).toBe('Carteira não encontrada');
  });

  it('falha ao gravar a linha desfaz o crédito (mesma transação)', async () => {
    const w = await carteira(alvo.userId, 0);
    jest.spyOn(moneyActions, 'recordAdminMoneyAction').mockRejectedValueOnce(new Error('falha ao gravar a linha'));
    expect((await ajustar(ceo, w.id, corpo())).status).toBe(500);
    expect(await saldo(w.id)).toBe(0);
    expect(await prisma.walletEntry.count({ where: { walletId: w.id } })).toBe(0);
  });
});

describe('idempotência', () => {
  it('mesma chave duas vezes em sequência → saldo muda uma vez; a segunda devolve o mesmo resultado', async () => {
    const w = await carteira(alvo.userId, 0);
    const body = corpo();
    const a = await ajustar(ceo, w.id, body);
    const b = await ajustar(ceo, w.id, body);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(b.body).toMatchObject({ message: 'Ajuste já registrado', replayed: true });
    expect(b.body.adjustment).toEqual(a.body.adjustment);
    expect(await saldo(w.id)).toBe(25);
    expect(await prisma.walletEntry.count({ where: { walletId: w.id } })).toBe(1);
  });

  it('mesma chave em paralelo na mesma carteira → saldo muda uma vez, um replayed', async () => {
    const w = await carteira(alvo.userId, 0);
    const body = corpo();
    const [a, b] = await Promise.all([ajustar(ceo, w.id, body), ajustar(ceo, w.id, body)]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect([a.body.replayed, b.body.replayed].sort()).toEqual([false, true]);
    expect(a.body.adjustment.actionId).toBe(b.body.adjustment.actionId);
    expect(await saldo(w.id)).toBe(25);
    expect(await prisma.adminMoneyAction.count({ where: { idempotencyKey: body.idempotencyKey } })).toBe(1);
  });

  it('mesma chave em paralelo em carteiras diferentes → a unique decide: um 200, um 409 IDEMPOTENCY_KEY_REUSED', async () => {
    const w1 = await carteira(alvo.userId, 0);
    const outro = await createTestUser('cliente', DOMAIN);
    const w2 = await carteira(outro.userId, 0);
    const body = corpo();
    const [a, b] = await Promise.all([ajustar(ceo, w1.id, body), ajustar(ceo, w2.id, body)]);
    expect([a.status, b.status].sort()).toEqual([200, 409]);
    const [ok, conflito] = a.status === 200 ? [a, b] : [b, a];
    expect(ok.body.replayed).toBe(false);
    expect(conflito.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', actionId: ok.body.adjustment.actionId });
    expect((await saldo(w1.id)) + (await saldo(w2.id))).toBe(25);
    expect(await prisma.walletEntry.count({ where: { walletId: { in: [w1.id, w2.id] } } })).toBe(1);
  });

  it('mesma chave em outra carteira, em sequência → 409 IDEMPOTENCY_KEY_REUSED; a segunda carteira fica intacta', async () => {
    const w1 = await carteira(alvo.userId, 0);
    const outro = await createTestUser('cliente', DOMAIN);
    const w2 = await carteira(outro.userId, 7);
    const body = corpo();
    const a = await ajustar(ceo, w1.id, body);
    expect(a.status).toBe(200);
    const b = await ajustar(ceo, w2.id, body);
    expect(b.status).toBe(409);
    expect(b.body).toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', actionId: a.body.adjustment.actionId });
    expect(await saldo(w1.id)).toBe(25);
    expect(await saldo(w2.id)).toBe(7);
    expect(await prisma.walletEntry.count({ where: { walletId: w2.id } })).toBe(0);
  });

  it('mesma chave numa carteira inexistente → 409 (não "já registrado")', async () => {
    const w = await carteira(alvo.userId, 0);
    const body = corpo();
    expect((await ajustar(ceo, w.id, body)).status).toBe(200);
    const r = await ajustar(ceo, 'nao-existe', body);
    expect(r.status).toBe(409);
    expect(r.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('linha gravada sem direção não vira crédito no replay → 500, nada muda', async () => {
    const w = await carteira(alvo.userId, 3);
    const key = crypto.randomUUID();
    await prisma.adminMoneyAction.create({
      data: {
        actorId: ceo.userId, actorRole: 'ceo', type: 'wallet_adjust', targetType: 'wallet', targetId: w.id,
        amount: 25, reason: MOTIVO, before: { balance: 3 }, after: { balance: 28 }, idempotencyKey: key,
      },
    });
    const r = await ajustar(ceo, w.id, corpo({ idempotencyKey: key }));
    expect(r.status).toBe(500);
    expect(await saldo(w.id)).toBe(3);
    expect(await prisma.walletEntry.count({ where: { walletId: w.id } })).toBe(0);
  });
});

describe('mesma chave com valores diferentes (E9 / ruling da Task 10)', () => {
  it.each([
    ['direção', { direction: 'debit' }],
    ['valor', { amount: 26 }],
    ['motivo', { reason: 'Outro motivo bem diferente do primeiro' }],
  ])('%s diferente → 409 IDEMPOTENCY_KEY_REUSED; saldo muda só uma vez', async (_n, troca) => {
    const w = await carteira(alvo.userId, 100);
    const body = corpo();
    const a = await ajustar(ceo, w.id, body);
    expect(a.status).toBe(200);
    const b = await ajustar(ceo, w.id, { ...body, ...troca });
    expect(b.status).toBe(409);
    expect(b.body).toEqual({
      error: 'Esta chave já foi usada em outro ajuste. Confira o extrato antes de tentar de novo.',
      code: 'IDEMPOTENCY_KEY_REUSED',
      actionId: a.body.adjustment.actionId,
    });
    expect(await saldo(w.id)).toBe(125);
    expect(await prisma.walletEntry.count({ where: { walletId: w.id } })).toBe(1);
    expect(await prisma.adminMoneyAction.count({ where: { idempotencyKey: body.idempotencyKey } })).toBe(1);
  });

  it('motivo igual com espaços nas pontas e valor igual → replay (não é reuso)', async () => {
    const w = await carteira(alvo.userId, 0);
    const body = corpo({ amount: 10.1 });
    await ajustar(ceo, w.id, body);
    const b = await ajustar(ceo, w.id, { ...body, reason: `  ${MOTIVO}  `, amount: 10.10 });
    expect(b.status).toBe(200);
    expect(b.body.replayed).toBe(true);
    expect(await saldo(w.id)).toBe(10.1);
  });
});

describe('validação e permissão', () => {
  it.each([
    ['valor zero', { amount: 0 }],
    ['valor negativo', { amount: -5 }],
    ['acima do teto', { amount: 50000.01 }],
    ['três casas', { amount: 10.123 }],
    ['valor em texto', { amount: '10' }],
    ['motivo curto', { reason: 'curto' }],
    ['motivo longo', { reason: 'x'.repeat(501) }],
    ['chave inválida', { idempotencyKey: 'abc' }],
    ['chave vazia', { idempotencyKey: '' }],
    ['direção inválida', { direction: 'set' }],
    ['campo a mais', { extra: 1 }],
  ])('%s → 400 e saldo intacto', async (_n, extra) => {
    const w = await carteira(alvo.userId, 5);
    const r = await ajustar(ceo, w.id, corpo(extra));
    expect(r.status).toBe(400);
    expect(typeof r.body.error).toBe('string');
    expect(await saldo(w.id)).toBe(5);
  });

  it('teto exato (50.000) é aceito', async () => {
    const w = await carteira(alvo.userId, 0);
    expect((await ajustar(ceo, w.id, corpo({ amount: 50000 }))).status).toBe(200);
  });

  it('gerente sem wallet:credit → 403', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const w = await carteira(alvo.userId, 0);
    expect((await ajustar(gerente, w.id, corpo())).status).toBe(403);
    expect(await saldo(w.id)).toBe(0);
  });

  it('rotas antigas saíram → 404 e saldo intacto', async () => {
    const w = await carteira(alvo.userId, 30);
    const add = await request(app).post(`/api/admin/wallets/${w.id}/add-balance`).set('Authorization', bearer(ceo))
      .send({ amount: 10, reason: MOTIVO });
    const put = await request(app).put(`/api/admin/wallets/${w.id}/balance`).set('Authorization', bearer(ceo))
      .send({ amount: -10, reason: MOTIVO });
    expect([add.status, put.status]).toEqual([404, 404]);
    expect(await saldo(w.id)).toBe(30);
  });
});
