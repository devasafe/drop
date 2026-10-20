/**
 * D3b-1 · "Precisa de mim" (spec 3.1): a fila do que espera uma pessoa da equipe.
 *
 * Cada tipo é uma leitura própria e roda isolada (Promise.allSettled): um tipo que falha volta
 * com `error` e sem itens, e os outros aparecem. Tipo sem a permissão do assunto não roda nem vem.
 * Todo tipo visível vem na resposta, mesmo com contagem 0 (a tela esconde os zerados).
 * Itens: até 5, os mais antigos primeiro. Verificações e repasses são contagens (1 item-resumo).
 */
import { Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma';
import logger from '../../config/logger';
import { QueueGroup, QueueGroupEntry, QueueItem, QueueResponse, QueueType } from './types';
import { ACTIVE_ORDER_STATUSES, MIN_MS, OpsLimits, PermissionCheck, brl, shortOrderId } from './common';

export const QUEUE_ITEMS_MAX = 5;

export interface QueueContext {
  now: Date;
  limits: OpsLimits;
  can: PermissionCheck;
}
export interface QueueLoad {
  count: number;
  items: QueueItem[];
}
export type QueueLoader = (ctx: QueueContext) => Promise<QueueLoad>;

interface QueueTypeDef {
  type: QueueType;
  group: QueueGroup;
  /** Só para a mensagem de erro "Não deu para carregar <label>", que a tela mostra como veio (g.error). */
  label: string;
  visible: (can: PermissionCheck) => boolean;
}

const GROUP_ORDER: QueueGroup[] = ['customer_money', 'person_waiting', 'revenue', 'operation'];

const canReviewAny = (can: PermissionCheck) =>
  can('verification:review_clients') || can('verification:review_stores') || can('verification:review_motoboys');

/** Tabela da spec 3.1, na ordem da spec (desempate dentro do grupo quando não há itens). */
export const QUEUE_TYPES: readonly QueueTypeDef[] = [
  { type: 'refund', group: 'customer_money', label: 'estornos', visible: (can) => can('payout:view') },
  { type: 'withdrawal', group: 'person_waiting', label: 'saques', visible: (can) => can('withdrawal:view') },
  { type: 'motoboy_transfer', group: 'person_waiting', label: 'Pix aos motoboys', visible: (can) => can('payout:view') },
  { type: 'verification', group: 'person_waiting', label: 'verificações', visible: canReviewAny },
  { type: 'support', group: 'person_waiting', label: 'suporte', visible: (can) => can('support:attend') },
  { type: 'payout', group: 'revenue', label: 'repasses', visible: (can) => can('payout:view') },
  { type: 'plan_change', group: 'revenue', label: 'trocas de plano', visible: (can) => can('plan:view') },
  { type: 'order_no_motoboy', group: 'operation', label: 'pedidos sem motoboy', visible: (can) => can('operation:view') },
  { type: 'order_store_late', group: 'operation', label: 'pedidos parados na loja', visible: (can) => can('operation:view') },
];

const iso = (d: Date) => d.toISOString();
const ageMin = (since: Date, now: Date) => Math.max(0, Math.floor((now.getTime() - since.getTime()) / MIN_MS));
const byOldest = (a: QueueItem, b: QueueItem) => a.since.localeCompare(b.since);

// ─── Dinheiro do cliente ─────────────────────────────────────────────────

const DIRECT_REFUND_OPEN = ['pending', 'failed', 'failed_final', 'uncertain'];
const DIRECT_REFUND_TITLE: Record<string, string> = {
  pending: 'Estorno parado',
  failed: 'Estorno falhou',
  failed_final: 'Estorno falhou de vez',
  uncertain: 'Estorno incerto',
};

/** Estorno de custódia não concluído (Cancellation com valor a devolver). Pedido direto fica com o DirectRefund. */
async function custodyRefundsOpen() {
  const rows = await prisma.cancellation.findMany({
    where: { refundStatus: { in: ['pending', 'failed'] }, refundAmount: { gt: 0 } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, orderId: true, refundAmount: true, refundStatus: true, createdAt: true },
  });
  if (rows.length === 0) return rows;
  const direct = await prisma.order.findMany({
    where: { id: { in: rows.map((r) => r.orderId) }, paymentProvider: 'asaas_loja' },
    select: { id: true },
  });
  const directIds = new Set(direct.map((o) => o.id));
  return rows.filter((r) => !directIds.has(r.orderId));
}

async function loadRefunds(): Promise<QueueLoad> {
  const where: Prisma.DirectRefundWhereInput = { status: { in: DIRECT_REFUND_OPEN } };
  const [directCount, direct, custody] = await Promise.all([
    prisma.directRefund.count({ where }),
    prisma.directRefund.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: QUEUE_ITEMS_MAX,
      select: { id: true, orderId: true, amount: true, status: true, createdAt: true },
    }),
    custodyRefundsOpen(),
  ]);
  const items = [
    ...direct.map((r): QueueItem => ({
      id: `dr:${r.id}`,
      title: DIRECT_REFUND_TITLE[r.status] ?? 'Estorno parado',
      context: `Pedido #${shortOrderId(r.orderId)} · ${brl(r.amount)}`,
      since: iso(r.createdAt),
      tag: 'Urgente',
      href: '/admin/estornos',
    })),
    ...custody.slice(0, QUEUE_ITEMS_MAX).map((c): QueueItem => ({
      id: `cx:${c.id}`,
      title: c.refundStatus === 'failed' ? 'Estorno falhou' : 'Estorno parado',
      context: `Pedido #${shortOrderId(c.orderId)} · ${brl(c.refundAmount)} · custódia`,
      since: iso(c.createdAt),
      tag: 'Urgente',
      href: `/admin/pedidos/${c.orderId}`,
    })),
  ];
  return { count: directCount + custody.length, items: items.sort(byOldest).slice(0, QUEUE_ITEMS_MAX) };
}

