/**
 * D3b-4b · Mensalidades (spec 6.1). Só leitura, calculado na hora a partir de StoreSaasBilling,
 * SaasBillingPayment e effectiveFee (sem tabela nova). Só existe no modo direto.
 *
 * Mês = mês civil de São Paulo (−03:00 fixo, a mesma premissa de moneyOverview.service). Dois tipos de data:
 * - dueDate e o paidAt que vem do Asaas são DATAS gravadas às 00:00Z (payments.asaasDate): o mês delas é o
 *   do calendário. Lidas no fuso de SP, o dia 1º cairia no mês anterior.
 * - o paidAt de reserva (`new Date()` quando o Asaas não manda data) é um INSTANTE: o mês dele é o de SP.
 * mrr, byStatus, trialsEndingIn7Days e overdue são de agora; só receivedThisMonth e invoices seguem o mês.
 * Dinheiro somado em centavos inteiros (toCents) e convertido só na saída.
 */
import { Prisma, SaasBillingStatus } from '@prisma/client';
import { prisma } from '../lib/prisma';
import { ValidationError } from '../utils/AppError';
import { getSaasConfig } from '../utils/settlement';
import { saoPauloToday } from './asaasLoja/charge';
import { effectiveFee } from './saasBilling/policy';
import { SAAS_PAID_STATUSES } from './saasBilling/payments';
import {
  decodeMoneyCursor, encodeMoneyCursor, fromCents, MONEY_PAGE_SIZE, MoneyCursor, toCents,
} from './moneyOverview.service';

/** Mês de São Paulo: AAAA-MM. */
export const SP_MONTH_RE = /^\d{4}-(0[1-9]|1[0-2])$/;
const MIN_YEAR = 2000;
const MAX_YEAR = 2100;
const DAY_MS = 24 * 60 * 60 * 1000;
const TRIAL_SOON_MS = 7 * DAY_MS;
const SAAS_STATUSES = Object.values(SaasBillingStatus) as SaasBillingStatus[];

export interface SaasMonthRange {
  month: string;
  dateStart: Date; // datas (00:00Z): incluso
  dateEnd: Date; // excluso
  instantStart: Date; // instantes (SP): incluso
  instantEnd: Date; // excluso
}

export interface SaasInvoice {
  id: string;
  storeId: string;
  storeName: string;
  value: number;
  dueDate: string; // AAAA-MM-DD (data do Asaas)
  status: string; // como o Asaas manda, mais 'DELETED'
  paidAt: string | null;
}

export interface SaasInvoicePage {
  items: SaasInvoice[];
  nextCursor: string | null;
}

export interface SaasRevenueDirect {
  mode: 'direto';
  month: string;
  mrr: number;
  receivedThisMonth: number;
  overdue: { stores: number; amount: number };
  byStatus: Record<SaasBillingStatus, number>;
  trialsEndingIn7Days: number;
  invoices: SaasInvoicePage;
}

export type SaasRevenue = { mode: 'custodia' } | SaasRevenueDirect;

export interface SaasRevenueQuery {
  month?: string;
  cursor?: string;
}

