/**
 * Testes de hardening (segurança + integridade financeira).
 * Cobrem as correções aplicadas na auditoria de prontidão para produção:
 *  - preço sempre do banco (nunca confiar no frontend)
 *  - estorno devolve estoque + trava anti-duplo-reembolso
 *  - IDOR de carteira (store/motoboy) bloqueado
 *  - débito de carteira atômico (sem race condition de saldo)
 *
 * Usa MongoMemoryReplSet porque o código usa transações Mongo (exigem replica set).
 */
import request from 'supertest';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import app from '../app';
import { Role } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { findWallet } from './helpers/financePg';
import walletService from '../services/wallet.prisma.service';

const JWT_SECRET = process.env.JWT_SECRET || 'test_secret_key_with_minimum_32_characters_length_ok';


async function createUser(role = 'cliente'): Promise<{ token: string; userId: string }> {
  const passwordHash = await bcrypt.hash('Senha123!', 10);
  const roles = role !== 'cliente' ? [role, 'cliente'] : ['cliente'];
  const user = await prisma.user.create({
    data: {
      name: `User ${role}`,
      email: `u-${Date.now()}-${Math.random().toString(36).slice(2)}@hard.test`,
      passwordHash,
      role: role as Role,
      roles: roles as Role[],
      activeRole: role as Role,
      // Cliente já verificado para passar pelo gate KYC nos testes de pedido
      verification: {
        email: { status: 'verified', verifiedAt: new Date() },
        phone: { status: 'verified', e164: '+5511988887777', verifiedAt: new Date() },
        document: { type: 'cpf', status: 'approved' },
      },
    },
  });
  const token = jwt.sign(
    { id: user.id, role, activeRole: role, roles },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
  return { token, userId: user.id };
}

async function setBalance(owner: string, ownerType: 'user' | 'store' | 'motoboy', amount: number) {
  await prisma.wallet.upsert({
    where: { owner_ownerType: { owner, ownerType } },
    create: { owner, ownerType, balance: amount, totalIncome: amount, totalSpent: 0 },
    update: { balance: amount, totalIncome: amount, totalSpent: 0 },
  });
}

beforeAll(async () => {
  // (evita flaky na 1ª transação, que usa startTransaction sem retry no createOrder)
}, 60000);

afterAll(async () => {
});

afterEach(async () => {
  await cleanupUsersByEmailDomain('@hard.test');
});

// ============================================================
// 1) NUNCA confiar no frontend: preço vem do banco
// ============================================================
describe('Segurança: preço do pedido vem sempre do banco', () => {
  it('ignora o preço enviado pelo frontend e usa o preço real do produto', async () => {
    const customer = await createUser('cliente');
    const lojista = await createUser('lojista');
    await setBalance(customer.userId, 'user', 1000);

    const store = await prisma.store.create({ data: { ownerId: lojista.userId, name: 'Loja A', isOpen: true } });
    const product = await prisma.product.create({ data: { storeId: store.id, name: 'Produto', price: 100, quantity: 10 } });

    const res = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        storeId: store.id,
        products: [{ productId: product.id, quantity: 1, price: 1 }], // preço malicioso
        deliveryDistanceKm: 0,
        paymentMethod: 'pix',
      });

    expect(res.status).toBe(201);
    // Cobrança correta: 100 (do banco), não 1 (do frontend)
    expect(res.body.totalValue).toBe(100);

    const wallet = await findWallet({ owner: customer.userId, ownerType: 'user' });
    expect(wallet!.balance).toBe(900); // 1000 - 100
  });
});

