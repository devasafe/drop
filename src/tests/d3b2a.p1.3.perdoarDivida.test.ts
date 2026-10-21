/**
 * D3b-2a · P1.3 — perdoar a dívida do cliente: só a pendente e da própria pessoa, com motivo,
 * registro na mesma transação, aviso ao cliente e nenhum dinheiro movido. A cobrança no próximo
 * pedido também é condicional: perdão e cobrança da mesma dívida nunca vencem os dois.
 */
jest.mock('../services/routeService', () => {
  const actual = jest.requireActual('../services/routeService');
  return { __esModule: true, ...actual, getRoute: jest.fn() };
});
// Fluxo Asaas sem rede (mesmo mock de asaasOrderPayment.test.ts).
jest.mock('../services/asaas/payment', () => ({
  __esModule: true,
  ensureAsaasCustomer: jest.fn(async () => 'cus_test'),
  createPixCharge: jest.fn(async () => ({
    paymentId: 'pay_p13', status: 'PENDING', qrCodePayload: '000201-pix-copia-e-cola', qrCodeImage: 'base64img',
  })),
}));

import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { getRoute } from '../services/routeService';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import * as debtRepo from '../repositories/customerDebt.repository';
import * as actions from '../services/adminAccounts/actions';
import walletService from '../services/wallet.prisma.service';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { createWallet } from './helpers/financePg';
import { grantRolePermissions } from './helpers/d3b1Ops';

const DOMAIN = '@d3b2ap13.test';
const REASON = 'Cliente cancelou por erro do app';
const ORIGINAL_GATEWAY = env.PAYMENT_GATEWAY;
let restore: () => Promise<void>;
let ceo: TestUser;

beforeAll(async () => {
  restore = await snapshotPlatformConfig();
  (env as any).PAYMENT_GATEWAY = 'none';
});
afterAll(async () => {
  await restore();
  (env as any).PAYMENT_GATEWAY = ORIGINAL_GATEWAY;
});
beforeEach(async () => {
  (getRoute as jest.Mock).mockResolvedValue({ distanceKm: 3, durationSeconds: 600, polyline: 'abc', source: 'google' });
  await updatePlatformConfig({ settlementMode: 'custodia' } as any, 'test');
  ceo = await createTestUser('ceo', DOMAIN);
});
afterEach(async () => {
  jest.restoreAllMocks();
  await cleanupUsersByEmailDomain(DOMAIN);
});

/** Cliente com R$ 1000 na carteira, loja Plano 1 com um produto e uma dívida pendente de R$ 12,50 de um pedido antigo da loja. */
async function cenario() {
  const cliente = await createTestUser('cliente', DOMAIN);
  await createWallet({ owner: cliente.userId, ownerType: 'user', balance: 1000, totalIncome: 1000, totalSpent: 0 });
  const dono = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({
    data: { ownerId: dono.userId, name: 'Loja P1.3', isOpen: true, latitude: '-22.90', longitude: '-43.20' } as any,
  });
  const product = await prisma.product.create({ data: { storeId: store.id, name: 'Item', price: 20, quantity: 10 } } as any);
  const antigo = await prisma.order.create({
    data: { customerId: cliente.userId, storeId: store.id, totalValue: 20, deliveryFee: 0, status: 'cancelado', paymentStatus: 'paid' } as any,
  });
  const debt = await prisma.customerDebt.create({
    data: { customerId: cliente.userId, amount: 12.5, sourceOrderId: antigo.id, reason: 'Cancelamento tardio' },
  });
  return { cliente, dono, store, product, debt };
}

const forgive = (by: TestUser, userId: string, debtId: string, body: Record<string, unknown> = { reason: REASON }) =>
  request(app).post(`/api/admin/users/${userId}/debts/${debtId}/forgive`).set('Authorization', bearer(by)).send(body);
const debtOf = (id: string) => prisma.customerDebt.findUniqueOrThrow({ where: { id } });
const balanceOf = async (owner: string) =>
  Number((await prisma.wallet.findUniqueOrThrow({ where: { owner_ownerType: { owner, ownerType: 'user' } } })).balance);
const entriesOf = (owner: string, category: 'penalty' | 'transfer') =>
  prisma.walletEntry.count({ where: { wallet: { owner }, category } });

