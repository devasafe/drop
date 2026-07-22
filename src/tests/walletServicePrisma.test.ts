/**
 * Fase 3 da migração Postgres/Prisma — núcleo financeiro.
 *
 * Rede de segurança do WalletService em Prisma, escrita ANTES da implementação
 * (exigência do spec). Cobre o contrato que o dinheiro precisa respeitar:
 * crédito, débito, transferência atômica, buckets de payout, concorrência e
 * reconciliação saldo × ledger.
 *
 * ⚠️ Roda contra o PostgreSQL de desenvolvimento (docker compose up -d postgres),
 * igual ao prismaSmoke. A troca por um Postgres efêmero dedicado é a Fase 5.
 * Cada teste usa um `owner` aleatório, então execuções paralelas não colidem.
 */

import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';
import walletService from '../services/wallet.prisma.service';

const owner = () => `own_${Math.random().toString(36).slice(2, 12)}`;
const createdWalletIds: string[] = [];

/** Cria uma carteira já com saldo, registrando-a para limpeza no fim. */
async function walletWith(balance: string, ownerType: 'user' | 'store' | 'motoboy' = 'user') {
  const w = await walletService.getOrCreate(owner(), ownerType);
  createdWalletIds.push(w.id);
  if (balance !== '0') {
    await prisma.wallet.update({
      where: { id: w.id },
      data: { balance: new Prisma.Decimal(balance) },
    });
  }
  return prisma.wallet.findUniqueOrThrow({ where: { id: w.id } });
}

afterAll(async () => {
  await prisma.walletEntry.deleteMany({ where: { walletId: { in: createdWalletIds } } });
  await prisma.wallet.deleteMany({ where: { id: { in: createdWalletIds } } });
  await prisma.$disconnect();
});

