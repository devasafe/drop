import { Response } from 'express';
import { AuthenticatedRequest } from '../types';
import { toApiOrder, orderInclude } from '../repositories/order.repository';
import { prisma } from '../lib/prisma';



import onlineTracker from '../services/onlineTracker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Period = '7d' | '30d' | '90d';

/** Status de pedido considerados "faturáveis" (contam como venda efetiva) */
const BILLABLE_STATUSES = ['pago', 'aguardando_motoboy', 'enviado', 'entregue'];

function parsePeriod(q: any): { days: number; start: Date; end: Date; prevStart: Date } {
  const DAY = 24 * 60 * 60 * 1000;
  // Intervalo personalizado: ?from=YYYY-MM-DD&to=YYYY-MM-DD
  const from = q?.from ? new Date(String(q.from)) : null;
  const to = q?.to ? new Date(String(q.to)) : null;
  if (from && to && !isNaN(from.getTime()) && !isNaN(to.getTime())) {
    const start = new Date(from); start.setHours(0, 0, 0, 0);
    const end = new Date(to); end.setHours(23, 59, 59, 999);
    const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY) + 1);
    const prevStart = new Date(start.getTime() - days * DAY);
    return { days, start, end, prevStart };
  }
  const raw = (q?.period as string) || '30d';
  const days = raw === '7d' ? 7 : raw === '90d' ? 90 : 30;
  const now = new Date();
  const start = new Date(now.getTime() - days * DAY);
  const prevStart = new Date(start.getTime() - days * DAY);
  return { days, start, end: now, prevStart };
}

function pctDelta(current: number, previous: number): number {
  if (previous === 0) return current > 0 ? 100 : 0;
  return Number((((current - previous) / previous) * 100).toFixed(1));
}

/** Receita da loja para um pedido (usa walletDistribution quando disponível) */
function storeRevenueOfOrder(o: any): number {
  if (o.walletDistribution?.storeAmount != null) return o.walletDistribution.storeAmount;
  const productTotal = (o.totalValue || 0) - (o.deliveryFee || 0);
  return productTotal * 0.9; // fallback 10% comissão
}

async function getStoreByOwner(userId: string) {
  return prisma.store.findFirst({ where: { ownerId: userId } }) as any;
}

/**
 * Busca pedidos para relatório e os devolve na forma de API (products[], dinheiro
 * em number). Os pipelines de `aggregate` do Mongo não têm equivalente direto no
 * Prisma; aqui buscamos os pedidos do recorte e agregamos em memória — o volume de
 * um relatório é pequeno e o resultado é idêntico.
 */
async function fetchOrdersForReport(where: any): Promise<any[]> {
  const rows = await prisma.order.findMany({ where, include: orderInclude });
  return rows.map(toApiOrder);
}

/** Chave de data YYYY-MM-DD (UTC), como o `$dateToString` fazia. */
function dateKey(d: Date): string {
  return new Date(d).toISOString().slice(0, 10);
}

/** GMV / comissão / nº de pedidos de uma lista de pedidos (substitui o $group _id:null). */
function gmvAgg(orders: any[]): { gmv: number; commission: number; orders: number } {
  let gmv = 0, commission = 0;
  for (const o of orders) {
    gmv += o.totalValue || 0;
    commission += o.walletDistribution?.appCommission || 0;
  }
  return { gmv, commission, orders: orders.length };
}

// ===========================================================================
// STORE (lojista) — todos os endpoints filtrados por store.ownerId
// ===========================================================================

/**
 * GET /api/analytics/store/overview?period=7d|30d|90d
 * KPIs principais + comparação com período anterior
 */
