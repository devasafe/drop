/**
 * D3b-1 · P2.2 — prévia do cancelamento do admin por culpa (spec 4.2). Só leitura; usa as
 * mesmas fórmulas das regras da P2.1. Valores do cenário: total 52, entrega 12; taxas 10%/50%.
 */
jest.mock('../utils/socketEmitter', () => {
  const actual = jest.requireActual('../utils/socketEmitter');
  return { __esModule: true, ...actual, emitToRoom: jest.fn(), emitAdminNotification: jest.fn() };
});

import request from 'supertest';
import { Role } from '@prisma/client';
import app from '../app';
import { prisma } from '../lib/prisma';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import { cenarioCancel, limparCancel, CancelScenarioOpts } from './helpers/d3b1Cancel';

jest.setTimeout(30000);

const DOMAIN = '@d3b1p22.test';
const TOUCHED: Role = 'gerente_lojistas';
let snapshot: { role: Role; permissions: string[]; notificationTargets: Role[]; updatedBy: string }[] = [];
let restore: () => Promise<void>;
let since = new Date();
let ceo: TestUser;

beforeAll(async () => {
  restore = await snapshotPlatformConfig();
  snapshot = await prisma.rolePermissions.findMany({
    where: { role: TOUCHED },
    select: { role: true, permissions: true, notificationTargets: true, updatedBy: true },
  });
});
afterAll(async () => {
  await prisma.rolePermissions.deleteMany({ where: { role: TOUCHED } });
  for (const row of snapshot) await prisma.rolePermissions.create({ data: row });
  await restore();
  await prisma.$disconnect();
});
beforeEach(async () => {
  since = new Date();
  await updatePlatformConfig({
    cancelFeeCustomerPercent: 10, cancelFeeStorePercent: 10, cancelFeeMotoboyPercent: 10, lateCancellationMotoboyShare: 50,
  } as any, 'test');
  ceo = await createTestUser('ceo', DOMAIN);
});
afterEach(async () => { await limparCancel(DOMAIN, since); });

const preview = (orderId: string, fault: string, u: TestUser = ceo) =>
  request(app).get(`/api/admin/orders/${orderId}/cancel-preview?fault=${fault}`).set('Authorization', bearer(u));

async function previewOf(opts: CancelScenarioOpts, fault: string) {
  const s = await cenarioCancel(DOMAIN, opts);
  const r = await preview(s.orderId, fault);
  return { s, r };
}

describe('prévia por culpa — custódia', () => {
  it('cliente, motoboy em rota: devolve total − entrega; a entrega vai ao motoboy, paga pelo cliente', async () => {
    const { r } = await previewOf({ mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'picked' }, 'customer');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ fault: 'customer', customerRefund: 40, feeCharged: 12, motoboyCompensation: 12, compensationPaidBy: 'customer', countsAgainst: 'customer' });
  });

  it('cliente, motoboy indo à loja: cancelamento grátis', async () => {
    const { r } = await previewOf({ mode: 'custody', orderStatus: 'pago', delivery: 'assigned' }, 'customer');
    expect(r.body).toEqual({ fault: 'customer', customerRefund: 52, feeCharged: 0, motoboyCompensation: 0, compensationPaidBy: null, countsAgainst: 'customer' });
  });

  it('loja depois do aceite com motoboy: 100% ao cliente; taxa 1,20 da loja, 0,60 ao motoboy', async () => {
    const { r } = await previewOf({ mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'assigned' }, 'store');
    expect(r.body).toEqual({ fault: 'store', customerRefund: 52, feeCharged: 1.2, motoboyCompensation: 0.6, compensationPaidBy: 'store', countsAgainst: 'store' });
  });

  it('loja antes do aceite: rejeição pura, sem taxa', async () => {
    const { r } = await previewOf({ mode: 'custody', orderStatus: 'pago', acceptedAt: false }, 'store');
    expect(r.body).toEqual({ fault: 'store', customerRefund: 52, feeCharged: 0, motoboyCompensation: 0, compensationPaidBy: null, countsAgainst: 'store' });
  });

  it('motoboy: 100% ao cliente, nada ao motoboy', async () => {
    const { r } = await previewOf({ mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'picked' }, 'motoboy');
    expect(r.body).toEqual({ fault: 'motoboy', customerRefund: 52, feeCharged: 0, motoboyCompensation: 0, compensationPaidBy: null, countsAgainst: 'motoboy' });
  });

  it('DROP: 100% ao cliente e a entrega cheia ao motoboy, paga pelo DROP; não conta para ninguém', async () => {
    const { r } = await previewOf({ mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'assigned' }, 'platform');
    expect(r.body).toEqual({ fault: 'platform', customerRefund: 52, feeCharged: 0, motoboyCompensation: 12, compensationPaidBy: 'platform', countsAgainst: null });
  });
});

