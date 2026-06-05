import { Response } from 'express';
import { Types } from 'mongoose';
import { AuthenticatedRequest } from '../types';
import Order from '../models/Order';
import User from '../models/User';
import Store from '../models/Store';
import Product from '../models/Product';
import Category from '../models/Category';
import onlineTracker from '../services/onlineTracker';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type Period = '7d' | '30d' | '90d';

/** Status de pedido considerados "faturáveis" (contam como venda efetiva) */
const BILLABLE_STATUSES = ['pago', 'aguardando_motoboy', 'enviado', 'entregue'];

function parsePeriod(q: any): { days: number; start: Date; prevStart: Date } {
  const raw = (q?.period as string) || '30d';
  const days = raw === '7d' ? 7 : raw === '90d' ? 90 : 30;
  const now = new Date();
  const start = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const prevStart = new Date(start.getTime() - days * 24 * 60 * 60 * 1000);
  return { days, start, prevStart };
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
  return Store.findOne({ ownerId: userId }).lean();
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

    const { days, start, prevStart } = parsePeriod(req.query);

    const [currentOrders, previousOrders] = await Promise.all([
      Order.find({
        storeId: store._id,
        createdAt: { $gte: start },
      }).lean(),
      Order.find({
        storeId: store._id,
        createdAt: { $gte: prevStart, $lt: start },
      }).lean(),
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
      period: { days, start, end: new Date() },
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

    const { days, start } = parsePeriod(req.query);

    const rows = await Order.aggregate([
      {
        $match: {
          storeId: new Types.ObjectId(store._id as any),
          createdAt: { $gte: start },
          status: { $in: BILLABLE_STATUSES },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          revenue: {
            $sum: {
              $ifNull: [
                '$walletDistribution.storeAmount',
                { $multiply: [{ $subtract: ['$totalValue', '$deliveryFee'] }, 0.9] },
              ],
            },
          },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    // Preencher dias sem venda com 0
    const byDate = new Map(rows.map((r: any) => [r._id, r]));
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

    const { start } = parsePeriod(req.query);
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const rows = await Order.aggregate([
      {
        $match: {
          storeId: new Types.ObjectId(store._id as any),
          createdAt: { $gte: start },
          status: { $in: BILLABLE_STATUSES },
        },
      },
      { $unwind: '$products' },
      {
        $group: {
          _id: '$products.productId',
          quantity: { $sum: '$products.quantity' },
          revenue: { $sum: { $multiply: ['$products.price', '$products.quantity'] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'products',
          localField: '_id',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          quantity: 1,
          revenue: { $round: ['$revenue', 2] },
          name: '$product.name',
          image: '$product.image',
          price: '$product.price',
          category: '$product.category',
        },
      },
    ]);

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

    const { start } = parsePeriod(req.query);

    const rows = await Order.aggregate([
      {
        $match: {
          storeId: new Types.ObjectId(store._id as any),
          createdAt: { $gte: start },
          status: { $in: BILLABLE_STATUSES },
        },
      },
      { $unwind: '$products' },
      {
        $lookup: {
          from: 'products',
          localField: 'products.productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$product.category',
          quantity: { $sum: '$products.quantity' },
          revenue: { $sum: { $multiply: ['$products.price', '$products.quantity'] } },
        },
      },
      { $sort: { revenue: -1 } },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: { $ifNull: ['$category.name', 'Sem categoria'] },
          quantity: 1,
          revenue: { $round: ['$revenue', 2] },
        },
      },
    ]);

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

    const { start } = parsePeriod(req.query);

    const rows = await Order.aggregate([
      {
        $match: {
          storeId: new Types.ObjectId(store._id as any),
          createdAt: { $gte: start },
          status: { $in: BILLABLE_STATUSES },
        },
      },
      {
        $group: {
          _id: {
            // MongoDB: dayOfWeek retorna 1 (dom) a 7 (sab)
            dayOfWeek: { $dayOfWeek: '$createdAt' },
            hour: { $hour: '$createdAt' },
          },
          count: { $sum: 1 },
          revenue: {
            $sum: {
              $ifNull: [
                '$walletDistribution.storeAmount',
                { $multiply: [{ $subtract: ['$totalValue', '$deliveryFee'] }, 0.9] },
              ],
            },
          },
        },
      },
    ]);

    // Matrix 7x24 inicializada com 0
    const matrix: { dayOfWeek: number; hour: number; count: number; revenue: number }[] = [];
    for (let d = 1; d <= 7; d++) {
      for (let h = 0; h < 24; h++) {
        const found = rows.find((r: any) => r._id.dayOfWeek === d && r._id.hour === h);
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

    const { start } = parsePeriod(req.query);

    const rows = await Order.aggregate([
      {
        $match: {
          storeId: new Types.ObjectId(store._id as any),
          createdAt: { $gte: start },
          status: { $in: BILLABLE_STATUSES },
        },
      },
      {
        $group: {
          _id: { $ifNull: ['$paymentMethod', 'unknown'] },
          count: { $sum: 1 },
          revenue: { $sum: '$totalValue' },
        },
      },
      { $sort: { count: -1 } },
    ]);

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

    const { start } = parsePeriod(req.query);

    // Clientes distintos no período + contagem de pedidos
    const topCustomers = await Order.aggregate([
      {
        $match: {
          storeId: new Types.ObjectId(store._id as any),
          createdAt: { $gte: start },
          status: { $in: BILLABLE_STATUSES },
        },
      },
      {
        $group: {
          _id: '$customerId',
          orders: { $sum: 1 },
          revenue: { $sum: '$totalValue' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
      {
        $lookup: {
          from: 'users',
          localField: '_id',
          foreignField: '_id',
          as: 'user',
        },
      },
      { $unwind: { path: '$user', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: '$user.name',
          orders: 1,
          revenue: { $round: ['$revenue', 2] },
        },
      },
    ]);

    // Novos vs recorrentes: novos = clientes cujo PRIMEIRO pedido na loja caiu no período
    const firstOrders = await Order.aggregate([
      { $match: { storeId: new Types.ObjectId(store._id as any), status: { $in: BILLABLE_STATUSES } } },
      { $group: { _id: '$customerId', firstOrderAt: { $min: '$createdAt' } } },
    ]);

    let newCustomers = 0;
    let returningCustomers = 0;
    const customerIdsInPeriod = new Set(topCustomers.map((c: any) => String(c._id)));
    for (const f of firstOrders) {
      if (!customerIdsInPeriod.has(String(f._id))) continue;
      if (f.firstOrderAt >= start) newCustomers++;
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
    const { days, start, prevStart } = parsePeriod(req.query);

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
      User.countDocuments({}),
      User.countDocuments({ createdAt: { $gte: start } }),
      User.countDocuments({ createdAt: { $gte: prevStart, $lt: start } }),
      Store.countDocuments({}),
      Store.countDocuments({ createdAt: { $gte: start } }),
      Order.distinct('customerId', { createdAt: { $gte: start }, status: { $in: BILLABLE_STATUSES } }).then(a => a.length),
      Order.distinct('customerId', { createdAt: { $gte: prevStart, $lt: start }, status: { $in: BILLABLE_STATUSES } }).then(a => a.length),
      Order.aggregate([
        { $match: { createdAt: { $gte: start }, status: { $in: BILLABLE_STATUSES } } },
        {
          $group: {
            _id: null,
            gmv: { $sum: '$totalValue' },
            commission: { $sum: { $ifNull: ['$walletDistribution.appCommission', 0] } },
            orders: { $sum: 1 },
          },
        },
      ]),
      Order.aggregate([
        { $match: { createdAt: { $gte: prevStart, $lt: start }, status: { $in: BILLABLE_STATUSES } } },
        {
          $group: {
            _id: null,
            gmv: { $sum: '$totalValue' },
            commission: { $sum: { $ifNull: ['$walletDistribution.appCommission', 0] } },
            orders: { $sum: 1 },
          },
        },
      ]),
    ]);

    const curr = billableCurrent[0] || { gmv: 0, commission: 0, orders: 0 };
    const prev = billablePrev[0] || { gmv: 0, commission: 0, orders: 0 };

    return res.json({
      period: { days, start, end: new Date() },
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
    const { days, start } = parsePeriod(req.query);

    const rows = await User.aggregate([
      { $match: { createdAt: { $gte: start } } },
      {
        $group: {
          _id: {
            date: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            role: { $ifNull: ['$activeRole', { $ifNull: ['$role', 'cliente'] }] },
          },
          count: { $sum: 1 },
        },
      },
    ]);

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
    const { days, start } = parsePeriod(req.query);

    const rows = await Order.aggregate([
      { $match: { createdAt: { $gte: start }, status: { $in: BILLABLE_STATUSES } } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          orders: { $sum: 1 },
          gmv: { $sum: '$totalValue' },
          commission: { $sum: { $ifNull: ['$walletDistribution.appCommission', 0] } },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    const byDate = new Map(rows.map((r: any) => [r._id, r]));
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
    const { start } = parsePeriod(req.query);

    // Usuários cadastrados no período
    const registered = await User.countDocuments({
      createdAt: { $gte: start },
      $or: [{ activeRole: 'cliente' }, { role: 'cliente' }],
    });

    // Desses, quantos fizeram ≥1 pedido e ≥2 pedidos
    const ordersByCustomer = await Order.aggregate([
      {
        $match: {
          createdAt: { $gte: start },
          status: { $in: BILLABLE_STATUSES },
        },
      },
      { $group: { _id: '$customerId', count: { $sum: 1 } } },
    ]);

    // Filtrar só os que cadastraram no período
    const newUsers = await User.find({
      createdAt: { $gte: start },
      $or: [{ activeRole: 'cliente' }, { role: 'cliente' }],
    })
      .select('_id')
      .lean();
    const newUserIds = new Set(newUsers.map((u: any) => String(u._id)));

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
    const { start } = parsePeriod(req.query);
    const limit = Math.min(Number(req.query.limit) || 20, 50);

    const rows = await Order.aggregate([
      { $match: { createdAt: { $gte: start }, status: { $in: BILLABLE_STATUSES } } },
      {
        $group: {
          _id: '$storeId',
          orders: { $sum: 1 },
          revenue: { $sum: '$totalValue' },
          commission: { $sum: { $ifNull: ['$walletDistribution.appCommission', 0] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: limit },
      {
        $lookup: {
          from: 'stores',
          localField: '_id',
          foreignField: '_id',
          as: 'store',
        },
      },
      { $unwind: { path: '$store', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: '$store.name',
          city: '$store.city',
          orders: 1,
          revenue: { $round: ['$revenue', 2] },
          commission: { $round: ['$commission', 2] },
          avgTicket: { $round: [{ $divide: ['$revenue', '$orders'] }, 2] },
        },
      },
    ]);

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
    const { start } = parsePeriod(req.query);

    const rows = await Order.aggregate([
      { $match: { createdAt: { $gte: start }, status: { $in: BILLABLE_STATUSES } } },
      { $unwind: '$products' },
      {
        $lookup: {
          from: 'products',
          localField: 'products.productId',
          foreignField: '_id',
          as: 'product',
        },
      },
      { $unwind: { path: '$product', preserveNullAndEmptyArrays: true } },
      {
        $group: {
          _id: '$product.category',
          quantity: { $sum: '$products.quantity' },
          revenue: { $sum: { $multiply: ['$products.price', '$products.quantity'] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 15 },
      {
        $lookup: {
          from: 'categories',
          localField: '_id',
          foreignField: '_id',
          as: 'category',
        },
      },
      { $unwind: { path: '$category', preserveNullAndEmptyArrays: true } },
      {
        $project: {
          _id: 1,
          name: { $ifNull: ['$category.name', 'Sem categoria'] },
          quantity: 1,
          revenue: { $round: ['$revenue', 2] },
        },
      },
    ]);

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
    const users = await User.find({
      $or: [{ activeRole: 'cliente' }, { role: 'cliente' }],
      'addresses.0': { $exists: true },
    })
      .select('addresses')
      .limit(5000)
      .lean();

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
    const { start } = parsePeriod(req.query);

    const users = await User.find({
      createdAt: { $gte: start },
      $or: [{ activeRole: 'cliente' }, { role: 'cliente' }],
    })
      .select('_id createdAt')
      .lean();

    // Agrupar usuários por mês de cadastro (YYYY-MM)
    const cohorts = new Map<string, { userIds: Set<string>; size: number }>();
    for (const u of users) {
      const month = (u.createdAt as Date).toISOString().slice(0, 7);
      if (!cohorts.has(month)) cohorts.set(month, { userIds: new Set(), size: 0 });
      const c = cohorts.get(month)!;
      c.userIds.add(String(u._id));
      c.size++;
    }

    // Para cada pedido, computar mês de atividade e qual cohort o cliente pertence
    const orders = await Order.find({
      createdAt: { $gte: start },
      status: { $in: BILLABLE_STATUSES },
    })
      .select('customerId createdAt')
      .lean();

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