export const storeOverview = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const store = await getStoreByOwner(userId);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const { days, start, end, prevStart } = parsePeriod(req.query);

    const [currentOrders, previousOrders] = await Promise.all([
      fetchOrdersForReport({ storeId: store.id, createdAt: { gte: start, lte: end } }),
      fetchOrdersForReport({ storeId: store.id, createdAt: { gte: prevStart, lt: start } }),
    ]);

    const computeMetrics = (orders: any[]) => {
      const billable = orders.filter(o => BILLABLE_STATUSES.includes(o.status));
      const cancelled = orders.filter(o => o.status === 'cancelado' || o.status === 'rejeitado');
      const revenue = billable.reduce((sum, o) => sum + storeRevenueOfOrder(o), 0);
      const productsSold = billable.reduce(
        (sum, o) => sum + (o.products || []).reduce((s: number, p: any) => s + (p.quantity || 0), 0),
        0
      );
      const avgTicket = billable.length > 0 ? revenue / billable.length : 0;
      const cancellationRate = orders.length > 0 ? (cancelled.length / orders.length) * 100 : 0;
      return {
        revenue: Number(revenue.toFixed(2)),
        orders: billable.length,
        productsSold,
        avgTicket: Number(avgTicket.toFixed(2)),
        cancellationRate: Number(cancellationRate.toFixed(1)),
      };
    };

    const current = computeMetrics(currentOrders);
    const previous = computeMetrics(previousOrders);

    return res.json({
      period: { days, start, end },
      current,
      previous,
      delta: {
        revenue: pctDelta(current.revenue, previous.revenue),
        orders: pctDelta(current.orders, previous.orders),
        productsSold: pctDelta(current.productsSold, previous.productsSold),
        avgTicket: pctDelta(current.avgTicket, previous.avgTicket),
        cancellationRate: Number((current.cancellationRate - previous.cancellationRate).toFixed(1)),
      },
    });
  } catch (err: any) {
    console.error('[analytics.storeOverview] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar overview' });
  }
};

/**
 * GET /api/analytics/store/sales-timeline?period=30d
 * Série diária de receita e pedidos
 */
export const storeSalesTimeline = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const store = await getStoreByOwner(userId);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const { days, start, end } = parsePeriod(req.query);

    const orders = await fetchOrdersForReport({
      storeId: store.id,
      createdAt: { gte: start, lte: end },
      status: { in: BILLABLE_STATUSES as any },
    });

    const byDate = new Map<string, { orders: number; revenue: number }>();
    for (const o of orders) {
      const key = dateKey(o.createdAt);
      const cur = byDate.get(key) || { orders: 0, revenue: 0 };
      cur.orders += 1;
      cur.revenue += storeRevenueOfOrder(o);
      byDate.set(key, cur);
    }
    const timeline: any[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      const row = byDate.get(key);
      timeline.push({
        date: key,
        orders: row?.orders || 0,
        revenue: Number((row?.revenue || 0).toFixed(2)),
      });
    }

    return res.json({ timeline });
  } catch (err) {
    console.error('[analytics.storeSalesTimeline] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar timeline' });
  }
};

/**
 * GET /api/analytics/store/top-products?limit=10&period=30d
 */
export const storeTopProducts = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const store = await getStoreByOwner(userId);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const { start, end } = parsePeriod(req.query);
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const orders = await fetchOrdersForReport({
      storeId: store.id,
      createdAt: { gte: start, lte: end },
      status: { in: BILLABLE_STATUSES as any },
    });

    // Agrega por produto (soma quantidade e receita = preço × quantidade).
    const agg = new Map<string, { quantity: number; revenue: number }>();
    for (const o of orders) {
      for (const it of o.products || []) {
        const cur = agg.get(it.productId) || { quantity: 0, revenue: 0 };
        cur.quantity += it.quantity;
        cur.revenue += (it.price || 0) * it.quantity;
        agg.set(it.productId, cur);
      }
    }
    const topIds = [...agg.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, limit);
    const productMap = new Map(
      (await prisma.product.findMany({ where: { id: { in: topIds.map(([id]) => id) } } })).map((p) => [p.id, p as any]),
    );
    const rows = topIds.map(([id, v]) => {
      const p = productMap.get(id);
      return {
        _id: id,
        quantity: v.quantity,
        revenue: Number(v.revenue.toFixed(2)),
        name: p?.name,
        image: p?.image,
        price: p ? Number(p.price) : undefined,
        category: p?.categoryId,
      };
    });

    return res.json({ products: rows });
  } catch (err) {
    console.error('[analytics.storeTopProducts] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar top produtos' });
  }
};