describe('WalletService (Prisma)', () => {
  describe('getOrCreate', () => {
    it('cria a carteira na primeira chamada e reusa na segunda', async () => {
      const o = owner();
      const first = await walletService.getOrCreate(o, 'store');
      createdWalletIds.push(first.id);
      const second = await walletService.getOrCreate(o, 'store');

      expect(second.id).toBe(first.id);
      expect(first.balance.toString()).toBe('0');
    });
  });

  describe('credit', () => {
    it('soma ao saldo, acumula totalIncome e registra no ledger', async () => {
      const w = await walletWith('0');

      const updated = await walletService.credit({
        owner: w.owner,
        ownerType: 'user',
        amount: '150.50',
        reason: 'cashback de pedido',
        category: 'deposit',
      });

      expect(updated.balance.toString()).toBe('150.5');
      expect(updated.totalIncome.toString()).toBe('150.5');

      const entries = await prisma.walletEntry.findMany({ where: { walletId: w.id } });
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('credit');
      expect(entries[0].amount.toString()).toBe('150.5');
      expect(entries[0].reason).toBe('cashback de pedido');
    });

    it('rejeita valor zero ou negativo', async () => {
      const w = await walletWith('0');

      await expect(
        walletService.credit({ owner: w.owner, ownerType: 'user', amount: '0', reason: 'x' }),
      ).rejects.toThrow(/positivo/i);

      await expect(
        walletService.credit({ owner: w.owner, ownerType: 'user', amount: '-5', reason: 'x' }),
      ).rejects.toThrow(/positivo/i);
    });
  });

  describe('debit', () => {
    it('subtrai do saldo, acumula totalSpent e registra no ledger', async () => {
      const w = await walletWith('100.00');

      const updated = await walletService.debit({
        owner: w.owner,
        ownerType: 'user',
        amount: '30.25',
        reason: 'pagamento de pedido',
        category: 'payment',
      });

      expect(updated.balance.toString()).toBe('69.75');
      expect(updated.totalSpent.toString()).toBe('30.25');

      const entries = await prisma.walletEntry.findMany({ where: { walletId: w.id } });
      expect(entries).toHaveLength(1);
      expect(entries[0].type).toBe('debit');
    });

    it('recusa saldo insuficiente e NÃO altera nada', async () => {
      const w = await walletWith('10.00');

      await expect(
        walletService.debit({
          owner: w.owner,
          ownerType: 'user',
          amount: '10.01',
          reason: 'excede',
        }),
      ).rejects.toMatchObject({ statusCode: 400 });

      const after = await prisma.wallet.findUniqueOrThrow({ where: { id: w.id } });
      expect(after.balance.toString()).toBe('10');

      const entries = await prisma.walletEntry.findMany({ where: { walletId: w.id } });
      expect(entries).toHaveLength(0);
    });

    it('sob concorrência, nunca deixa o saldo negativo', async () => {
      // 10 débitos de R$10 disputando um saldo de R$50 → exatamente 5 podem passar.
      const w = await walletWith('50.00');

      const results = await Promise.allSettled(
        Array.from({ length: 10 }, () =>
          walletService.debit({
            owner: w.owner,
            ownerType: 'user',
            amount: '10.00',
            reason: 'corrida',
          }),
        ),
      );

      const ok = results.filter((r) => r.status === 'fulfilled').length;
      expect(ok).toBe(5);

      const after = await prisma.wallet.findUniqueOrThrow({ where: { id: w.id } });
      expect(after.balance.toString()).toBe('0');

      const entries = await prisma.walletEntry.findMany({ where: { walletId: w.id } });
      expect(entries).toHaveLength(5);
    });
  });

  describe('transfer', () => {
    it('move o valor entre duas carteiras', async () => {
      const from = await walletWith('200.00');
      const to = await walletWith('0', 'motoboy');

      await walletService.transfer({
        from: { owner: from.owner, ownerType: 'user' },
        to: { owner: to.owner, ownerType: 'motoboy' },
        amount: '75.00',
        reason: 'repasse',
      });

      const fromAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: from.id } });
      const toAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: to.id } });

      expect(fromAfter.balance.toString()).toBe('125');
      expect(toAfter.balance.toString()).toBe('75');
    });

    it('é tudo-ou-nada: origem sem saldo não move nem credita o destino', async () => {
      const from = await walletWith('5.00');
      const to = await walletWith('0', 'store');

      await expect(
        walletService.transfer({
          from: { owner: from.owner, ownerType: 'user' },
          to: { owner: to.owner, ownerType: 'store' },
          amount: '50.00',
          reason: 'repasse impossível',
        }),
      ).rejects.toMatchObject({ statusCode: 400 });

      const fromAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: from.id } });
      const toAfter = await prisma.wallet.findUniqueOrThrow({ where: { id: to.id } });

      expect(fromAfter.balance.toString()).toBe('5');
      expect(toAfter.balance.toString()).toBe('0');
      // nenhum lançamento fantasma no ledger de nenhuma das duas
      const entries = await prisma.walletEntry.findMany({
        where: { walletId: { in: [from.id, to.id] } },
      });
      expect(entries).toHaveLength(0);
    });
  });

  describe('buckets de payout (pending → available)', () => {
    it('holdPending acumula em pendingBalance sem tocar no saldo geral', async () => {
      const w = await walletWith('0', 'store');

      const updated = await walletService.holdPending({
        owner: w.owner,
        ownerType: 'store',
        amount: '80.00',
      });

      expect(updated.pendingBalance.toString()).toBe('80');
      expect(updated.balance.toString()).toBe('0');
    });

    it('releaseToAvailable move de pendingBalance para availableBalance', async () => {
      const w = await walletWith('0', 'motoboy');
      await walletService.holdPending({ owner: w.owner, ownerType: 'motoboy', amount: '40.00' });

      const updated = await walletService.releaseToAvailable({
        owner: w.owner,
        ownerType: 'motoboy',
        amount: '40.00',
      });

      expect(updated.pendingBalance.toString()).toBe('0');
      expect(updated.availableBalance.toString()).toBe('40');
    });

    it('não libera mais do que está pendente', async () => {
      const w = await walletWith('0', 'store');
      await walletService.holdPending({ owner: w.owner, ownerType: 'store', amount: '10.00' });

      await expect(
        walletService.releaseToAvailable({
          owner: w.owner,
          ownerType: 'store',
          amount: '10.01',
        }),
      ).rejects.toMatchObject({ statusCode: 400 });
    });
  });

  describe('reconciliação saldo × ledger', () => {
    it('a soma do ledger bate com o saldo após uma sequência de operações', async () => {
      const w = await walletWith('0');

      await walletService.credit({
        owner: w.owner, ownerType: 'user', amount: '100.00', reason: 'a', category: 'deposit',
      });
      await walletService.debit({
        owner: w.owner, ownerType: 'user', amount: '33.33', reason: 'b', category: 'payment',
      });
      await walletService.credit({
        owner: w.owner, ownerType: 'user', amount: '0.10', reason: 'c', category: 'refund',
      });
      await walletService.debit({
        owner: w.owner, ownerType: 'user', amount: '0.07', reason: 'd', category: 'payment',
      });

      const result = await walletService.reconcile(w.id);

      expect(result.ok).toBe(true);
      expect(result.balance.toString()).toBe('66.7');
      expect(result.ledgerSum.toString()).toBe('66.7');
    });

    it('detecta divergência quando o saldo é adulterado por fora do serviço', async () => {
      const w = await walletWith('0');
      await walletService.credit({
        owner: w.owner, ownerType: 'user', amount: '10.00', reason: 'a', category: 'deposit',
      });

      // simula corrupção: mexe no saldo sem lançar no ledger
      await prisma.wallet.update({
        where: { id: w.id },
        data: { balance: new Prisma.Decimal('999.00') },
      });

      const result = await walletService.reconcile(w.id);
      expect(result.ok).toBe(false);
    });
  });
});