describe('prévia por culpa — custódia, casos de borda', () => {
  it('loja aceita sem motoboy: taxa 1,20 da loja, sem compensação', async () => {
    const { r } = await previewOf({ mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'pending' }, 'store');
    expect(r.body).toEqual({ fault: 'store', customerRefund: 52, feeCharged: 1.2, motoboyCompensation: 0, compensationPaidBy: null, countsAgainst: 'store' });
  });

  it('loja com a entrega retirada (picked): mesma taxa e compensação da loja', async () => {
    const { r } = await previewOf({ mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'picked' }, 'store');
    expect(r.body).toEqual({ fault: 'store', customerRefund: 52, feeCharged: 1.2, motoboyCompensation: 0.6, compensationPaidBy: 'store', countsAgainst: 'store' });
  });

  it('DROP sem motoboy: 100% ao cliente, sem compensação', async () => {
    const { r } = await previewOf({ mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'pending' }, 'platform');
    expect(r.body).toEqual({ fault: 'platform', customerRefund: 52, feeCharged: 0, motoboyCompensation: 0, compensationPaidBy: null, countsAgainst: null });
  });
});

describe('prévia por culpa — SaaS (direto)', () => {
  it('cliente, motoboy em rota: devolve 40; 12 ao motoboy', async () => {
    const { r } = await previewOf({ mode: 'direct', orderStatus: 'aguardando_motoboy', delivery: 'picked' }, 'customer');
    expect(r.body).toEqual({ fault: 'customer', customerRefund: 40, feeCharged: 12, motoboyCompensation: 12, compensationPaidBy: 'customer', countsAgainst: 'customer' });
  });

  it('loja com motoboy: 100% ao cliente; a loja paga 0,60 ao motoboy por Pix e não tem multa', async () => {
    const { r } = await previewOf({ mode: 'direct', orderStatus: 'aguardando_motoboy', delivery: 'assigned' }, 'store');
    expect(r.body).toEqual({ fault: 'store', customerRefund: 52, feeCharged: 0, motoboyCompensation: 0.6, compensationPaidBy: 'store', countsAgainst: 'store' });
  });

  it('DROP sem motoboy na corrida: 100% ao cliente, sem compensação', async () => {
    const { r } = await previewOf({ mode: 'direct', orderStatus: 'aguardando_motoboy', delivery: 'pending' }, 'platform');
    expect(r.body).toEqual({ fault: 'platform', customerRefund: 52, feeCharged: 0, motoboyCompensation: 0, compensationPaidBy: null, countsAgainst: null });
  });

  it('DROP com motoboy: 100% ao cliente; a entrega cheia ao motoboy, paga pelo DROP (Pix manual)', async () => {
    const { r } = await previewOf({ mode: 'direct', orderStatus: 'aguardando_motoboy', delivery: 'assigned' }, 'platform');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ fault: 'platform', customerRefund: 52, feeCharged: 0, motoboyCompensation: 12, compensationPaidBy: 'platform', countsAgainst: null });
  });
});