/**
 * GET /api/analytics/store/top-categories?period=30d
 */
export const storeTopCategories = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const store = await getStoreByOwner(userId);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const { start, end } = parsePeriod(req.query);

    const orders = await fetchOrdersForReport({
      storeId: store.id,
      createdAt: { gte: start, lte: end },
      status: { in: BILLABLE_STATUSES as any },
    });

    // Produto → categoria (categoryId). Agrega quantidade/receita por categoria.
    const productIds = [...new Set(orders.flatMap((o) => (o.products || []).map((it: any) => it.productId)))];
    const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, categoryId: true } });
    const catOfProduct = new Map(products.map((p) => [p.id, p.categoryId]));

    const agg = new Map<string, { quantity: number; revenue: number }>();
    for (const o of orders) {
      for (const it of o.products || []) {
        const cat = catOfProduct.get(it.productId) || '__none__';
        const cur = agg.get(cat) || { quantity: 0, revenue: 0 };
        cur.quantity += it.quantity;
        cur.revenue += (it.price || 0) * it.quantity;
        agg.set(cat, cur);
      }
    }

    const catIds = [...agg.keys()].filter((c) => c !== '__none__');
    const catNames = new Map(
      (await prisma.category.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]),
    );
    const rows = [...agg.entries()]
      .map(([catId, v]) => ({
        _id: catId === '__none__' ? null : catId,
        name: catNames.get(catId) || 'Sem categoria',
        quantity: v.quantity,
        revenue: Number(v.revenue.toFixed(2)),
      }))
      .sort((a, b) => b.revenue - a.revenue);

    const total = rows.reduce((sum: number, r: any) => sum + (r.revenue || 0), 0);
    const withPct = rows.map((r: any) => ({
      ...r,
      percent: total > 0 ? Number(((r.revenue / total) * 100).toFixed(1)) : 0,
    }));

    return res.json({ categories: withPct, totalRevenue: Number(total.toFixed(2)) });
  } catch (err) {
    console.error('[analytics.storeTopCategories] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar categorias' });
  }
};

/**
 * GET /api/analytics/store/peak-hours?period=30d
 * Heatmap 7x24 (dia da semana x hora)
 */
export const storePeakHours = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const store = await getStoreByOwner(userId);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const { start, end } = parsePeriod(req.query);

    const orders = await fetchOrdersForReport({
      storeId: store.id,
      createdAt: { gte: start, lte: end },
      status: { in: BILLABLE_STATUSES as any },
    });

    // Agrega por (dia da semana 1..7 como no Mongo, hora 0..23). getUTCDay()=0..6 (dom=0).
    const cells = new Map<string, { count: number; revenue: number }>();
    for (const o of orders) {
      const d = new Date(o.createdAt);
      const key = `${d.getUTCDay() + 1}_${d.getUTCHours()}`;
      const cur = cells.get(key) || { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += storeRevenueOfOrder(o);
      cells.set(key, cur);
    }

    // Matrix 7x24 inicializada com 0
    const matrix: { dayOfWeek: number; hour: number; count: number; revenue: number }[] = [];
    for (let d = 1; d <= 7; d++) {
      for (let h = 0; h < 24; h++) {
        const found = cells.get(`${d}_${h}`);
        matrix.push({
          dayOfWeek: d,
          hour: h,
          count: found?.count || 0,
          revenue: Number((found?.revenue || 0).toFixed(2)),
        });
      }
    }

    return res.json({ matrix });
  } catch (err) {
    console.error('[analytics.storePeakHours] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar horários de pico' });
  }
};

/**
 * GET /api/analytics/store/payment-methods?period=30d
 */