// ============================================================
// 2) Estorno devolve estoque + anti-duplo-reembolso
// ============================================================
describe('Financeiro: cancelamento devolve estoque e não reembolsa duas vezes', () => {
  it('restaura o estoque e credita o reembolso uma única vez', async () => {
    const customer = await createUser('cliente');
    const lojista = await createUser('lojista');
    await setBalance(customer.userId, 'user', 1000);

    const store = await prisma.store.create({ data: { ownerId: lojista.userId, name: 'Loja B', isOpen: true } });
    const product = await prisma.product.create({ data: { storeId: store.id, name: 'Produto', price: 100, quantity: 10 } });

    const orderRes = await request(app)
      .post('/api/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        storeId: store.id,
        products: [{ productId: product.id, quantity: 3 }],
        deliveryDistanceKm: 0,
        paymentMethod: 'pix',
      });
    expect(orderRes.status).toBe(201);
    const orderId = orderRes.body._id;

    // Estoque decrementado e saldo debitado
    expect((await prisma.product.findUnique({ where: { id: product.id } }))!.quantity).toBe(7);
    expect((await findWallet({ owner: customer.userId, ownerType: 'user' }))!.balance).toBe(700);

    // 1º cancelamento: sucesso
    const cancel1 = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'mudei de ideia' });
    expect(cancel1.status).toBe(200);

    // Estoque restaurado e reembolso creditado
    expect((await prisma.product.findUnique({ where: { id: product.id } }))!.quantity).toBe(10);
    expect((await findWallet({ owner: customer.userId, ownerType: 'user' }))!.balance).toBe(1000);

    // 2º cancelamento (duplicado): bloqueado por uma das duas camadas de defesa —
    // validação de status (400) ou trava atômica anti-corrida (409). O essencial:
    // NÃO pode reembolsar de novo.
    const cancel2 = await request(app)
      .post(`/api/orders/${orderId}/cancel`)
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ reason: 'duplicado' });
    expect([400, 409]).toContain(cancel2.status);
    expect((await findWallet({ owner: customer.userId, ownerType: 'user' }))!.balance).toBe(1000); // não dobrou
  });
});

// ============================================================
// 3) IDOR: carteira de loja/motoboy só do dono (ou admin)
// ============================================================
describe('Segurança (IDOR): acesso a carteira de loja/motoboy', () => {
  it('impede um lojista de ver a carteira de outra loja', async () => {
    const donoA = await createUser('lojista');
    const donoB = await createUser('lojista');
    const lojaB = await prisma.store.create({ data: { ownerId: donoB.userId, name: 'Loja do B', isOpen: true } });

    const res = await request(app)
      .get(`/api/wallets/store/${lojaB.id}`)
      .set('Authorization', `Bearer ${donoA.token}`);
    expect(res.status).toBe(403);
  });

  it('permite o dono ver a carteira da própria loja', async () => {
    const dono = await createUser('lojista');
    const loja = await prisma.store.create({ data: { ownerId: dono.userId, name: 'Minha Loja', isOpen: true } });

    const res = await request(app)
      .get(`/api/wallets/store/${loja.id}`)
      .set('Authorization', `Bearer ${dono.token}`);
    expect(res.status).toBe(200);
  });

  it('impede um motoboy de ver a carteira de outro motoboy', async () => {
    const m1 = await createUser('motoboy');
    const m2 = await createUser('motoboy');

    const res = await request(app)
      .get(`/api/wallets/motoboy/${m2.userId}`)
      .set('Authorization', `Bearer ${m1.token}`);
    expect(res.status).toBe(403);
  });
});

// ============================================================
// 4) Débito de carteira atômico (sem furar o saldo)
// ============================================================
describe('Financeiro: walletService.debit é atômico', () => {
  it('rejeita débito acima do saldo', async () => {
    const { userId } = await createUser('cliente');
    await setBalance(userId, 'user', 100);

    await expect(
      walletService.debit({ owner: userId, ownerType: 'user', amount: 150, reason: 'teste' })
    ).rejects.toThrow('Saldo insuficiente');

    expect((await findWallet({ owner: userId, ownerType: 'user' }))!.balance).toBe(100);
  });

  it('não fura o saldo em débitos concorrentes (race condition)', async () => {
    const { userId } = await createUser('cliente');
    await setBalance(userId, 'user', 100);

    // Dois débitos de 60 ao mesmo tempo: só um pode passar (saldo 100)
    const results = await Promise.allSettled([
      walletService.debit({ owner: userId, ownerType: 'user', amount: 60, reason: 'd1' }),
      walletService.debit({ owner: userId, ownerType: 'user', amount: 60, reason: 'd2' }),
    ]);

    const ok = results.filter(r => r.status === 'fulfilled').length;
    const fail = results.filter(r => r.status === 'rejected').length;
    expect(ok).toBe(1);
    expect(fail).toBe(1);

    expect((await findWallet({ owner: userId, ownerType: 'user' }))!.balance).toBe(40); // 100 - 60
  });
});