// ─── Pessoa esperando ────────────────────────────────────────────────────

async function loadWithdrawals(): Promise<QueueLoad> {
  const where: Prisma.WithdrawalRequestWhereInput = {
    OR: [{ status: 'pending' }, { status: 'approved', uncertainAt: { not: null } }],
  };
  const [count, rows] = await Promise.all([
    prisma.withdrawalRequest.count({ where }),
    prisma.withdrawalRequest.findMany({
      where,
      orderBy: { requestedAt: 'asc' },
      take: QUEUE_ITEMS_MAX,
      select: { id: true, motoboyName: true, amount: true, status: true, requestedAt: true },
    }),
  ]);
  return {
    count,
    items: rows.map((w): QueueItem => ({
      id: `wr:${w.id}`,
      title: w.status === 'pending' ? `Saque de ${w.motoboyName}` : `Saque incerto de ${w.motoboyName}`,
      context: w.status === 'pending' ? `${brl(w.amount)} · esperando aprovação` : `${brl(w.amount)} · conferir no Asaas`,
      since: iso(w.requestedAt),
      tag: 'Esperando',
      href: '/admin/withdrawals',
    })),
  };
}

/**
 * Pix ao motoboy que espera alguém: falhou (failed/failed_final). Inclui o Pix manual do DROP
 * (payer 'platform', compensação do cancelamento do admin no SaaS), que nasce failed_final com
 * lastError 'PLATFORM_MANUAL_PIX'. O "Resolver" de /admin/transfers grava 'done' e tira da fila.
 */