export const storePaymentMethods = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const store = await getStoreByOwner(userId);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const { start, end } = parsePeriod(req.query);

    const orders = await fetchOrdersForReport({
      storeId: store.id,
      createdAt: { gte: start, lte: end },
      status: { in: BILLABLE_STATUSES as any },
    });

    const agg = new Map<string, { count: number; revenue: number }>();
    for (const o of orders) {
      const method = o.paymentMethod || 'unknown';
      const cur = agg.get(method) || { count: 0, revenue: 0 };
      cur.count += 1;
      cur.revenue += o.totalValue || 0;
      agg.set(method, cur);
    }
    const rows = [...agg.entries()]
      .map(([_id, v]) => ({ _id, count: v.count, revenue: v.revenue }))
      .sort((a, b) => b.count - a.count);

    const total = rows.reduce((sum: number, r: any) => sum + r.count, 0);
    const result = rows.map((r: any) => ({
      method: r._id,
      count: r.count,
      revenue: Number((r.revenue || 0).toFixed(2)),
      percent: total > 0 ? Number(((r.count / total) * 100).toFixed(1)) : 0,
    }));

    return res.json({ methods: result });
  } catch (err) {
    console.error('[analytics.storePaymentMethods] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar métodos de pagamento' });
  }
};

/**
 * GET /api/analytics/store/customer-insights?period=30d
 */
export const storeCustomerInsights = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const userId = req.user?.id;
    if (!userId) return res.status(401).json({ error: 'Not authenticated' });

    const store = await getStoreByOwner(userId);
    if (!store) return res.status(404).json({ error: 'Store not found' });

    const { start, end } = parsePeriod(req.query);

    // Clientes distintos no período + contagem de pedidos (top 10 por receita).
    const inPeriod = await fetchOrdersForReport({
      storeId: store.id,
      createdAt: { gte: start, lte: end },
      status: { in: BILLABLE_STATUSES as any },
    });
    const byCustomer = new Map<string, { orders: number; revenue: number }>();
    for (const o of inPeriod) {
      const cur = byCustomer.get(o.customerId) || { orders: 0, revenue: 0 };
      cur.orders += 1;
      cur.revenue += o.totalValue || 0;
      byCustomer.set(o.customerId, cur);
    }
    const top = [...byCustomer.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 10);
    const nameMap = new Map(
      (await prisma.user.findMany({ where: { id: { in: top.map(([id]) => id) } }, select: { id: true, name: true } })).map((u) => [u.id, u.name]),
    );
    const topCustomers = top.map(([id, v]) => ({
      _id: id, name: nameMap.get(id), orders: v.orders, revenue: Number(v.revenue.toFixed(2)),
    }));

    // Novos vs recorrentes: primeiro pedido (de todos os tempos) de cada cliente da loja.
    const allStoreOrders = await prisma.order.findMany({
      where: { storeId: store.id, status: { in: BILLABLE_STATUSES as any } },
      select: { customerId: true, createdAt: true },
    });
    const firstOrderAt = new Map<string, Date>();
    for (const o of allStoreOrders) {
      const prev = firstOrderAt.get(o.customerId);
      if (!prev || o.createdAt < prev) firstOrderAt.set(o.customerId, o.createdAt);
    }

    let newCustomers = 0;
    let returningCustomers = 0;
    const customerIdsInPeriod = new Set(topCustomers.map((c: any) => String(c._id)));
    for (const [cid, first] of firstOrderAt) {
      if (!customerIdsInPeriod.has(cid)) continue;
      if (first >= start && first <= end) newCustomers++;
      else returningCustomers++;
    }

    return res.json({
      topCustomers,
      newCustomers,
      returningCustomers,
      totalDistinct: topCustomers.length,
    });
  } catch (err) {
    console.error('[analytics.storeCustomerInsights] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar insights de clientes' });
  }
};

// ===========================================================================
// PLATFORM (CEO)
// ===========================================================================