describe('POST /admin/users/:id/debts/:debtId/forgive', () => {
  it('o CEO perdoa: a dívida vira forgiven, o histórico guarda o motivo, o cliente é avisado e nenhum dinheiro se move', async () => {
    const { cliente, store, debt } = await cenario();
    const res = await forgive(ceo, cliente.userId, debt.id, { reason: `  ${REASON}  ` });
    expect(res.status).toBe(200);
    expect(res.body.debt).toMatchObject({ id: debt.id, status: 'forgiven', amount: 12.5 });
    expect(new Date(res.body.debt.forgivenAt).getTime()).toBeGreaterThan(Date.now() - 60_000);

    const saved = await debtOf(debt.id);
    expect(saved.status).toBe('forgiven');
    expect(saved.forgivenBy).toBe(ceo.userId);
    expect(saved.forgivenAt).toBeInstanceOf(Date);
    expect(saved.collectedAt).toBeNull();

    const rows = await prisma.adminAccountAction.findMany({ where: { userId: cliente.userId } });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      type: 'debt_forgive', reason: REASON, actorId: ceo.userId, actorRole: 'ceo',
      meta: { debtId: debt.id, amount: 12.5, sourceOrderId: debt.sourceOrderId },
    });

    expect(await balanceOf(cliente.userId)).toBe(1000);
    expect(await prisma.walletEntry.count({ where: { wallet: { owner: { in: [cliente.userId, store.id] } } } })).toBe(0);

    const aviso = await prisma.notification.findFirst({ where: { userId: cliente.userId, entityId: debt.id } });
    expect(aviso).toMatchObject({ message: 'Sua pendência de R$ 12,50 foi perdoada.', link: '/conta/carteira' });
  });

  it('motivo inválido: 400 REASON_REQUIRED e a dívida segue pendente', async () => {
    const { cliente, debt } = await cenario();
    for (const body of [{}, { reason: 'abc' }, { reason: 'x'.repeat(501) }]) {
      const res = await forgive(ceo, cliente.userId, debt.id, body);
      expect(res.status).toBe(400);
      expect(res.body.code).toBe('REASON_REQUIRED');
    }
    expect((await debtOf(debt.id)).status).toBe('pending');
    expect(await prisma.adminAccountAction.count({ where: { userId: cliente.userId } })).toBe(0);
  });

  it('dívida de outra pessoa ou inexistente: 404 DEBT_NOT_FOUND; pessoa inexistente: 404 USER_NOT_FOUND', async () => {
    const { debt } = await cenario();
    const outra = await createTestUser('cliente', DOMAIN);
    const alheia = await forgive(ceo, outra.userId, debt.id);
    expect(alheia.status).toBe(404);
    expect(alheia.body.code).toBe('DEBT_NOT_FOUND');
    expect((await forgive(ceo, outra.userId, 'divida-que-nao-existe')).body.code).toBe('DEBT_NOT_FOUND');
    const semPessoa = await forgive(ceo, 'pessoa-que-nao-existe', debt.id);
    expect(semPessoa.status).toBe(404);
    expect(semPessoa.body.code).toBe('USER_NOT_FOUND');
    expect((await debtOf(debt.id)).status).toBe('pending');
  });

  it('já perdoada ou já cobrada: 409 DEBT_NOT_PENDING', async () => {
    const { cliente, debt } = await cenario();
    expect((await forgive(ceo, cliente.userId, debt.id)).status).toBe(200);
    const deNovo = await forgive(ceo, cliente.userId, debt.id);
    expect(deNovo.status).toBe(409);
    expect(deNovo.body.code).toBe('DEBT_NOT_PENDING');

    const cobrada = await prisma.customerDebt.create({
      data: { customerId: cliente.userId, amount: 5, sourceOrderId: debt.sourceOrderId, reason: 'outra', status: 'collected', collectedAt: new Date() },
    });
    expect((await forgive(ceo, cliente.userId, cobrada.id)).body.code).toBe('DEBT_NOT_PENDING');
    expect(await prisma.adminAccountAction.count({ where: { userId: cliente.userId } })).toBe(1);
  });

  it('permissão: 403 sem user:debt_forgive; 200 com ela num papel delegado', async () => {
    const { cliente, debt } = await cenario();
    const gerente = await createTestUser('gerente_geral', DOMAIN);
    const restoreRole = await grantRolePermissions('gerente_geral', ['user:view_all', 'user:block']);
    try {
      const negado = await forgive(gerente, cliente.userId, debt.id);
      expect(negado.status).toBe(403);
      expect(negado.body.error).toBe('Permissão negada. Você precisa de: user:debt_forgive');
      await grantRolePermissions('gerente_geral', ['user:debt_forgive']);
      expect((await forgive(gerente, cliente.userId, debt.id)).status).toBe(200);
      expect(await prisma.adminAccountAction.findFirst({ where: { userId: cliente.userId } }))
        .toMatchObject({ actorId: gerente.userId, actorRole: 'gerente_geral' });
    } finally {
      await restoreRole();
    }
  });

  it('autoperdão: 403 SELF_ACTION_FORBIDDEN, a dívida segue pendente e nada é registrado', async () => {
    const { store } = await cenario();
    const propria = await prisma.customerDebt.create({
      data: { customerId: ceo.userId, amount: 9, sourceOrderId: `p13-self-${store.id}`, reason: 'Cancelamento tardio' },
    });
    const res = await forgive(ceo, ceo.userId, propria.id);
    expect(res.status).toBe(403);
    expect(res.body).toEqual({ error: 'Você não pode perdoar a própria dívida.', code: 'SELF_ACTION_FORBIDDEN' });
    expect((await debtOf(propria.id)).status).toBe('pending');
    expect(await prisma.adminAccountAction.count({ where: { userId: ceo.userId } })).toBe(0);
    expect(await prisma.notification.count({ where: { userId: ceo.userId, entityId: propria.id } })).toBe(0);
  });

  it('se o registro falha, a dívida segue pendente e o cliente não é avisado', async () => {
    const { cliente, debt } = await cenario();
    jest.spyOn(actions, 'recordAccountAction').mockRejectedValueOnce(new Error('falha no registro'));
    const res = await forgive(ceo, cliente.userId, debt.id);
    expect(res.status).toBe(500);
    expect((await debtOf(debt.id)).status).toBe('pending');
    expect(await prisma.notification.count({ where: { userId: cliente.userId } })).toBe(0);
  });
});

