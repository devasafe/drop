import {
  bucketOfStatus, countByBucket, pickActiveOrder, orderNetRevenue,
  isToday, todayStats, isStoreOpen,
} from '../sellerOverview';

describe('sellerOverview', () => {
  it('mapeia status reais para buckets (e desconhecido → null)', () => {
    expect(bucketOfStatus('criado')).toBe('novos');
    expect(bucketOfStatus('pago')).toBe('novos');
    expect(bucketOfStatus('aguardando_motoboy')).toBe('emPreparo');
    expect(bucketOfStatus('assigned')).toBe('emPreparo');
    expect(bucketOfStatus('picked')).toBe('aCaminho');
    expect(bucketOfStatus('enviado')).toBe('aCaminho');
    expect(bucketOfStatus('zzz')).toBeNull();
  });

  it('conta pedidos por bucket', () => {
    const orders = [
      { status: 'criado' }, { status: 'pago' },
      { status: 'aguardando_motoboy' }, { status: 'picked' }, { status: 'zzz' },
    ];
    expect(countByBucket(orders)).toEqual({ novos: 2, emPreparo: 1, aCaminho: 1 });
  });

  it('pickActiveOrder prioriza os "novos" mais recentes, senão o ongoing mais recente', () => {
    const orders = [
      { _id: 'a', status: 'picked', createdAt: '2026-08-01T10:00:00Z' },
      { _id: 'b', status: 'criado', createdAt: '2026-08-01T09:00:00Z' },
      { _id: 'c', status: 'criado', createdAt: '2026-08-01T11:00:00Z' },
    ];
    expect(pickActiveOrder(orders)?._id).toBe('c'); // novo mais recente
    expect(pickActiveOrder([{ _id: 'x', status: 'picked', createdAt: 1 }, { _id: 'y', status: 'assigned', createdAt: 2 }])?._id).toBe('y');
    expect(pickActiveOrder([])).toBeNull();
  });

  it('orderNetRevenue usa storeAmount, senão o fallback (sub - 10%)', () => {
    expect(orderNetRevenue({ walletDistribution: { storeAmount: 42 } })).toBe(42);
    expect(orderNetRevenue({ totalValue: 100, deliveryFee: 20 })).toBeCloseTo(72); // (100-20)*0.9
  });

  it('isToday distingue hoje de ontem', () => {
    const now = new Date('2026-08-01T12:00:00');
    expect(isToday('2026-08-01T08:30:00', now)).toBe(true);
    expect(isToday('2026-07-31T23:59:00', now)).toBe(false);
  });

  it('todayStats conta e soma só os pedidos de hoje não-cancelados', () => {
    const now = new Date('2026-08-01T12:00:00');
    const orders = [{ status: 'criado', createdAt: '2026-08-01T09:00:00', walletDistribution: { storeAmount: 10 } }];
    const history = [
      { status: 'entregue', createdAt: '2026-08-01T10:00:00', walletDistribution: { storeAmount: 30 } },
      { status: 'cancelado', createdAt: '2026-08-01T11:00:00', walletDistribution: { storeAmount: 999 } }, // não conta
      { status: 'entregue', createdAt: '2026-07-31T10:00:00', walletDistribution: { storeAmount: 500 } }, // ontem
    ];
    expect(todayStats(orders, history, now)).toEqual({ pedidosHoje: 2, faturamentoHoje: 40 });
  });

  it('isStoreOpen reflete store.isOpen (default aberto quando undefined)', () => {
    expect(isStoreOpen({ isOpen: true })).toBe(true);
    expect(isStoreOpen({ isOpen: false })).toBe(false);
    expect(isStoreOpen({})).toBe(true);
  });
});
