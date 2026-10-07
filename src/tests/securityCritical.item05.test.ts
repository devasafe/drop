/**
 * Regressão (auditoria de segurança 2026-10-07) — item 5: propriedade em rotas de dinheiro.
 * Um lojista não pode movimentar, sacar nem consultar repasses/saques da loja de outro;
 * papéis administrativos não sacam da carteira de terceiros.
 */
import request from 'supertest';
import app from '../app';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';

const DOMAIN = '@sec05.test';

afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

async function lojistaComLoja(saldoLoja = 0): Promise<{ owner: TestUser; storeId: string }> {
  const owner = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: owner.userId, name: `Loja ${owner.userId.slice(-4)}`, isOpen: true } });
  await prisma.user.update({ where: { id: owner.userId }, data: { storeId: store.id } });
  if (saldoLoja) {
    await prisma.wallet.create({ data: { owner: store.id, ownerType: 'store', balance: saldoLoja, totalIncome: saldoLoja } });
  }
  return { owner, storeId: store.id };
}

describe('Item 5 — lojista não age sobre a loja de outro', () => {
  it('POST /wallets/transfer com fromStoreId alheio → 403 e saldo intacto', async () => {
    const a = await lojistaComLoja();
    const b = await lojistaComLoja(100);
    const res = await request(app)
      .post('/api/wallets/transfer')
      .set('Authorization', bearer(a.owner))
      .send({ fromStoreId: b.storeId, toUserId: a.owner.userId, amount: 40, reason: 'drenar' });
    expect(res.status).toBe(403);
    const w = await prisma.wallet.findUnique({ where: { owner_ownerType: { owner: b.storeId, ownerType: 'store' } } });
    expect(Number(w?.balance)).toBe(100);
  });

  it('POST /withdrawals/request com storeId alheio → 403', async () => {
    const a = await lojistaComLoja();
    const b = await lojistaComLoja();
    const res = await request(app)
      .post('/api/withdrawals/request')
      .set('Authorization', bearer(a.owner))
      .send({ amount: 10, storeId: b.storeId, bankAccount: { banco: 'x', agencia: '1', conta: '2', cpf: '00000000000' } });
    expect(res.status).toBe(403);
    expect(await prisma.withdrawalRequest.count({ where: { motoboyId: b.storeId } })).toBe(0);
  });

  it('GET /withdrawals/my-withdrawals?storeId alheio → 403', async () => {
    const a = await lojistaComLoja();
    const b = await lojistaComLoja();
    const res = await request(app)
      .get(`/api/withdrawals/my-withdrawals?storeId=${b.storeId}`)
      .set('Authorization', bearer(a.owner));
    expect(res.status).toBe(403);
  });

  it('GET /payouts/my e /my/summary com storeId alheio → 403; dono → 200', async () => {
    const a = await lojistaComLoja();
    const b = await lojistaComLoja();
    for (const path of ['/api/payouts/my', '/api/payouts/my/summary']) {
      const alheio = await request(app).get(`${path}?storeId=${b.storeId}`).set('Authorization', bearer(a.owner));
      expect(alheio.status).toBe(403);
      const dono = await request(app).get(`${path}?storeId=${b.storeId}`).set('Authorization', bearer(b.owner));
      expect(dono.status).toBe(200);
    }
  });
});

describe('Item 5 — saque por walletId exige ser o dono', () => {
  it('papel administrativo não saca da carteira de um cliente', async () => {
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const cliente = await createTestUser('cliente', DOMAIN);
    const wallet = await prisma.wallet.create({ data: { owner: cliente.userId, ownerType: 'user', balance: 200, totalIncome: 200 } });
    const res = await request(app)
      .post(`/api/wallets/${wallet.id}/withdraw`)
      .set('Authorization', bearer(gerente))
      .send({ amount: 50, reason: 'saque indevido' });
    expect(res.status).toBe(403);
    const after = await prisma.wallet.findUnique({ where: { id: wallet.id } });
    expect(Number(after?.balance)).toBe(200);
  });
});
