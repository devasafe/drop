import { prisma } from '../../lib/prisma';

/** São Paulo = UTC−3 o ano todo (sem horário de verão desde 2019). */
const SP_OFFSET_HOURS = 3;
const STUCK_STATUSES = ['failed', 'failed_final', 'uncertain'];

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Início (incluso) e fim (excluso) do mês `YYYY-MM` no fuso de São Paulo, em UTC. Sem mês: o atual em SP. */
export function monthRangeSaoPaulo(month?: string, now = new Date()): { month: string; start: Date; end: Date } {
  let y: number;
  let m: number; // 1..12
  if (month) {
    [y, m] = month.split('-').map(Number);
  } else {
    const sp = new Date(now.getTime() - SP_OFFSET_HOURS * 3600_000);
    y = sp.getUTCFullYear();
    m = sp.getUTCMonth() + 1;
  }
  const start = new Date(Date.UTC(y, m - 1, 1, SP_OFFSET_HOURS));
  const end = new Date(Date.UTC(y, m, 1, SP_OFFSET_HOURS));
  return { month: `${y}-${String(m).padStart(2, '0')}`, start, end };
}

/**
 * Resumo do mês da loja no modo direto, só com o nosso banco (não lê tarifas do Asaas da loja).
 * - pedidos `asaas_loja` pagos no mês (`paidAt`; pedido anterior ao campo usa `createdAt`);
 * - Pix aos motoboys concluídos no mês + quantos estão parados AGORA (pede ação, sem filtro de mês);
 * - estornos `DirectRefund` concluídos no mês.
 */
export async function directMonthSummary(storeId: string, month?: string) {
  const range = monthRangeSaoPaulo(month);
  const inMonth = { gte: range.start, lt: range.end };

  const [orders, sent, stuckCount, refunds] = await Promise.all([
    prisma.order.aggregate({
      where: {
        storeId,
        paymentProvider: 'asaas_loja',
        paymentStatus: { in: ['paid', 'refunded'] },
        OR: [{ paidAt: inMonth }, { paidAt: null, createdAt: inMonth }],
      },
      _count: { _all: true },
      _sum: { totalValue: true },
    }),
    prisma.motoboyTransfer.aggregate({
      where: { storeId, status: 'done', doneAt: inMonth },
      _count: { _all: true },
      _sum: { amount: true },
    }),
    prisma.motoboyTransfer.count({ where: { storeId, status: { in: STUCK_STATUSES } } }),
    prisma.directRefund.aggregate({
      where: { storeId, status: 'done', doneAt: inMonth },
      _count: { _all: true },
      _sum: { amount: true },
    }),
  ]);

  return {
    month: range.month,
    ordersPaid: { count: orders._count._all, total: round2(Number(orders._sum.totalValue ?? 0)) },
    motoboyPix: { sentCount: sent._count._all, sentTotal: round2(Number(sent._sum.amount ?? 0)), stuckCount },
    refunds: { count: refunds._count._all, total: round2(Number(refunds._sum.amount ?? 0)) },
  };
}
