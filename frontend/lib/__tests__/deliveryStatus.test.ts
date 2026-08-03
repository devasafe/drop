import { ongoingStatusView, historyStats, filterHistory, payoutStatusView } from '../deliveryStatus';

describe('deliveryStatus', () => {
  it('ongoingStatusView mapeia os status de entrega em andamento', () => {
    expect(ongoingStatusView('assigned')).toEqual({ label: 'Aguardando retirada', tone: 'waiting' });
    expect(ongoingStatusView('picked')).toEqual({ label: 'Em trânsito', tone: 'transit' });
    expect(ongoingStatusView('delivering')).toEqual({ label: 'Próximo da entrega', tone: 'near' });
    // status desconhecido cai num fallback seguro (não quebra)
    expect(ongoingStatusView('xyz').tone).toBe('transit');
  });

  it('historyStats soma ganhos (80% da taxa), conta total e média de nota', () => {
    const h = [
      { status: 'delivered', fee: 10, rating: 5 },
      { status: 'delivered', fee: 20, rating: 3 },
      { status: 'cancelled', fee: 30 }, // sem nota
    ];
    const s = historyStats(h);
    expect(s.total).toBe(3);
    expect(s.earnings).toBeCloseTo((10 + 20 + 30) * 0.8);
    expect(s.avgRating).toBeCloseTo(4); // (5+3)/2
  });

  it('historyStats devolve avgRating null quando não há nota', () => {
    expect(historyStats([{ status: 'delivered', fee: 5 }]).avgRating).toBeNull();
    expect(historyStats([]).avgRating).toBeNull();
  });

  it('payoutStatusView mapeia os status de repasse', () => {
    expect(payoutStatusView('released')).toEqual({ label: 'Disponível', tone: 'available' });
    expect(payoutStatusView('paid')).toEqual({ label: 'Pago', tone: 'paid' });
    expect(payoutStatusView('requested').label).toBe('Saque solicitado');
    expect(payoutStatusView('zzz').tone).toBe('pending');
  });

  it('filterHistory filtra por status', () => {
    const h = [
      { _id: 'a', status: 'delivered' },
      { _id: 'b', status: 'cancelled' },
      { _id: 'c', status: 'delivered' },
    ];
    expect(filterHistory(h, 'all').length).toBe(3);
    expect(filterHistory(h, 'delivered').map((d) => d._id)).toEqual(['a', 'c']);
    expect(filterHistory(h, 'cancelled').map((d) => d._id)).toEqual(['b']);
  });
});