async function loadMotoboyTransfers(): Promise<QueueLoad> {
  const where: Prisma.MotoboyTransferWhereInput = { status: { in: ['failed', 'failed_final'] } };
  const [count, rows] = await Promise.all([
    prisma.motoboyTransfer.count({ where }),
    prisma.motoboyTransfer.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: QUEUE_ITEMS_MAX,
      select: { id: true, orderId: true, amount: true, status: true, payer: true, firstFailedAt: true, createdAt: true },
    }),
  ]);
  const items = rows.map((t): QueueItem => ({
    id: `mt:${t.id}`,
    title: t.payer === 'platform'
      ? 'Pix manual do DROP ao motoboy'
      : t.status === 'failed_final' ? 'Pix ao motoboy falhou de vez' : 'Pix ao motoboy falhou',
    context: `Pedido #${shortOrderId(t.orderId)} · ${brl(t.amount)}`,
    since: iso(t.firstFailedAt ?? t.createdAt),
    tag: 'Urgente',
    href: '/admin/transfers',
  }));
  return { count, items: items.sort(byOldest) };
}

/** Mesmas consultas de GET /badges (badgesController), cada uma só com a permissão de quem revisa. */
async function loadVerifications({ now, can }: QueueContext): Promise<QueueLoad> {
  const pending = (path: string[]) => prisma.user.count({ where: { verification: { path, equals: 'pending' } } });
  const [clients, facial, courier, stores] = await Promise.all([
    can('verification:review_clients') ? pending(['document', 'status']) : 0,
    can('verification:review_stores') ? pending(['facial', 'status']) : 0,
    can('verification:review_motoboys') ? pending(['courier', 'status']) : 0,
    can('verification:review_stores')
      ? prisma.store.count({
          where: {
            OR: [
              { verification: { path: ['cnpj', 'status'], equals: 'pending' } },
              { verification: { path: ['address', 'status'], equals: 'pending' } },
            ],
          },
        })
      : 0,
  ]);
  const count = clients + facial + courier + stores;
  if (count === 0) return { count, items: [] };
  const parts: string[] = [];
  if (clients) parts.push(`Clientes ${clients}`);
  if (facial + stores) parts.push(`Lojas ${facial + stores}`);
  if (courier) parts.push(`Motoboys ${courier}`);
  return {
    count,
    items: [{
      id: 'verification',
      title: count === 1 ? '1 verificação pendente' : `${count} verificações pendentes`,
      context: parts.join(' · '),
      since: iso(now),
      tag: 'KYC',
      href: '/admin/verificacoes',
    }],
  };
}

const SUPPORT_CATEGORY_LABEL: Record<string, string> = {
  clientes: 'Clientes',
  lojistas: 'Lojistas',
  motoboys: 'Motoboys',
  geral: 'Geral',
};

async function loadSupport(): Promise<QueueLoad> {
  const where: Prisma.SupportTicketWhereInput = {
    status: 'aberto',
    OR: [{ assignedTo: { equals: Prisma.AnyNull } }, { assignedTo: { equals: [] } }],
  };
  const [count, rows] = await Promise.all([
    prisma.supportTicket.count({ where }),
    prisma.supportTicket.findMany({
      where,
      orderBy: { createdAt: 'asc' },
      take: QUEUE_ITEMS_MAX,
      select: { id: true, subject: true, category: true, createdAt: true },
    }),
  ]);
  return {
    count,
    items: rows.map((t): QueueItem => ({
      id: `st:${t.id}`,
      title: t.subject,
      context: `Suporte · ${SUPPORT_CATEGORY_LABEL[t.category] ?? t.category} · sem atendente`,
      since: iso(t.createdAt),
      tag: 'Suporte',
      href: '/admin/suporte',
    })),
  };
}

// ─── Receita ─────────────────────────────────────────────────────────────

