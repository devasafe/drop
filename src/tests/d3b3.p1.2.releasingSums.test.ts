/**
 * D3b-3 · P1.2 — o estado `releasing` (transferência em voo) continua contando como dinheiro
 * em aberto em todas as somas, nunca é liberável/sacável/pagável por outro caminho e o
 * cancelamento do pedido escala para revisão manual em vez de cancelar por cima.
 */
import { prisma } from '../lib/prisma';
import { cleanupUsersByEmailDomain } from './helpers/pgCleanup';
import { createTestUser, TestUser } from './helpers/authUser';
import { createPayout, createWallet, findWallet, findPayoutById } from './helpers/financePg';
import { fakeObjectId } from './helpers/ids';
import payoutService from '../services/payout.service';
import { countOpenCustody } from '../services/settlementSwitch';
import { hasCustodyLeftover } from '../services/custodyLeftover';
import { reconcileFromPayouts } from '../controllers/walletController';
import { ensurePlatformConfig } from '../repositories/platformConfig.repository';

const DOMAIN = '@d3b3p12.test';
let motoboy: TestUser;

beforeEach(async () => {
  motoboy = await createTestUser('motoboy', DOMAIN);
});
afterEach(async () => {
  await cleanupUsersByEmailDomain(DOMAIN);
});

const cents = (n: number) => Math.round(n * 100);

describe('releasing conta como dinheiro em aberto', () => {
  it('obrigações abertas (caixa e /payouts/admin/obligations) somam o releasing', async () => {
    const before = await payoutService.getPendingObligations();
    await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 12.34, status: 'releasing' });
    const after = await payoutService.getPendingObligations();
    expect(cents(after) - cents(before)).toBe(1234);
  });

  it('countOpenCustody (menu do modo direto e prévia da troca de modo) conta o releasing', async () => {
    const before = await countOpenCustody();
    await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 5, status: 'releasing' });
    const after = await countOpenCustody();
    expect(after.openPayouts - before.openPayouts).toBe(1);
  });

  it('hasCustodyLeftover vê o repasse releasing como saldo da custódia', async () => {
    await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 5, status: 'cancelled' });
    expect(await hasCustodyLeftover(motoboy.userId)).toBe(false);
    await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 5, status: 'releasing' });
    expect(await hasCustodyLeftover(motoboy.userId)).toBe(true);
  });

  it('resumo do recebedor: releasing entra no pendente e no total ganho', async () => {
    await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 10, status: 'pending' });
    await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 5.5, status: 'releasing' });
    await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 3, status: 'released' });
    const s = await payoutService.getEarningsSummary('motoboy', motoboy.userId);
    expect(cents(s.pending)).toBe(1550);
    expect(cents(s.available)).toBe(300);
    expect(cents(s.totalEarned)).toBe(1850);
  });

  it('reconciliação da carteira: releasing fica no pendingBalance', async () => {
    const w = await createWallet({ owner: motoboy.userId, ownerType: 'motoboy' });
    await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 10, status: 'pending' });
    await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 4, status: 'releasing' });
    const r = await reconcileFromPayouts('motoboy', motoboy.userId, w._id);
    expect(cents(r.pendingBalance)).toBe(1400);
    expect(cents(r.availableBalance)).toBe(0);
    expect(cents((await findWallet({ owner: motoboy.userId, ownerType: 'motoboy' })).pendingBalance)).toBe(1400);
  });
});

describe('releasing não é liberável, sacável nem pagável por outro caminho', () => {
  it('continua: saque não enxerga releasing e marcar pago recusa', async () => {
    const p = await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 7, status: 'releasing' });
    expect(await payoutService.listAvailablePayouts('motoboy', motoboy.userId)).toHaveLength(0);
    await expect(payoutService.markPayoutsPaid([p._id], 'tr_x', undefined, { skipCashboxDebit: true })).rejects.toThrow(/não está em status pagável/);
    expect((await findPayoutById(p._id)).status).toBe('releasing');
  });

  it('continua: releasePayout (legado) recusa releasing e não mexe nos saldos', async () => {
    await createWallet({ owner: motoboy.userId, ownerType: 'motoboy', pendingBalance: 7 });
    const p = await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId: fakeObjectId(), amount: 7, status: 'releasing' });
    await expect(payoutService.releasePayout(p._id)).rejects.toThrow(/não está pending/);
    const w = await findWallet({ owner: motoboy.userId, ownerType: 'motoboy' });
    expect(w.pendingBalance).toBe(7);
    expect(w.availableBalance).toBe(0);
  });

  it('continua: liberação automática legada pula o releasing e libera só o pending do pedido', async () => {
    await ensurePlatformConfig('test');
    const cfg = await prisma.platformConfig.findFirst();
    const previous = cfg!.autoApprovePayouts;
    await prisma.platformConfig.updateMany({ data: { autoApprovePayouts: true } });
    try {
      await createWallet({ owner: motoboy.userId, ownerType: 'motoboy', pendingBalance: 15 });
      const orderId = fakeObjectId();
      const emVoo = await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId, amount: 10, status: 'releasing' });
      const livre = await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId, amount: 5, status: 'pending' });
      await payoutService.releasePayoutsForOrder(orderId);
      expect((await findPayoutById(emVoo._id)).status).toBe('releasing');
      expect((await findPayoutById(livre._id)).status).toBe('released');
      const w = await findWallet({ owner: motoboy.userId, ownerType: 'motoboy' });
      expect(w.pendingBalance).toBe(10);
      expect(w.availableBalance).toBe(5);
    } finally {
      await prisma.platformConfig.updateMany({ data: { autoApprovePayouts: previous } });
    }
  });

  it('cancelar o pedido com repasse releasing devolve erro (revisão manual) e não cancela por cima', async () => {
    const orderId = fakeObjectId();
    const emVoo = await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId, amount: 10, status: 'releasing' });
    const result = await prisma.$transaction((tx) => payoutService.cancelPayoutsForOrder(orderId, 'order_cancelled', tx));
    expect(result.errors).toEqual([{ payoutId: emVoo._id, status: 'releasing' }]);
    expect(result.cancelled).toBe(0);
    expect((await findPayoutById(emVoo._id)).status).toBe('releasing');
  });

  it('cancelar continua cancelando pending e released do mesmo jeito', async () => {
    await createWallet({ owner: motoboy.userId, ownerType: 'motoboy', pendingBalance: 4, availableBalance: 6 });
    const orderId = fakeObjectId();
    await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId, amount: 4, status: 'pending' });
    await createPayout({ recipientType: 'motoboy', recipientId: motoboy.userId, orderId, amount: 6, status: 'released' });
    const result = await prisma.$transaction((tx) => payoutService.cancelPayoutsForOrder(orderId, 'order_cancelled', tx));
    expect(result).toEqual({ cancelled: 2, errors: [] });
    const w = await findWallet({ owner: motoboy.userId, ownerType: 'motoboy' });
    expect(w.pendingBalance).toBe(0);
    expect(w.availableBalance).toBe(0);
  });
});
