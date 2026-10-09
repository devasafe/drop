/**
 * Fix round 1 — R26 (revisa R23): com PAYOUT_GATEWAY=asaas, o dinheiro dos repasses está na
 * SUBCONTA do recebedor. `transfer-to-owner` marcava os payouts `paid` sem mover nada da
 * subconta e creditava a carteira virtual, cujo saque (`request-user`, sem payoutIds) o gateway
 * Asaas nunca paga. Agora: transfer-to-owner → 409 USE_PAYOUT_WITHDRAWAL (antes de mexer em
 * qualquer coisa); o saldo antigo sai pelo saque por payouts já existente (/withdrawals/request).
 */
import request from 'supertest';
import app from '../app';
import env from '../config/env';
import { prisma } from '../lib/prisma';
import { encryptSensitiveData } from '../utils/encryption';
import { updatePlatformConfig } from '../repositories/platformConfig.repository';
import { cleanupUsersByEmailDomain, snapshotPlatformConfig } from './helpers/pgCleanup';
import { createTestUser, bearer, TestUser } from './helpers/authUser';
import * as payoutGateway from '../services/payoutGateway';
import * as socketEmitter from '../utils/socketEmitter';

const DOMAIN = '@saas55.test';
const ORDER_PREFIX = 'ord_55_';
const ORIGINAL_OUT = env.PAYOUT_GATEWAY;
let restore: () => Promise<void>;
let seq = 0;
let ceo: TestUser;
const transfer = jest.fn();

beforeAll(async () => { restore = await snapshotPlatformConfig(); });
afterAll(async () => { await restore(); (env as any).PAYOUT_GATEWAY = ORIGINAL_OUT; });
beforeEach(async () => {
  (env as any).PAYOUT_GATEWAY = 'asaas';
  await updatePlatformConfig({ settlementMode: 'direto', autoApproveWithdrawals: false } as any, 'test');
  ceo = await createTestUser('ceo', DOMAIN);
  transfer.mockReset();
  transfer.mockResolvedValue({ status: 'paid', gatewayTransferId: 'tr_55' });
  jest.spyOn(payoutGateway, 'getPayoutGateway').mockReturnValue({ provider: 'asaas', transfer, getStatus: jest.fn() } as any);
  jest.spyOn(socketEmitter, 'emitAdminNotification').mockImplementation(() => {});
});
afterEach(async () => {
  jest.restoreAllMocks();
  (env as any).PAYOUT_GATEWAY = ORIGINAL_OUT;
  await prisma.payout.deleteMany({ where: { orderId: { startsWith: ORDER_PREFIX } } });
  await prisma.withdrawalRequest.deleteMany({ where: { motoboyEmail: { endsWith: DOMAIN } } });
  await cleanupUsersByEmailDomain(DOMAIN);
});

const released = (recipientType: 'store' | 'motoboy', recipientId: string, amount: number) =>
  prisma.payout.create({ data: { recipientType, recipientId, orderId: `${ORDER_PREFIX}${seq++}`, amount, status: 'released', releasedAt: new Date() } });
const SUBACCOUNT = { status: 'active', walletId: 'w', apiKeyEncrypted: encryptSensitiveData('$aact_sub'), pixKey: 'x@pix.com', pixKeyType: 'EMAIL' };

async function lojistaComLoja() {
  const owner = await createTestUser('lojista', DOMAIN);
  const store = await prisma.store.create({ data: { ownerId: owner.userId, name: 'Loja 55', isOpen: true, asaas: SUBACCOUNT } as any });
  await prisma.user.update({ where: { id: owner.userId }, data: { storeId: store.id } });
  return { owner, storeId: store.id };
}
async function motoboyComSubconta() {
  const m = await createTestUser('motoboy', DOMAIN);
  await prisma.user.update({ where: { id: m.userId }, data: { asaas: SUBACCOUNT } as any });
  return m;
}
const userWallet = (userId: string) => prisma.wallet.findUnique({ where: { owner_ownerType: { owner: userId, ownerType: 'user' } } });