async function loadPayouts({ now }: QueueContext): Promise<QueueLoad> {
  const rows = await prisma.payout.groupBy({
    by: ['blocked'],
    where: { status: 'pending' },
    _count: { _all: true },
    _sum: { amount: true },
    _min: { createdAt: true },
  });
  const readyCount = rows.find((r) => !r.blocked)?._count._all ?? 0;
  const blockedCount = rows.find((r) => r.blocked)?._count._all ?? 0;
  const count = readyCount + blockedCount;
  if (count === 0) return { count, items: [] };
  const total = rows.reduce((sum, r) => sum + Number(r._sum.amount ?? 0), 0);
  const oldest = rows
    .map((r) => r._min.createdAt)
    .filter((d): d is Date => !!d)
    .sort((a, b) => a.getTime() - b.getTime())[0];
  return {
    count,
    items: [{
      id: 'payout',
      title: count === 1 ? '1 repasse a liberar' : `${count} repasses a liberar`,
      context: `${readyCount} prontos · ${blockedCount} bloqueados · ${brl(total)}`,
      since: iso(oldest ?? now),
      tag: 'Lote',
      href: '/admin/payouts',
    }],
  };
}

const PLAN_LABEL: Record<string, string> = { plan1: 'Plano 1', plan2: 'Plano 2', plan3: 'Plano 3' };

async function loadPlanChanges(): Promise<QueueLoad> {
  const where: Prisma.StoreSubscriptionWhereInput = { planChangeStatus: 'pending' };
  const [count, rows] = await Promise.all([
    prisma.storeSubscription.count({ where }),
    prisma.storeSubscription.findMany({
      where,
      orderBy: [{ requestedAt: 'asc' }, { updatedAt: 'asc' }],
      take: QUEUE_ITEMS_MAX,
      select: { id: true, storeName: true, currentPlan: true, requestedPlan: true, requestedAt: true, updatedAt: true },
    }),
  ]);
  const items = rows.map((s): QueueItem => ({
    id: `sub:${s.id}`,
    title: `Troca de plano · ${s.storeName}`,
    context: `${PLAN_LABEL[s.currentPlan] ?? s.currentPlan} → ${s.requestedPlan ? PLAN_LABEL[s.requestedPlan] ?? s.requestedPlan : '—'}`,
    since: iso(s.requestedAt ?? s.updatedAt),
    tag: 'Receita',
    href: '/admin/plan-approvals',
  }));
  return { count, items: items.sort(byOldest) };
}

// ─── Operação ────────────────────────────────────────────────────────────

/** Pedido em andamento sem motoboy além do pool, ou com o cliente decidindo (um item por pedido). */
async function loadOrdersWithoutMotoboy({ now, limits }: QueueContext): Promise<QueueLoad> {
  const cutoff = new Date(now.getTime() - limits.poolTimeoutMin * MIN_MS);
  const [stale, deciding] = await Promise.all([
    prisma.delivery.findMany({
      where: { status: 'pending', motoboyId: null, createdAt: { lt: cutoff } },
      select: { orderId: true, createdAt: true },
    }),
    prisma.order.findMany({
      where: { awaitingCustomerPoolDecision: true, status: { in: ACTIVE_ORDER_STATUSES } },
      select: { id: true },
    }),
  ]);
  const poolSince = new Map<string, Date>();
  for (const d of stale) {
    const current = poolSince.get(d.orderId);
    if (!current || d.createdAt < current) poolSince.set(d.orderId, d.createdAt);
  }
  const ids = Array.from(new Set([...poolSince.keys(), ...deciding.map((o) => o.id)]));
  if (ids.length === 0) return { count: 0, items: [] };

  const orders = await prisma.order.findMany({
    where: { id: { in: ids }, status: { in: ACTIVE_ORDER_STATUSES } },
    select: { id: true, createdAt: true, awaitingCustomerPoolDecision: true, store: { select: { name: true } } },
  });
  const items = orders
    .map((o): QueueItem => {
      const since = poolSince.get(o.id) ?? o.createdAt;
      return {
        id: `ord:${o.id}`,
        title: `Pedido #${shortOrderId(o.id)} sem motoboy`,
        context: o.awaitingCustomerPoolDecision
          ? `${o.store.name} · cliente decidindo`
          : `${o.store.name} · no pool há ${ageMin(since, now)} min`,
        since: iso(since),
        tag: 'Operação',
        href: `/admin/pedidos/${o.id}`,
      };
    })
    .sort(byOldest);
  return { count: items.length, items: items.slice(0, QUEUE_ITEMS_MAX) };
}