/**
 * GET /api/analytics/platform/overview
 */
export const platformOverview = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { days, start, end, prevStart } = parsePeriod(req.query);

    const [
      totalUsers,
      newUsers,
      newUsersPrev,
      totalStores,
      newStores,
      activeUsers,
      activeUsersPrev,
      billableCurrent,
      billablePrev,
    ] = await Promise.all([
      prisma.user.count(),
      prisma.user.count({ where: { createdAt: { gte: start, lte: end } } }),
      prisma.user.count({ where: { createdAt: { gte: prevStart, lt: start } } }),
      prisma.store.count(),
      prisma.store.count({ where: { createdAt: { gte: start, lte: end } } }),
      prisma.order.findMany({ where: { createdAt: { gte: start, lte: end }, status: { in: BILLABLE_STATUSES as any } }, distinct: ['customerId'], select: { customerId: true } }).then(a => a.length),
      prisma.order.findMany({ where: { createdAt: { gte: prevStart, lt: start }, status: { in: BILLABLE_STATUSES as any } }, distinct: ['customerId'], select: { customerId: true } }).then(a => a.length),
      fetchOrdersForReport({ createdAt: { gte: start, lte: end }, status: { in: BILLABLE_STATUSES as any } }).then(gmvAgg),
      fetchOrdersForReport({ createdAt: { gte: prevStart, lt: start }, status: { in: BILLABLE_STATUSES as any } }).then(gmvAgg),
    ]);

    const curr = billableCurrent;
    const prev = billablePrev;

    return res.json({
      period: { days, start, end },
      current: {
        totalUsers,
        newUsers,
        activeUsers,
        totalStores,
        newStores,
        gmv: Number(curr.gmv.toFixed(2)),
        commission: Number(curr.commission.toFixed(2)),
        orders: curr.orders,
      },
      previous: {
        newUsers: newUsersPrev,
        activeUsers: activeUsersPrev,
        gmv: Number(prev.gmv.toFixed(2)),
        commission: Number(prev.commission.toFixed(2)),
        orders: prev.orders,
      },
      delta: {
        newUsers: pctDelta(newUsers, newUsersPrev),
        activeUsers: pctDelta(activeUsers, activeUsersPrev),
        gmv: pctDelta(curr.gmv, prev.gmv),
        commission: pctDelta(curr.commission, prev.commission),
        orders: pctDelta(curr.orders, prev.orders),
      },
    });
  } catch (err) {
    console.error('[analytics.platformOverview] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar overview da plataforma' });
  }
};

/**
 * GET /api/analytics/platform/user-growth?period=90d
 */
export const platformUserGrowth = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { days, start, end } = parsePeriod(req.query);

    // O `$dateToString` do Mongo não tem equivalente no `groupBy` do Prisma:
    // buscamos o período e agrupamos em memória, mantendo a mesma forma de saída.
    const usersInPeriod = await prisma.user.findMany({
      where: { createdAt: { gte: start, lte: end } },
      select: { createdAt: true, activeRole: true, role: true },
    });

    const grouped = new Map<string, { _id: { date: string; role: string }; count: number }>();
    for (const u of usersInPeriod) {
      const date = u.createdAt.toISOString().slice(0, 10); // YYYY-MM-DD
      const role = u.activeRole ?? u.role ?? 'cliente';
      const key = `${date}|${role}`;
      const existing = grouped.get(key);
      if (existing) existing.count += 1;
      else grouped.set(key, { _id: { date, role }, count: 1 });
    }
    const rows = Array.from(grouped.values());

    const byDate = new Map<string, { clientes: number; lojistas: number; motoboys: number; outros: number }>();
    for (const r of rows) {
      const d = r._id.date;
      if (!byDate.has(d)) byDate.set(d, { clientes: 0, lojistas: 0, motoboys: 0, outros: 0 });
      const bucket = byDate.get(d)!;
      const role = r._id.role;
      if (role === 'cliente') bucket.clientes += r.count;
      else if (role === 'lojista') bucket.lojistas += r.count;
      else if (role === 'motoboy') bucket.motoboys += r.count;
      else bucket.outros += r.count;
    }

    const timeline: any[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      const row = byDate.get(key) || { clientes: 0, lojistas: 0, motoboys: 0, outros: 0 };
      timeline.push({ date: key, ...row });
    }

    return res.json({ timeline });
  } catch (err) {
    console.error('[analytics.platformUserGrowth] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar crescimento de usuários' });
  }
};