describe('R26 — transfer-to-owner com PAYOUT_GATEWAY=asaas', () => {
  for (const mode of ['direto', 'custodia'] as const) {
    it(`${mode}: loja e motoboy → 409 USE_PAYOUT_WITHDRAWAL e nada se move`, async () => {
      await updatePlatformConfig({ settlementMode: mode } as any, 'test');
      const { owner, storeId } = await lojistaComLoja();
      const m = await motoboyComSubconta();
      const ps = await released('store', storeId, 30);
      const pm = await released('motoboy', m.userId, 12);

      const rs = await request(app).post(`/api/wallets/store/${storeId}/transfer-to-owner`).set('Authorization', bearer(owner)).send({});
      const rm = await request(app).post(`/api/wallets/motoboy/${m.userId}/transfer-to-owner`).set('Authorization', bearer(m)).send({});
      for (const r of [rs, rm]) {
        expect(r.status).toBe(409);
        expect(r.body.error?.code).toBe('USE_PAYOUT_WITHDRAWAL');
      }
      expect((await prisma.payout.findUnique({ where: { id: ps.id } }))?.status).toBe('released');
      expect((await prisma.payout.findUnique({ where: { id: pm.id } }))?.status).toBe('released');
      expect(await userWallet(owner.userId)).toBeNull();
      expect(await userWallet(m.userId)).toBeNull();
    });
  }
});

describe('R26 — modo direto: saldo antigo sai pelo saque por payouts', () => {
  it('loja: /withdrawals/request com storeId cria o saque; a aprovação paga e baixa os payouts', async () => {
    const { owner, storeId } = await lojistaComLoja();
    const p1 = await released('store', storeId, 20);
    const p2 = await released('store', storeId, 10);

    const req = await request(app).post('/api/withdrawals/request').set('Authorization', bearer(owner)).send({ amount: 'all', storeId });
    expect(req.status).toBe(200);
    const wr = await prisma.withdrawalRequest.findUnique({ where: { id: req.body.withdrawal._id } });
    expect(wr?.status).toBe('pending');
    expect([...(wr?.payoutIds || [])].sort()).toEqual([p1.id, p2.id].sort());

    const ap = await request(app).post('/api/withdrawals/approve').set('Authorization', bearer(ceo)).send({ withdrawalId: wr!.id });
    expect(ap.status).toBe(200);
    expect(transfer).toHaveBeenCalledTimes(1);
    expect(transfer.mock.calls[0][0]).toMatchObject({ amount: 30 });
    const ps = await prisma.payout.findMany({ where: { id: { in: [p1.id, p2.id] } } });
    expect(ps.every((p) => p.status === 'paid' && p.gatewayTransferId === 'tr_55')).toBe(true);
    expect((await prisma.withdrawalRequest.findUnique({ where: { id: wr!.id } }))?.status).toBe('processed');
  });

  it('motoboy: "Sacar para meu PIX" (/withdrawals/request) cria e a aprovação baixa os payouts', async () => {
    const m = await motoboyComSubconta();
    const p = await released('motoboy', m.userId, 12.5);

    const req = await request(app).post('/api/withdrawals/request').set('Authorization', bearer(m)).send({ amount: 'all' });
    expect(req.status).toBe(200);
    const ap = await request(app).post('/api/withdrawals/approve').set('Authorization', bearer(ceo)).send({ withdrawalId: req.body.withdrawal._id });
    expect(ap.status).toBe(200);
    expect(transfer).toHaveBeenCalledTimes(1);
    const after = await prisma.payout.findUnique({ where: { id: p.id } });
    expect(after?.status).toBe('paid');
  });

  it('sem saldo antigo, o saque por payouts continua fechado no modo direto (404)', async () => {
    const m = await motoboyComSubconta();
    const req = await request(app).post('/api/withdrawals/request').set('Authorization', bearer(m)).send({ amount: 'all' });
    expect(req.status).toBe(404);
    expect(transfer).not.toHaveBeenCalled();
  });
});
