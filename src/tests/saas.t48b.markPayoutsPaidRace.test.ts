/**
 * Pré-deploy item 3 — a baixa do Payout (released/requested → paid) é condicional:
 * duas transações concorrentes sobre o mesmo repasse → só uma conclui (a outra reverte).
 * Sem isso, o transfer-to-owner reaberto no modo direto (R23) creditaria em dobro.
 */
import { prisma } from '../lib/prisma';
import { payoutService } from '../services/payout.service';

const ORDER_PREFIX = 'ord_48b_';
const OWNER = 'mb48b';
afterEach(async () => {
  await prisma.payout.deleteMany({ where: { orderId: { startsWith: ORDER_PREFIX } } });
  await prisma.walletEntry.deleteMany({ where: { wallet: { owner: OWNER } } });
  await prisma.wallet.deleteMany({ where: { owner: OWNER } });
});

it('markPayoutsPaid concorrente no mesmo payout: só uma transação conclui', async () => {
  // Carteira de repasse já existe (caso real): a corrida fica só na baixa do payout.
  await prisma.wallet.create({ data: { owner: OWNER, ownerType: 'motoboy', availableBalance: 10 } });
  const p = await prisma.payout.create({
    data: { recipientType: 'motoboy', recipientId: OWNER, orderId: `${ORDER_PREFIX}1`, amount: 10, status: 'released', releasedAt: new Date() },
  });
  // Interleaving controlado: as duas transações leem o payout (released) ANTES de qualquer baixa.
  let reads = 0;
  let release!: () => void;
  const bothRead = new Promise<void>((r) => { release = r; });
  const orig = payoutService.markPayoutsPaid.bind(payoutService);
  const run = () => prisma.$transaction(async (tx) => {
    await tx.payout.findUnique({ where: { id: p.id } });
    if (++reads === 2) release();
    await bothRead;
    return orig([p.id], `t-${Math.random()}`, tx, { skipCashboxDebit: true });
  });
  const results = await Promise.allSettled([run(), run()]);
  expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
  expect((await prisma.payout.findUnique({ where: { id: p.id } }))!.status).toBe('paid');
  // O balde availableBalance só foi debitado uma vez.
  const w = await prisma.wallet.findUnique({ where: { owner_ownerType: { owner: OWNER, ownerType: 'motoboy' } } });
  expect(Number(w!.availableBalance)).toBe(0);
});