/**
 * GET /api/analytics/platform/orders-timeline?period=90d
 */
export const platformOrdersTimeline = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { days, start, end } = parsePeriod(req.query);

    const orders = await fetchOrdersForReport({ createdAt: { gte: start, lte: end }, status: { in: BILLABLE_STATUSES as any } });
    const byDate = new Map<string, { orders: number; gmv: number; commission: number }>();
    for (const o of orders) {
      const key = dateKey(o.createdAt);
      const cur = byDate.get(key) || { orders: 0, gmv: 0, commission: 0 };
      cur.orders += 1;
      cur.gmv += o.totalValue || 0;
      cur.commission += o.walletDistribution?.appCommission || 0;
      byDate.set(key, cur);
    }
    const timeline: any[] = [];
    for (let i = 0; i < days; i++) {
      const d = new Date(start.getTime() + i * 24 * 60 * 60 * 1000);
      const key = d.toISOString().slice(0, 10);
      const row = byDate.get(key);
      timeline.push({
        date: key,
        orders: row?.orders || 0,
        gmv: Number((row?.gmv || 0).toFixed(2)),
        commission: Number((row?.commission || 0).toFixed(2)),
      });
    }

    return res.json({ timeline });
  } catch (err) {
    console.error('[analytics.platformOrdersTimeline] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar timeline de pedidos' });
  }
};

/**
 * GET /api/analytics/platform/funnel?period=30d
 * Funil: cadastrou → fez 1º pedido → fez 2º pedido
 */
export const platformFunnel = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { start, end } = parsePeriod(req.query);

    // Usuários cadastrados no período
    const registered = await prisma.user.count({
      where: {
        createdAt: { gte: start, lte: end },
        OR: [{ activeRole: 'cliente' }, { role: 'cliente' }],
      },
    });

    // Desses, quantos fizeram ≥1 pedido e ≥2 pedidos
    const periodOrders = await prisma.order.findMany({
      where: { createdAt: { gte: start, lte: end }, status: { in: BILLABLE_STATUSES as any } },
      select: { customerId: true },
    });
    const countByCustomer = new Map<string, number>();
    for (const o of periodOrders) countByCustomer.set(o.customerId, (countByCustomer.get(o.customerId) || 0) + 1);
    const ordersByCustomer = [...countByCustomer.entries()].map(([_id, count]) => ({ _id, count }));

    // Filtrar só os que cadastraram no período
    const newUsers = await prisma.user.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        OR: [{ activeRole: 'cliente' }, { role: 'cliente' }],
      },
      select: { id: true },
    });
    const newUserIds = new Set(newUsers.map((u) => u.id));

    let firstOrder = 0;
    let secondOrder = 0;
    for (const o of ordersByCustomer) {
      if (!newUserIds.has(String(o._id))) continue;
      if (o.count >= 1) firstOrder++;
      if (o.count >= 2) secondOrder++;
    }

    return res.json({
      steps: [
        { label: 'Cadastrou', count: registered },
        { label: 'Fez 1º pedido', count: firstOrder },
        { label: 'Fez 2º pedido', count: secondOrder },
      ],
      conversionRates: {
        registerToFirstOrder: registered > 0 ? Number(((firstOrder / registered) * 100).toFixed(1)) : 0,
        firstOrderToSecond: firstOrder > 0 ? Number(((secondOrder / firstOrder) * 100).toFixed(1)) : 0,
      },
    });
  } catch (err) {
    console.error('[analytics.platformFunnel] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar funil' });
  }
};

