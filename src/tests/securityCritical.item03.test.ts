/**
 * Regressão (auditoria de segurança 2026-10-07) — item 3: dinheiro sem lastro.
 *  - /wallets/:userId/credit e /refund (crédito self-service sem pagamento) não existem mais.
 *  - Crédito/ajuste manual só pelo admin (CEO), com motivo obrigatório e trilha de auditoria
 *    persistida no WalletEntry (quem, quando, quanto, por quê).
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer } from './helpers/authUser';

const DOMAIN = '@sec03.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function walletOf(owner: string, balance = 0) {
  return prisma.wallet.create({ data: { owner, ownerType: 'user', balance, totalIncome: balance } });
}

describe('Item 3 — crédito self-service removido', () => {
  it('dono não consegue creditar a própria carteira sem pagamento', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    const wallet = await walletOf(cliente.userId, 0);
    const res = await request(app)
      .post(`/api/wallets/${cliente.userId}/credit`)
      .set('Authorization', bearer(cliente))
      .send({ amount: 100, paymentMethod: 'pix' });
    expect(res.status).toBe(404);
    const after = await prisma.wallet.findUnique({ where: { id: wallet.id } });
    expect(Number(after?.balance)).toBe(0);
  });

  it('dono não consegue "reembolsar" valor livre na própria carteira', async () => {
    const cliente = await createTestUser('cliente', DOMAIN);
    const wallet = await walletOf(cliente.userId, 50);
    const res = await request(app)
      .post(`/api/wallets/${cliente.userId}/refund`)
      .set('Authorization', bearer(cliente))
      .send({ amount: 30, orderId: 'X', reason: 'qualquer' });
    expect(res.status).toBe(404);
    const after = await prisma.wallet.findUnique({ where: { id: wallet.id } });
    expect(Number(after?.balance)).toBe(50);
  });
});

describe('Item 3 — crédito administrativo exige motivo e deixa auditoria', () => {
  it('add-balance sem motivo (ou motivo curto) → 400 e saldo intacto', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createTestUser('cliente', DOMAIN);
    const wallet = await walletOf(alvo.userId, 0);
    for (const body of [{ amount: 10 }, { amount: 10, reason: 'curto' }]) {
      const res = await request(app)
        .post(`/api/admin/wallets/${wallet.id}/add-balance`)
        .set('Authorization', bearer(ceo))
        .send(body);
      expect(res.status).toBe(400);
    }
    const after = await prisma.wallet.findUnique({ where: { id: wallet.id } });
    expect(Number(after?.balance)).toBe(0);
  });

  it('add-balance com valor acima do teto → 400', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createTestUser('cliente', DOMAIN);
    const wallet = await walletOf(alvo.userId, 0);
    const res = await request(app)
      .post(`/api/admin/wallets/${wallet.id}/add-balance`)
      .set('Authorization', bearer(ceo))
      .send({ amount: 1_000_000, reason: 'valor absurdo de teste' });
    expect(res.status).toBe(400);
  });

  it('CEO credita com motivo → 200 e WalletEntry registra quem e por quê', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createTestUser('cliente', DOMAIN);
    const wallet = await walletOf(alvo.userId, 0);
    const reason = 'Compensação por pedido extraviado #123';
    const res = await request(app)
      .post(`/api/admin/wallets/${wallet.id}/add-balance`)
      .set('Authorization', bearer(ceo))
      .send({ amount: 25, reason });
    expect(res.status).toBe(200);
    expect(res.body.newBalance).toBe(25);

    const entry = await prisma.walletEntry.findFirst({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' } });
    expect(entry?.reason).toBe(reason);
    expect(entry?.reference).toMatch(new RegExp(`^ADMIN_CREDIT:${ceo.userId}:`));
    expect(Number(entry?.amount)).toBe(25);
  });

  it('ajuste PUT /balance também exige motivo e audita débito', async () => {
    const ceo = await createTestUser('ceo', DOMAIN);
    const alvo = await createTestUser('cliente', DOMAIN);
    const wallet = await walletOf(alvo.userId, 40);

    const semMotivo = await request(app)
      .put(`/api/admin/wallets/${wallet.id}/balance`)
      .set('Authorization', bearer(ceo))
      .send({ amount: -10 });
    expect(semMotivo.status).toBe(400);

    const ok = await request(app)
      .put(`/api/admin/wallets/${wallet.id}/balance`)
      .set('Authorization', bearer(ceo))
      .send({ amount: -10, reason: 'Estorno de crédito lançado em duplicidade' });
    expect(ok.status).toBe(200);
    const entry = await prisma.walletEntry.findFirst({ where: { walletId: wallet.id }, orderBy: { createdAt: 'desc' } });
    expect(entry?.reference).toMatch(new RegExp(`^ADMIN_ADJUST:${ceo.userId}:`));
  });
});