describe('corrida com a cobrança no próximo pedido (custódia, carteira)', () => {
  const pedido = (storeId: string, productId: string) => ({
    storeId, products: [{ productId, quantity: 1 }], paymentMethod: 'pix', deliveryDistanceKm: 0,
    address: 'Rua X, 1 - Centro', latitude: -22.95, longitude: -43.25,
  });
  const novoPedido = (storeId: string, sourceOrderId: string) =>
    prisma.order.findFirstOrThrow({ where: { storeId, NOT: { id: sourceOrderId } } });

  it('a cobrança vence: a dívida vira collected ligada ao pedido, e o perdão depois recebe 409', async () => {
    const { cliente, store, product, debt } = await cenario();
    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(pedido(store.id, product.id));
    expect(res.status).toBe(201);
    const order = await novoPedido(store.id, debt.sourceOrderId);
    const saved = await debtOf(debt.id);
    expect(saved.status).toBe('collected');
    expect(saved.collectedOrderId).toBe(order.id);
    expect(Number(order.debtCollected)).toBe(12.5);
    expect(await entriesOf(cliente.userId, 'penalty')).toBe(1);
    expect(await entriesOf(store.id, 'transfer')).toBe(1);

    const tarde = await forgive(ceo, cliente.userId, debt.id);
    expect(tarde.status).toBe(409);
    expect(tarde.body.code).toBe('DEBT_NOT_PENDING');
    expect((await debtOf(debt.id)).status).toBe('collected');
  });

  it('o perdão vence no meio do pedido: a multa não é cobrada nem repassada, e a dívida fica forgiven', async () => {
    const { cliente, store, product, debt } = await cenario();
    const realFind = debtRepo.findPendingDebt;
    // O admin perdoa logo depois de o pedido ler a dívida e antes de cobrá-la.
    jest.spyOn(debtRepo, 'findPendingDebt').mockImplementationOnce(async (...args: Parameters<typeof realFind>) => {
      const found = await realFind(...args);
      const r = await forgive(ceo, cliente.userId, debt.id);
      expect(r.status).toBe(200);
      return found;
    });

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(pedido(store.id, product.id));
    expect(res.status).toBe(201);
    const order = await novoPedido(store.id, debt.sourceOrderId);
    const saved = await debtOf(debt.id);
    expect(saved.status).toBe('forgiven');
    expect(saved.collectedAt).toBeNull();
    expect(saved.collectedOrderId).toBeNull();
    expect(order.debtCollected).toBeNull();
    expect(await entriesOf(cliente.userId, 'penalty')).toBe(0);
    expect(await entriesOf(store.id, 'transfer')).toBe(0);
    expect(await balanceOf(cliente.userId)).toBe(1000 - Number(order.totalValue));
  });

  it('ao mesmo tempo: só um vence, e a dívida nunca fica perdoada e cobrada', async () => {
    const { cliente, store, product, debt } = await cenario();
    const [orderRes, forgiveRes] = await Promise.all([
      request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(pedido(store.id, product.id)),
      forgive(ceo, cliente.userId, debt.id),
    ]);
    expect(orderRes.status).toBe(201);
    const saved = await debtOf(debt.id);
    const penalties = await entriesOf(cliente.userId, 'penalty');
    const forgiveRows = await prisma.adminAccountAction.count({ where: { userId: cliente.userId, type: 'debt_forgive' } });
    if (forgiveRes.status === 200) {
      expect(saved.status).toBe('forgiven');
      expect(saved.collectedOrderId).toBeNull();
      expect(penalties).toBe(0);
      expect(forgiveRows).toBe(1);
    } else {
      expect(forgiveRes.status).toBe(409);
      expect(forgiveRes.body.code).toBe('DEBT_NOT_PENDING');
      expect(saved.status).toBe('collected');
      expect(saved.forgivenAt).toBeNull();
      expect(penalties).toBe(1);
      expect(forgiveRows).toBe(0);
    }
  });

  it('o débito da multa falha depois da baixa: a dívida segue pending (nem por um instante collected), sem penalty e sem pedido', async () => {
    const { cliente, store, product, debt } = await cenario();
    const realDebit = walletService.debit.bind(walletService);
    let statusDuranteODebito: string | null = null;
    jest.spyOn(walletService, 'debit').mockImplementation(async (params, tx) => {
      if (params.category === 'penalty') {
        // Visto de fora da cobrança: a baixa não pode aparecer antes de a multa ser paga.
        statusDuranteODebito = (await debtOf(debt.id)).status;
        throw new Error('falha no débito da multa');
      }
      return realDebit(params, tx);
    });

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(pedido(store.id, product.id));
    expect(res.status).toBe(500);
    expect(statusDuranteODebito).toBe('pending');
    const saved = await debtOf(debt.id);
    expect(saved.status).toBe('pending');
    expect(saved.collectedAt).toBeNull();
    expect(saved.collectedOrderId).toBeNull();
    expect(await entriesOf(cliente.userId, 'penalty')).toBe(0);
    expect(await entriesOf(store.id, 'transfer')).toBe(0);
    expect(await prisma.order.count({ where: { storeId: store.id, NOT: { id: debt.sourceOrderId } } })).toBe(0);

    // E o perdão continua possível.
    expect((await forgive(ceo, cliente.userId, debt.id)).status).toBe(200);
  });
  it('o perdão que chega durante a cobrança espera o lock da dívida e responde 409', async () => {
    const { cliente, store, product, debt } = await cenario();
    const realDebit = walletService.debit.bind(walletService);
    let perdao: Promise<request.Response> | null = null;
    let respondeuAntesDoCommit = false;
    jest.spyOn(walletService, 'debit').mockImplementation(async (params, tx) => {
      if (params.category === 'penalty') {
        // A baixa já pegou a linha nesta transação: o perdão tem que ficar esperando.
        let pronto = false;
        perdao = forgive(ceo, cliente.userId, debt.id).then((r) => { pronto = true; return r; });
        await new Promise((r) => setTimeout(r, 400));
        respondeuAntesDoCommit = pronto;
      }
      return realDebit(params, tx);
    });

    const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send(pedido(store.id, product.id));
    expect(res.status).toBe(201);
    expect(perdao).not.toBeNull();
    const tarde = await perdao!;
    expect(respondeuAntesDoCommit).toBe(false);
    expect(tarde.status).toBe(409);
    expect(tarde.body.code).toBe('DEBT_NOT_PENDING');
    const saved = await debtOf(debt.id);
    expect(saved.status).toBe('collected');
    expect(saved.forgivenAt).toBeNull();
    expect(await entriesOf(cliente.userId, 'penalty')).toBe(1);
    expect(await prisma.adminAccountAction.count({ where: { userId: cliente.userId } })).toBe(0);
  });
});