/** Pago e sem aceite além do prazo da loja (mesmo critério de isAwaitingStoreAccept + acceptDeadline). */
async function loadOrdersStoreLate({ now, limits }: QueueContext): Promise<QueueLoad> {
  const cutoff = new Date(now.getTime() - limits.storeAcceptTimeoutMin * MIN_MS);
  const where: Prisma.OrderWhereInput = {
    paymentStatus: 'paid',
    acceptedAt: null,
    status: { in: ['criado', 'pago'] },
    OR: [{ paidAt: { lt: cutoff } }, { paidAt: null, createdAt: { lt: cutoff } }],
  };
  const [count, rows] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      orderBy: [{ paidAt: 'asc' }, { createdAt: 'asc' }],
      take: QUEUE_ITEMS_MAX,
      select: { id: true, paidAt: true, createdAt: true, store: { select: { name: true } } },
    }),
  ]);
  const items = rows.map((o): QueueItem => {
    const since = o.paidAt ?? o.createdAt;
    return {
      id: `ord:${o.id}`,
      title: `Loja não aceitou · #${shortOrderId(o.id)}`,
      context: `${o.store.name} · pago há ${ageMin(since, now)} min`,
      since: iso(since),
      tag: 'Operação',
      href: `/admin/pedidos/${o.id}`,
    };
  });
  return { count, items: items.sort(byOldest) };
}

/** Uma leitura por tipo. Objeto mutável de propósito: os testes trocam um loader para simular falha. */
export const QUEUE_LOADERS: Record<QueueType, QueueLoader> = {
  refund: loadRefunds,
  withdrawal: loadWithdrawals,
  motoboy_transfer: loadMotoboyTransfers,
  verification: loadVerifications,
  support: loadSupport,
  payout: loadPayouts,
  plan_change: loadPlanChanges,
  order_no_motoboy: loadOrdersWithoutMotoboy,
  order_store_late: loadOrdersStoreLate,
};

const oldestSince = (g: QueueGroupEntry): string | null =>
  g.items.length ? g.items.reduce((min, it) => (it.since < min ? it.since : min), g.items[0].since) : null;

function sortGroups(groups: QueueGroupEntry[]): QueueGroupEntry[] {
  const declared = (t: QueueType) => QUEUE_TYPES.findIndex((d) => d.type === t);
  return [...groups].sort((a, b) => {
    const byGroup = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    if (byGroup !== 0) return byGroup;
    const sa = oldestSince(a);
    const sb = oldestSince(b);
    if (sa && sb && sa !== sb) return sa < sb ? -1 : 1;
    if (sa && !sb) return -1;
    if (!sa && sb) return 1;
    return declared(a.type) - declared(b.type);
  });
}

export async function buildQueue(ctx: QueueContext): Promise<QueueResponse> {
  const defs = QUEUE_TYPES.filter((d) => d.visible(ctx.can));
  // Promise.resolve().then: um loader que lança de forma síncrona também vira rejeição isolada.
  const settled = await Promise.allSettled(defs.map((d) => Promise.resolve().then(() => QUEUE_LOADERS[d.type](ctx))));
  const groups = defs.map((d, i): QueueGroupEntry => {
    const result = settled[i];
    if (result.status === 'fulfilled') {
      return { type: d.type, group: d.group, count: result.value.count, items: result.value.items.slice(0, QUEUE_ITEMS_MAX) };
    }
    logger.error(`[adminOps/queue] falha ao carregar o tipo ${d.type}`, result.reason as Error);
    return { type: d.type, group: d.group, count: 0, items: [], error: `Não deu para carregar ${d.label}` };
  });
  return { groups: sortGroups(groups) };
}
