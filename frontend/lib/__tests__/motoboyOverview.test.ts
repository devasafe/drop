import { isToday, earningsToday, deliveriesToday, avgRating } from '../motoboyOverview';

const NOW = new Date('2026-08-03T12:00:00');
const today = '2026-08-03T09:00:00';
const yesterday = '2026-08-02T09:00:00';

describe('motoboyOverview', () => {
  it('earningsToday soma 80% da taxa das entregues de hoje', () => {
    const h = [
      { status: 'delivered', fee: 10, updatedAt: today },
      { status: 'delivered', fee: 20, updatedAt: yesterday }, // ontem, não conta
      { status: 'cancelled', fee: 30, updatedAt: today },     // cancelada, não conta
    ];
    expect(earningsToday(h, NOW)).toBeCloseTo(8); // 10 * 0.8
  });

  it('deliveriesToday conta só as entregues de hoje', () => {
    const h = [
      { status: 'delivered', updatedAt: today },
      { status: 'delivered', updatedAt: today },
      { status: 'delivered', updatedAt: yesterday },
    ];
    expect(deliveriesToday(h, NOW)).toBe(2);
  });

  it('avgRating ignora sem nota e devolve null quando vazio', () => {
    expect(avgRating([{ rating: 5 }, { rating: 3 }, { rating: 0 }, {}])).toBeCloseTo(4);
    expect(avgRating([])).toBeNull();
    expect(avgRating([{ rating: 0 }])).toBeNull();
  });

  it('isToday distingue hoje de ontem', () => {
    expect(isToday(today, NOW)).toBe(true);
    expect(isToday(yesterday, NOW)).toBe(false);
  });
});