/**
 * GET /api/analytics/platform/top-stores?limit=20&period=30d
 */
export const platformTopStores = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { start, end } = parsePeriod(req.query);
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const orders = await fetchOrdersForReport({ createdAt: { gte: start, lte: end }, status: { in: BILLABLE_STATUSES as any } });
    const agg = new Map<string, { orders: number; revenue: number; commission: number }>();
    for (const o of orders) {
      const cur = agg.get(o.storeId) || { orders: 0, revenue: 0, commission: 0 };
      cur.orders += 1;
      cur.revenue += o.totalValue || 0;
      cur.commission += o.walletDistribution?.appCommission || 0;
      agg.set(o.storeId, cur);
    }
    const top = [...agg.entries()].sort((a, b) => b[1].revenue - a[1].revenue).slice(0, limit);
    const storeMap = new Map(
      (await prisma.store.findMany({ where: { id: { in: top.map(([id]) => id) } }, select: { id: true, name: true, city: true } })).map((st) => [st.id, st]),
    );
    const rows = top.map(([id, v]) => {
      const st = storeMap.get(id) as any;
      return {
        _id: id, name: st?.name, city: st?.city,
        orders: v.orders,
        revenue: Number(v.revenue.toFixed(2)),
        commission: Number(v.commission.toFixed(2)),
        avgTicket: v.orders > 0 ? Number((v.revenue / v.orders).toFixed(2)) : 0,
      };
    });

    return res.json({ stores: rows });
  } catch (err) {
    console.error('[analytics.platformTopStores] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar top lojas' });
  }
};

/**
 * GET /api/analytics/platform/top-categories?period=30d
 */
export const platformTopCategories = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { start, end } = parsePeriod(req.query);

    const orders = await fetchOrdersForReport({ createdAt: { gte: start, lte: end }, status: { in: BILLABLE_STATUSES as any } });
    const productIds = [...new Set(orders.flatMap((o) => (o.products || []).map((it: any) => it.productId)))];
    const products = await prisma.product.findMany({ where: { id: { in: productIds } }, select: { id: true, categoryId: true } });
    const catOfProduct = new Map(products.map((p) => [p.id, p.categoryId]));

    const agg = new Map<string, { quantity: number; revenue: number }>();
    for (const o of orders) {
      for (const it of o.products || []) {
        const cat = catOfProduct.get(it.productId) || '__none__';
        const cur = agg.get(cat) || { quantity: 0, revenue: 0 };
        cur.quantity += it.quantity;
        cur.revenue += (it.price || 0) * it.quantity;
        agg.set(cat, cur);
      }
    }
    const catIds = [...agg.keys()].filter((c) => c !== '__none__');
    const catNames = new Map(
      (await prisma.category.findMany({ where: { id: { in: catIds } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]),
    );
    const rows = [...agg.entries()]
      .map(([catId, v]) => ({
        _id: catId === '__none__' ? null : catId,
        name: catNames.get(catId) || 'Sem categoria',
        quantity: v.quantity,
        revenue: Number(v.revenue.toFixed(2)),
      }))
      .sort((a, b) => b.revenue - a.revenue)
      .slice(0, 15);

    const total = rows.reduce((sum: number, r: any) => sum + (r.revenue || 0), 0);
    const withPct = rows.map((r: any) => ({
      ...r,
      percent: total > 0 ? Number(((r.revenue / total) * 100).toFixed(1)) : 0,
    }));

    return res.json({ categories: withPct, totalRevenue: Number(total.toFixed(2)) });
  } catch (err) {
    console.error('[analytics.platformTopCategories] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar top categorias' });
  }
};

/**
 * GET /api/analytics/platform/live-users
 * Snapshot dos usuários conectados via Socket.io no momento
 */
export const platformLiveUsers = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    const snapshot = onlineTracker.snapshot();
    return res.json(snapshot);
  } catch (err) {
    console.error('[analytics.platformLiveUsers] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar usuários ao vivo' });
  }
};