describe('prévia — recusas, acesso e só leitura', () => {
  it('pedido entregue → 409 ORDER_NOT_CANCELLABLE com currentStatus', async () => {
    const { r } = await previewOf({ mode: 'custody', orderStatus: 'entregue' }, 'customer');
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'ORDER_NOT_CANCELLABLE', currentStatus: 'entregue' });
    expect(typeof r.body.error).toBe('string');
  });

  it('devolução esperando o cliente → 409 ORDER_NOT_CANCELLABLE reason RETURN_IN_PROGRESS', async () => {
    const { r } = await previewOf({ mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'picked', returnInProgress: true }, 'motoboy');
    expect(r.status).toBe(409);
    expect(r.body).toMatchObject({ code: 'ORDER_NOT_CANCELLABLE', reason: 'RETURN_IN_PROGRESS' });
  });

  it('culpa inválida → 400 INVALID_FAULT; pedido inexistente → 404 ORDER_NOT_FOUND', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'pago' });
    expect((await preview(s.orderId, 'loja')).body).toMatchObject({ code: 'INVALID_FAULT' });
    expect((await preview(s.orderId, 'loja')).status).toBe(400);
    const nf = await preview('nao-existe', 'customer');
    expect(nf.status).toBe(404);
    expect(nf.body).toMatchObject({ code: 'ORDER_NOT_FOUND' });
  });

  it('sem order:admin_cancel → 403; com a permissão concedida ao papel → 200', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'pago' });
    const gerente = await createTestUser(TOUCHED, DOMAIN);
    await prisma.rolePermissions.deleteMany({ where: { role: TOUCHED } });
    expect((await preview(s.orderId, 'customer', gerente)).status).toBe(403);
    expect((await preview(s.orderId, 'customer', s.cliente)).status).toBe(403);
    await prisma.rolePermissions.create({ data: { role: TOUCHED, permissions: ['order:admin_cancel'], notificationTargets: [], updatedBy: 'test' } });
    expect((await preview(s.orderId, 'customer', gerente)).status).toBe(200);
  });

  it('pedido não pago (aguardando o Pix): nada a devolver e sem taxa do cliente', async () => {
    const { r } = await previewOf({ mode: 'custody', orderStatus: 'criado', paid: false, acceptedAt: false }, 'customer');
    expect(r.status).toBe(200);
    expect(r.body).toEqual({ fault: 'customer', customerRefund: 0, feeCharged: 0, motoboyCompensation: 0, compensationPaidBy: null, countsAgainst: 'customer' });
    const d = await previewOf({ mode: 'direct', orderStatus: 'criado', paid: false, acceptedAt: false }, 'store');
    expect(d.r.body).toMatchObject({ customerRefund: 0 });
  });

  it('não pago em custódia com carteira usada: volta só a carteira; culpa do cliente sem taxa nem compensação', async () => {
    const s = await cenarioCancel(DOMAIN, { mode: 'custody', orderStatus: 'criado', paid: false, acceptedAt: false });
    await prisma.order.update({ where: { id: s.orderId }, data: { walletApplied: 7.5 } });
    expect((await preview(s.orderId, 'customer')).body).toEqual({ fault: 'customer', customerRefund: 7.5, feeCharged: 0, motoboyCompensation: 0, compensationPaidBy: null, countsAgainst: 'customer' });
    expect((await preview(s.orderId, 'motoboy')).body).toMatchObject({ customerRefund: 7.5 });
  });

  it('não pago com motoboy e culpa do cliente: zera taxa e compensação', async () => {
    const { r } = await previewOf({ mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'picked', paid: false }, 'customer');
    expect(r.body).toMatchObject({ customerRefund: 0, feeCharged: 0, motoboyCompensation: 0, compensationPaidBy: null });
  });

  it('a prévia não muda nada', async () => {
    const { s } = await previewOf({ mode: 'custody', orderStatus: 'aguardando_motoboy', delivery: 'picked' }, 'store');
    expect((await prisma.order.findUnique({ where: { id: s.orderId } }))?.status).toBe('aguardando_motoboy');
    expect(await prisma.cancellation.count({ where: { orderId: s.orderId } })).toBe(0);
    expect(await prisma.payout.count({ where: { orderId: s.orderId } })).toBe(0);
  });
});