/** 'AAAA-MM' válido → as duas janelas do mês; inválido (ou fora de 2000–2100) → 400. */
export function saasMonthRange(month: string): SaasMonthRange {
  const year = Number(month.slice(0, 4));
  if (!SP_MONTH_RE.test(month) || year < MIN_YEAR || year > MAX_YEAR) {
    throw new ValidationError('Mês inválido (use AAAA-MM)');
  }
  const m = Number(month.slice(5, 7));
  const next = m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, '0')}`;
  return {
    month,
    dateStart: new Date(`${month}-01T00:00:00.000Z`),
    dateEnd: new Date(`${next}-01T00:00:00.000Z`),
    instantStart: new Date(`${month}-01T00:00:00.000-03:00`),
    instantEnd: new Date(`${next}-01T00:00:00.000-03:00`),
  };
}

/**
 * Mês de São Paulo de um paidAt. 00:00:00.000Z exato = data do Asaas → mês do calendário; o resto é
 * instante → mês em SP. (Um instante cravado em 00:00:00.000Z seria lido como data; o DROP não grava assim.)
 */
export function paidMonthOf(paidAt: Date): string {
  const iso = paidAt.toISOString();
  return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 7) : saoPauloToday(paidAt).slice(0, 7);
}

async function listInvoices(range: SaasMonthRange, cursor: MoneyCursor | null): Promise<SaasInvoicePage> {
  const and: Prisma.SaasBillingPaymentWhereInput[] = [{ dueDate: { gte: range.dateStart, lt: range.dateEnd } }];
  if (cursor) and.push({ OR: [{ dueDate: { gt: cursor.at } }, { dueDate: cursor.at, id: { gt: cursor.id } }] });
  const rows = await prisma.saasBillingPayment.findMany({
    where: { AND: and },
    orderBy: [{ dueDate: 'asc' }, { id: 'asc' }],
    take: MONEY_PAGE_SIZE + 1,
    select: {
      id: true, value: true, dueDate: true, status: true, paidAt: true,
      billing: { select: { storeId: true, store: { select: { name: true } } } },
    },
  });
  const page = rows.slice(0, MONEY_PAGE_SIZE);
  const last = page[page.length - 1];
  return {
    items: page.map((r) => ({
      id: r.id,
      storeId: r.billing.storeId,
      storeName: r.billing.store.name,
      value: fromCents(toCents(r.value)),
      dueDate: r.dueDate.toISOString().slice(0, 10),
      status: r.status,
      paidAt: r.paidAt ? r.paidAt.toISOString() : null,
    })),
    nextCursor: rows.length > MONEY_PAGE_SIZE ? encodeMoneyCursor(last.dueDate, last.id) : null,
  };
}

export async function getSaasRevenue(query: SaasRevenueQuery = {}, now: Date = new Date()): Promise<SaasRevenue> {
  const range = saasMonthRange(query.month ?? saoPauloToday(now).slice(0, 7));
  const cursor = query.cursor ? decodeMoneyCursor(query.cursor) : null;
  const cfg = await getSaasConfig();
  if (cfg.settlementMode !== 'direto') return { mode: 'custodia' };

  const [paying, groups, trialsEndingIn7Days, overdueSum, paidRows, invoices] = await Promise.all([
    prisma.storeSaasBilling.findMany({ where: { status: { in: ['active', 'past_due'] } }, select: { customFee: true } }),
    prisma.storeSaasBilling.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.storeSaasBilling.count({
      where: { status: 'trialing', trialEndsAt: { gt: now, lte: new Date(now.getTime() + TRIAL_SOON_MS) } },
    }),
    prisma.saasBillingPayment.aggregate({
      where: { status: 'OVERDUE', billing: { status: 'past_due' } },
      _sum: { value: true },
    }),
    // União das duas janelas (datas começam 3 h antes; instantes acabam 3 h depois); paidMonthOf decide.
    prisma.saasBillingPayment.findMany({
      where: { status: { in: SAAS_PAID_STATUSES }, paidAt: { gte: range.dateStart, lt: range.instantEnd } },
      select: { paidAt: true, value: true },
    }),
    listInvoices(range, cursor),
  ]);

  const byStatus = Object.fromEntries(SAAS_STATUSES.map((s) => [s, 0])) as Record<SaasBillingStatus, number>;
  for (const g of groups) byStatus[g.status] = g._count._all;

  const mrrCents = paying.reduce((sum, b) => sum + toCents(effectiveFee(b, cfg)), 0);
  const receivedCents = paidRows
    .filter((r) => r.paidAt && paidMonthOf(r.paidAt) === range.month)
    .reduce((sum, r) => sum + toCents(r.value), 0);

  return {
    mode: 'direto',
    month: range.month,
    mrr: fromCents(mrrCents),
    receivedThisMonth: fromCents(receivedCents),
    overdue: { stores: byStatus.past_due, amount: fromCents(toCents(overdueSum._sum.value)) },
    byStatus,
    trialsEndingIn7Days,
    invoices,
  };
}
