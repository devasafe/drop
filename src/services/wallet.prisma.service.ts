import { Prisma, OwnerType, Wallet, WalletEntryCategory } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { AppError } from '../utils/AppError';

/**
 * WalletService sobre PostgreSQL/Prisma — Fase 3 da migração.
 *
 * Toda operação que mexe em saldo passa por aqui. A regra de ouro (saldo e ledger
 * mudam juntos, ou nada muda) é garantida pelo banco, via `prisma.$transaction`.
 *
 * ⚠️ AINDA NÃO PLUGADO nos controllers: eles seguem no Mongoose com
 * `src/services/wallet.service.ts`. Ligar este serviço enquanto `Order`/`Payout`
 * vivem no Mongo criaria escrita cruzada entre dois bancos, sem transação comum —
 * dinheiro saindo de um lado sem rollback possível do outro. Os call sites migram
 * na Fase 4, junto com a fatia de pedidos, e aí este arquivo assume o nome oficial
 * `wallet.service.ts`.
 */

type Tx = Prisma.TransactionClient;
type Money = string | number | Prisma.Decimal;

export interface OwnerRef {
  owner: string;
  ownerType: OwnerType;
}

export interface LedgerParams extends OwnerRef {
  amount: Money;
  reason: string;
  category?: WalletEntryCategory;
  reference?: string;
  relatedId?: string;
  paymentMethod?: string;
}

export interface ReconcileResult {
  walletId: string;
  balance: Prisma.Decimal;
  ledgerSum: Prisma.Decimal;
  ok: boolean;
}

/** Converte para Decimal e recusa valores que não fazem sentido em dinheiro. */
function toAmount(value: Money): Prisma.Decimal {
  const decimal = new Prisma.Decimal(value);
  if (decimal.lessThanOrEqualTo(0)) {
    throw new AppError('O valor precisa ser positivo', 400);
  }
  return decimal;
}

/**
 * Débitos concorrentes na MESMA carteira são serializados pelo lock de linha do
 * Postgres — o que é justamente o que garante a corretude. A espera padrão do
 * Prisma (maxWait 2s) é curta demais para isso e faz a operação estourar por
 * contenção, não por saldo. Damos folga: preferimos esperar a fila do que
 * devolver um erro enganoso.
 */
const TX_OPTIONS = { maxWait: 15_000, timeout: 20_000 };

class PrismaWalletService {
  /** Busca a carteira do dono; cria zerada se ainda não existir. */
  async getOrCreate(owner: string, ownerType: OwnerType, tx?: Tx): Promise<Wallet> {
    const db = tx ?? prisma;
    return db.wallet.upsert({
      where: { owner_ownerType: { owner, ownerType } },
      create: { owner, ownerType },
      update: {},
    });
  }

  /**
   * Resolve a carteira e roda `operation` numa transação.
   *
   * O `getOrCreate` fica FORA da transação de propósito: ele trava a linha da
   * carteira, e fazê-lo lá dentro estenderia o lock (e a conexão presa) por toda
   * a operação, serializando o pool inteiro sob concorrência. Assim a transação
   * carrega só o que precisa ser atômico: mexer no saldo e lançar no ledger.
   *
   * Quando o chamador já traz sua própria transação (`tx`), tudo roda dentro dela
   * — quem abriu manda no escopo.
   */
  private async withWallet(
    ref: OwnerRef,
    tx: Tx | undefined,
    operation: (db: Tx, walletId: string) => Promise<Wallet>,
  ): Promise<Wallet> {
    if (tx) {
      const wallet = await this.getOrCreate(ref.owner, ref.ownerType, tx);
      return operation(tx, wallet.id);
    }

    const wallet = await this.getOrCreate(ref.owner, ref.ownerType);
    return prisma.$transaction((db) => operation(db, wallet.id), TX_OPTIONS);
  }

  /**
   * Credita a carteira e lança no ledger, atomicamente.
   * `refund` é tratado como entrada (dinheiro voltando pro dono).
   */
  async credit(params: LedgerParams, tx?: Tx): Promise<Wallet> {
    const amount = toAmount(params.amount);

    const run = async (db: Tx, walletId: string): Promise<Wallet> => {
      await db.walletEntry.create({
        data: {
          walletId,
          type: 'credit',
          category: params.category,
          amount,
          reason: params.reason,
          reference: params.reference,
          relatedId: params.relatedId,
          paymentMethod: params.paymentMethod,
        },
      });

      return db.wallet.update({
        where: { id: walletId },
        data: {
          balance: { increment: amount },
          totalIncome: { increment: amount },
        },
      });
    };

    return this.withWallet(params, tx, run);
  }