describe('fluxo Asaas: a multa não é cobrada no pedido', () => {
  it('o pedido não leva debtCollected, a dívida segue pending sem collectedOrderId e nada é debitado', async () => {
    const { cliente, store, product, debt } = await cenario();
    await prisma.user.update({ where: { id: cliente.userId }, data: { cpf: '39053344705' } }); // Pix no Asaas pede CPF
    (env as any).PAYMENT_GATEWAY = 'asaas';
    try {
      const res = await request(app).post('/api/orders').set('Authorization', bearer(cliente)).send({
        storeId: store.id, products: [{ productId: product.id, quantity: 1 }], paymentMethod: 'pix', deliveryDistanceKm: 0,
        address: 'Rua X, 1 - Centro', latitude: -22.95, longitude: -43.25,
      });
      expect(res.status).toBe(201);
      expect(res.body.pix).toBeTruthy();
    } finally {
      (env as any).PAYMENT_GATEWAY = 'none';
    }
    const order = await prisma.order.findFirstOrThrow({ where: { storeId: store.id, NOT: { id: debt.sourceOrderId } } });
    expect(order.debtCollected).toBeNull();
    const saved = await debtOf(debt.id);
    expect(saved.status).toBe('pending');
    expect(saved.collectedAt).toBeNull();
    expect(saved.collectedOrderId).toBeNull();
    expect(await entriesOf(cliente.userId, 'penalty')).toBe(0);
    expect(await balanceOf(cliente.userId)).toBe(1000);
  });
});