/**
 * GET /api/analytics/platform/user-heatmap
 * Fallback: pontos agregados de endereços cadastrados de clientes
 */
export const platformUserHeatmap = async (_req: AuthenticatedRequest, res: Response) => {
  try {
    // `'addresses.0': { $exists: true }` (array embutido) vira `some` na relação.
    const users = await prisma.user.findMany({
      where: {
        OR: [{ activeRole: 'cliente' }, { role: 'cliente' }],
        addresses: { some: {} },
      },
      select: { addresses: true },
      take: 5000,
    });

    const points: Array<{ lat: number; lng: number }> = [];
    for (const u of users) {
      const addr = (u.addresses || []).find((a: any) => a.isDefault) || (u.addresses || [])[0];
      if (!addr) continue;
      const lat = Number(addr.latitude);
      const lng = Number(addr.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;
      // Jitter pequeno para anonimização (±50m aprox)
      const jLat = lat + (Math.random() - 0.5) * 0.001;
      const jLng = lng + (Math.random() - 0.5) * 0.001;
      points.push({ lat: jLat, lng: jLng });
    }

    return res.json({ points });
  } catch (err) {
    console.error('[analytics.platformUserHeatmap] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar heatmap' });
  }
};

/**
 * GET /api/analytics/platform/retention?period=90d
 * Cohort simples: usuários cadastrados em cada mês → % que fez pedido nos meses seguintes
 */
export const platformRetention = async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { start, end } = parsePeriod(req.query);

    const users = await prisma.user.findMany({
      where: {
        createdAt: { gte: start, lte: end },
        OR: [{ activeRole: 'cliente' }, { role: 'cliente' }],
      },
      select: { id: true, createdAt: true },
    });

    // Agrupar usuários por mês de cadastro (YYYY-MM)
    const cohorts = new Map<string, { userIds: Set<string>; size: number }>();
    for (const u of users) {
      const month = (u.createdAt as Date).toISOString().slice(0, 7);
      if (!cohorts.has(month)) cohorts.set(month, { userIds: new Set(), size: 0 });
      const c = cohorts.get(month)!;
      c.userIds.add(u.id);
      c.size++;
    }

    // Para cada pedido, computar mês de atividade e qual cohort o cliente pertence
    const orders = await prisma.order.findMany({
      where: { createdAt: { gte: start, lte: end }, status: { in: BILLABLE_STATUSES as any } },
      select: { customerId: true, createdAt: true },
    });

    const result: any[] = [];
    for (const [cohortMonth, cohort] of cohorts.entries()) {
      const activityByMonthOffset: Record<number, Set<string>> = {};
      for (const o of orders) {
        const customerId = String(o.customerId);
        if (!cohort.userIds.has(customerId)) continue;
        const orderMonth = (o.createdAt as Date).toISOString().slice(0, 7);
        const cohortDate = new Date(cohortMonth + '-01');
        const orderDate = new Date(orderMonth + '-01');
        const offset =
          (orderDate.getFullYear() - cohortDate.getFullYear()) * 12 +
          (orderDate.getMonth() - cohortDate.getMonth());
        if (offset < 0) continue;
        if (!activityByMonthOffset[offset]) activityByMonthOffset[offset] = new Set();
        activityByMonthOffset[offset].add(customerId);
      }

      const retention: Record<number, number> = {};
      for (const [offset, set] of Object.entries(activityByMonthOffset)) {
        retention[Number(offset)] = cohort.size > 0 ? Number(((set.size / cohort.size) * 100).toFixed(1)) : 0;
      }

      result.push({ cohort: cohortMonth, size: cohort.size, retention });
    }

    result.sort((a, b) => a.cohort.localeCompare(b.cohort));
    return res.json({ cohorts: result });
  } catch (err) {
    console.error('[analytics.platformRetention] error:', err);
    return res.status(500).json({ error: 'Erro ao carregar retenção' });
  }
};
