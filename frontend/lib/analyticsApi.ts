import api from './api';

export type Period = '7d' | '30d' | '90d' | 'custom';

/** Intervalo personalizado (datas no formato YYYY-MM-DD) */
export interface DateRange {
  from: string;
  to: string;
}

/** Monta os query params: intervalo custom quando válido, senão o preset */
function periodParams(period: Period, range?: DateRange): Record<string, string> {
  if (period === 'custom' && range?.from && range?.to) {
    return { from: range.from, to: range.to };
  }
  return { period };
}

// ---------- Store (lojista) ----------

export interface StoreOverview {
  period: { days: number; start: string; end: string };
  current: {
    revenue: number;
    orders: number;
    productsSold: number;
    avgTicket: number;
    cancellationRate: number;
  };
  previous: StoreOverview['current'];
  delta: {
    revenue: number;
    orders: number;
    productsSold: number;
    avgTicket: number;
    cancellationRate: number;
  };
}

export interface TimelinePoint {
  date: string;
  orders: number;
  revenue: number;
}

export interface TopProduct {
  _id: string;
  name?: string;
  image?: string;
  quantity: number;
  revenue: number;
}

export interface CategoryRow {
  _id: string;
  name: string;
  quantity: number;
  revenue: number;
  percent: number;
}

export interface PeakHourCell {
  dayOfWeek: number; // 1 (dom) - 7 (sab)
  hour: number;
  count: number;
  revenue: number;
}

export interface PaymentMethodRow {
  method: string;
  count: number;
  revenue: number;
  percent: number;
}

export interface CustomerInsights {
  topCustomers: Array<{ _id: string; name?: string; orders: number; revenue: number }>;
  newCustomers: number;
  returningCustomers: number;
  totalDistinct: number;
}

export const storeAnalytics = {
  overview: (period: Period = '30d', range?: DateRange) =>
    api.get<StoreOverview>('/analytics/store/overview', { params: periodParams(period, range) }).then(r => r.data),
  salesTimeline: (period: Period = '30d', range?: DateRange) =>
    api.get<{ timeline: TimelinePoint[] }>('/analytics/store/sales-timeline', { params: periodParams(period, range) }).then(r => r.data),
  topProducts: (period: Period = '30d', limit = 10, range?: DateRange) =>
    api.get<{ products: TopProduct[] }>('/analytics/store/top-products', { params: { ...periodParams(period, range), limit } }).then(r => r.data),
  topCategories: (period: Period = '30d', range?: DateRange) =>
    api.get<{ categories: CategoryRow[]; totalRevenue: number }>('/analytics/store/top-categories', { params: periodParams(period, range) }).then(r => r.data),
  peakHours: (period: Period = '30d', range?: DateRange) =>
    api.get<{ matrix: PeakHourCell[] }>('/analytics/store/peak-hours', { params: periodParams(period, range) }).then(r => r.data),
  paymentMethods: (period: Period = '30d', range?: DateRange) =>
    api.get<{ methods: PaymentMethodRow[] }>('/analytics/store/payment-methods', { params: periodParams(period, range) }).then(r => r.data),
  customerInsights: (period: Period = '30d', range?: DateRange) =>
    api.get<CustomerInsights>('/analytics/store/customer-insights', { params: periodParams(period, range) }).then(r => r.data),
};

// ---------- Platform (CEO) ----------

export interface PlatformOverview {
  period: { days: number; start: string; end: string };
  current: {
    totalUsers: number;
    newUsers: number;
    activeUsers: number;
    totalStores: number;
    newStores: number;
    gmv: number;
    commission: number;
    orders: number;
  };
  previous: {
    newUsers: number;
    activeUsers: number;
    gmv: number;
    commission: number;
    orders: number;
  };
  delta: {
    newUsers: number;
    activeUsers: number;
    gmv: number;
    commission: number;
    orders: number;
  };
}

export interface UserGrowthPoint {
  date: string;
  clientes: number;
  lojistas: number;
  motoboys: number;
  outros: number;
}

export interface OrdersTimelinePoint {
  date: string;
  orders: number;
  gmv: number;
  commission: number;
}

export interface FunnelData {
  steps: Array<{ label: string; count: number }>;
  conversionRates: {
    registerToFirstOrder: number;
    firstOrderToSecond: number;
  };
}

export interface TopStore {
  _id: string;
  name?: string;
  city?: string;
  orders: number;
  revenue: number;
  commission: number;
  avgTicket: number;
}

export interface LiveUsersSnapshot {
  total: number;
  byRole: Record<string, number>;
  points: Array<{ userId: string; role: string; lat: number; lng: number }>;
}

export interface RetentionCohort {
  cohort: string; // YYYY-MM
  size: number;
  retention: Record<number, number>; // offset → %
}

export const platformAnalytics = {
  overview: (period: Period = '30d') =>
    api.get<PlatformOverview>('/analytics/platform/overview', { params: { period } }).then(r => r.data),
  userGrowth: (period: Period = '90d') =>
    api.get<{ timeline: UserGrowthPoint[] }>('/analytics/platform/user-growth', { params: { period } }).then(r => r.data),
  ordersTimeline: (period: Period = '90d') =>
    api.get<{ timeline: OrdersTimelinePoint[] }>('/analytics/platform/orders-timeline', { params: { period } }).then(r => r.data),
  funnel: (period: Period = '30d') =>
    api.get<FunnelData>('/analytics/platform/funnel', { params: { period } }).then(r => r.data),
  topStores: (period: Period = '30d', limit = 20) =>
    api.get<{ stores: TopStore[] }>('/analytics/platform/top-stores', { params: { period, limit } }).then(r => r.data),
  topCategories: (period: Period = '30d') =>
    api.get<{ categories: CategoryRow[]; totalRevenue: number }>('/analytics/platform/top-categories', { params: { period } }).then(r => r.data),
  liveUsers: () => api.get<LiveUsersSnapshot>('/analytics/platform/live-users').then(r => r.data),
  userHeatmap: () =>
    api.get<{ points: Array<{ lat: number; lng: number }> }>('/analytics/platform/user-heatmap').then(r => r.data),
  retention: (period: Period = '90d') =>
    api.get<{ cohorts: RetentionCohort[] }>('/analytics/platform/retention', { params: { period } }).then(r => r.data),
};
