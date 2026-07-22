import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

const suffix = () => Math.random().toString(36).slice(2, 10);

afterAll(async () => {
  await prisma.$disconnect();
});

describe('Prisma smoke', () => {
  it('cria e lê um User (CRUD básico)', async () => {
    const email = `smoke_${suffix()}@drop.test`;
    const user = await prisma.user.create({
      data: { name: 'Smoke', email, passwordHash: 'x' },
    });
    expect(user.id).toBeTruthy();

    const found = await prisma.user.findUnique({ where: { email } });
    expect(found?.name).toBe('Smoke');

    await prisma.user.delete({ where: { id: user.id } });
  });

  it('guarda dinheiro como Decimal exato (sem erro de float)', async () => {
    const wallet = await prisma.wallet.create({
      data: { owner: `own_${suffix()}`, ownerType: 'platform', balance: '0.10' },
    });
    const updated = await prisma.wallet.update({
      where: { id: wallet.id },
      data: { balance: { increment: new Prisma.Decimal('0.20') } },
    });
    // 0.10 + 0.20 === 0.30 exato (float daria 0.30000000000000004)
    expect(updated.balance.toString()).toBe('0.3');

    await prisma.wallet.delete({ where: { id: wallet.id } });
  });

  it('atualiza carteira e cria WalletEntry atomicamente numa transação', async () => {
    const wallet = await prisma.wallet.create({
      data: { owner: `own_${suffix()}`, ownerType: 'motoboy', balance: '0' },
    });

    const [entry, updatedWallet] = await prisma.$transaction([
      prisma.walletEntry.create({
        data: {
          walletId: wallet.id,
          type: 'credit',
          category: 'deposit',
          amount: '100.00',
          reason: 'smoke test credit',
        },
      }),
      prisma.wallet.update({
        where: { id: wallet.id },
        data: { balance: { increment: new Prisma.Decimal('100.00') } },
      }),
    ]);

    expect(entry.walletId).toBe(wallet.id);
    expect(updatedWallet.balance.toString()).toBe('100');

    // o ledger reconcilia com o saldo
    const entries = await prisma.walletEntry.findMany({ where: { walletId: wallet.id } });
    const sum = entries.reduce((acc, e) => acc.add(e.amount), new Prisma.Decimal(0));
    expect(sum.toString()).toBe(updatedWallet.balance.toString());

    await prisma.walletEntry.deleteMany({ where: { walletId: wallet.id } });
    await prisma.wallet.delete({ where: { id: wallet.id } });
  });

  it('a FK impede um WalletEntry órfão (integridade referencial)', async () => {
    await expect(
      prisma.walletEntry.create({
        data: {
          walletId: 'nao-existe',
          type: 'credit',
          amount: '1.00',
          reason: 'orphan',
        },
      }),
    ).rejects.toThrow();
  });
});
