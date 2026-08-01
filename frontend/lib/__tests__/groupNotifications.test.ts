import { groupByDay } from '../groupNotifications';

describe('groupByDay', () => {
  const now = new Date('2026-08-01T12:00:00');
  it('agrupa por dia com rótulos Hoje/Ontem/data', () => {
    const items = [
      { _id: 'a', createdAt: '2026-08-01T10:00:00' },
      { _id: 'a2', createdAt: '2026-08-01T08:00:00' },
      { _id: 'b', createdAt: '2026-07-31T10:00:00' },
      { _id: 'c', createdAt: '2026-07-29T10:00:00' },
    ];
    const groups = groupByDay(items, now);
    expect(groups.map((g) => g.label)).toEqual(['Hoje', 'Ontem', '29 de jul']);
    expect(groups[0].items.map((i) => i._id)).toEqual(['a', 'a2']);
    expect(groups[1].items.map((i) => i._id)).toEqual(['b']);
  });
  it('lista vazia → []', () => {
    expect(groupByDay([], now)).toEqual([]);
  });
  it('ordena grupos do mais recente para o mais antigo', () => {
    const items = [
      { _id: 'old', createdAt: '2026-07-20T10:00:00' },
      { _id: 'new', createdAt: '2026-08-01T10:00:00' },
    ];
    expect(groupByDay(items, now).map((g) => g.label)).toEqual(['Hoje', '20 de jul']);
  });
});