  /**
   * Debita a carteira e lança no ledger, atomicamente.
   *
   * A trava de saldo mora no `WHERE balance >= amount` do próprio UPDATE: sob
   * concorrência o Postgres serializa as escritas na linha e reavalia a condição
   * depois do lock, então dois débitos simultâneos nunca derrubam o saldo abaixo
   * de zero. Nada de ler-o-saldo-e-depois-decidir na aplicação.
   */
  async debit(params: LedgerParams, tx?: Tx): Promise<Wallet> {
    const amount = toAmount(params.amount);

    const run = async (db: Tx, walletId: string): Promise<Wallet> => {
      const { count } = await db.wallet.updateMany({
        where: { id: walletId, balance: { gte: amount } },
        data: {
          balance: { decrement: amount },
          totalSpent: { increment: amount },
        },
      });

      if (count === 0) {
        const current = await db.wallet.findUnique({ where: { id: walletId } });
        throw new AppError(
          `Saldo insuficiente: disponível R$ ${current?.balance ?? 0}, necessário R$ ${amount}`,
          400,
        );
      }

      await db.walletEntry.create({
        data: {
          walletId,
          type: 'debit',
          category: params.category,
          amount,
          reason: params.reason,
          reference: params.reference,
          relatedId: params.relatedId,
          paymentMethod: params.paymentMethod,
        },
      });

      return db.wallet.findUniqueOrThrow({ where: { id: walletId } });
    };

    return this.withWallet(params, tx, run);
  }

  /**
   * Move valor entre duas carteiras. Tudo-ou-nada: se o débito da origem não
   * couber, o destino não é creditado e nenhum lançamento sobra no ledger.
   */
  async transfer(params: {
    from: OwnerRef;
    to: OwnerRef;
    amount: Money;
    reason: string;
    reference?: string;
  }): Promise<{ from: Wallet; to: Wallet }> {
    const { from, to, amount, reason, reference } = params;
    const ref = reference ?? `TRF_${Date.now()}`;

    return prisma.$transaction(async (db) => {
      const debited = await this.debit(
        { ...from, amount, reason, category: 'transfer', reference: ref },
        db,
      );
      const credited = await this.credit(
        { ...to, amount, reason, category: 'transfer', reference: ref },
        db,
      );
      return { from: debited, to: credited };
    }, TX_OPTIONS);
  }

  /**
   * Retém valor como pendente (payout criado, ainda não liberado).
   *
   * Os buckets `pendingBalance`/`availableBalance` acompanham a máquina de estados
   * do Payout e NÃO entram no ledger — o ledger espelha `balance`, e misturar os
   * dois quebraria a reconciliação. O dinheiro só entra em `balance` quando é
   * de fato creditado.
   */
  async holdPending(params: OwnerRef & { amount: Money }, tx?: Tx): Promise<Wallet> {
    const amount = toAmount(params.amount);

    return this.withWallet(params, tx, (db, walletId) =>
      db.wallet.update({
        where: { id: walletId },
        data: { pendingBalance: { increment: amount } },
      }),
    );
  }

  /** Libera um valor retido: pendingBalance → availableBalance (sacável). */
  async releaseToAvailable(params: OwnerRef & { amount: Money }, tx?: Tx): Promise<Wallet> {
    const amount = toAmount(params.amount);

    return this.withWallet(params, tx, async (db, walletId) => {
      const { count } = await db.wallet.updateMany({
        where: { id: walletId, pendingBalance: { gte: amount } },
        data: {
          pendingBalance: { decrement: amount },
          availableBalance: { increment: amount },
        },
      });

      if (count === 0) {
        const current = await db.wallet.findUnique({ where: { id: walletId } });
        throw new AppError(
          `Saldo pendente insuficiente: pendente R$ ${current?.pendingBalance ?? 0}, necessário R$ ${amount}`,
          400,
        );
      }

      return db.wallet.findUniqueOrThrow({ where: { id: walletId } });
    });
  }

  /**
   * Confere se o saldo bate com a soma do ledger (créditos − débitos).
   * Divergência significa que alguém mexeu em `balance` por fora do serviço.
   */
  async reconcile(walletId: string): Promise<ReconcileResult> {
    const wallet = await prisma.wallet.findUniqueOrThrow({ where: { id: walletId } });
    const entries = await prisma.walletEntry.findMany({
      where: { walletId },
      select: { type: true, amount: true },
    });

    const ledgerSum = entries.reduce(
      (acc, entry) => (entry.type === 'debit' ? acc.minus(entry.amount) : acc.plus(entry.amount)),
      new Prisma.Decimal(0),
    );

    return {
      walletId,
      balance: wallet.balance,
      ledgerSum,
      ok: wallet.balance.equals(ledgerSum),
    };
  }
}

export const prismaWalletService = new PrismaWalletService();
export default prismaWalletService;
