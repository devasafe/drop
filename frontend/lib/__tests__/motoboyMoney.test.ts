import {
  payoutToMoney, transferToMoney, moneyBadge, transferView, sumPayoutParts, indexMoney, moneyFor, isLateTransfer,
  dayLabel, inMonth, monthName, groupByDay, sumAll, windowCovered, weekBars, isThisWeek, isToday, deliveryDate,
} from '../motoboyMoney';

const NOW = new Date('2026-10-14T15:00:00-03:00'); // quarta-feira
const payout = (o: any) => payoutToMoney({ _id: 'p', amount: 10, status: 'pending', blocked: false, createdAt: '2026-10-14T10:00:00-03:00', ...o })!;
const transfer = (o: any) => transferToMoney({ id: 't', orderId: 'o', amount: 8, status: 'done', createdAt: '2026-10-14T10:00:00-03:00', ...o })!;

describe('badge do dinheiro', () => {
  it('repasse da custódia: a liberar, liberado, saque pedido, sacado, bloqueado', () => {
    expect(moneyBadge(payout({ status: 'pending' }))).toEqual({ label: 'A liberar', tone: 'warn' });
    expect(moneyBadge(payout({ status: 'released' }))).toEqual({ label: 'Liberado', tone: 'ok' });
    expect(moneyBadge(payout({ status: 'requested' }))).toEqual({ label: 'Saque pedido', tone: 'info' });
    expect(moneyBadge(payout({ status: 'paid' }))).toEqual({ label: 'Sacado', tone: 'neutral' });
    expect(moneyBadge(payout({ status: 'pending', blocked: true }))).toEqual({ label: 'Bloqueado', tone: 'err' });
    // pago não volta a "bloqueado" mesmo com a marca antiga
    expect(moneyBadge(payout({ status: 'paid', blocked: true })).label).toBe('Sacado');
    // status desconhecido nunca vira "liberado"
    expect(moneyBadge(payout({ status: 'zzz' }))).toEqual({ label: 'Em conferência', tone: 'neutral' });
  });

  it('Pix da loja (direto): na conta, a caminho, atrasado — sem código interno', () => {
    expect(moneyBadge(transfer({ status: 'done' }))).toEqual({ label: 'Na conta', tone: 'ok' });
    for (const s of ['pending', 'requested']) expect(moneyBadge(transfer({ status: s })).label).toBe('A caminho');
    for (const s of ['failed', 'failed_final', 'uncertain']) {
      expect(moneyBadge(transfer({ status: s }))).toEqual({ label: 'Atrasado', tone: 'warn' });
      expect(isLateTransfer(transfer({ status: s }))).toBe(true);
    }
    expect(isLateTransfer(transfer({ status: 'pending' }))).toBe(false);
  });

  it('valor não numérico não vira dinheiro', () => {
    expect(payoutToMoney({ _id: 'x', amount: 'abc', status: 'pending' })).toBeNull();
    expect(transferToMoney({ id: 'x', amount: undefined, status: 'done' })).toBeNull();
    expect(payoutToMoney({ _id: 'x', amount: '7.10', status: 'pending' })!.amount).toBe(7.1);
  });
});

describe('dinheiro de cada corrida', () => {
  it('acha pelo deliveryId; senão pelo pedido com um registro só; ambíguo → null', () => {
    const idx = indexMoney([
      payout({ _id: 'p1', deliveryId: 'd1', orderId: 'o1', amount: 9.6 }),
      transfer({ id: 't2', orderId: 'o2', amount: 12 }),
      payout({ _id: 'p3', orderId: 'o3', amount: 1 }),
      payout({ _id: 'p4', orderId: 'o3', amount: 2 }),
    ]);
    expect(moneyFor(idx, { _id: 'd1', orderId: 'outro' })!.amount).toBe(9.6);
    expect(moneyFor(idx, { _id: 'dx', orderId: 'o2' })!.amount).toBe(12);
    expect(moneyFor(idx, { _id: 'dy', orderId: 'o3' })).toBeNull();
    expect(moneyFor(idx, { _id: 'dz', orderId: 'nada' })).toBeNull();
  });
});

describe('datas no fuso de São Paulo', () => {
  it('Hoje, Ontem e dd/mm', () => {
    expect(dayLabel('2026-10-14T00:30:00-03:00', NOW)).toBe('Hoje');
    expect(dayLabel('2026-10-13T23:59:00-03:00', NOW)).toBe('Ontem');
    expect(dayLabel('2026-09-30T10:00:00-03:00', NOW)).toBe('30/09');
  });
  it('mês corrente e nome do mês', () => {
    expect(inMonth('2026-10-01T00:10:00-03:00', NOW)).toBe(true);
    expect(inMonth('2026-09-30T23:50:00-03:00', NOW)).toBe(false);
    expect(inMonth(null, NOW)).toBe(false);
    expect(monthName(NOW)).toBe('Outubro');
  });
  it('data da corrida: entregue, cancelada, atualizada', () => {
    expect(deliveryDate({ deliveredAt: 'a', cancelledAt: 'b', updatedAt: 'c' })).toBe('a');
    expect(deliveryDate({ cancelledAt: 'b', updatedAt: 'c' })).toBe('b');
    expect(deliveryDate({ updatedAt: 'c' })).toBe('c');
  });
  it('agrupa por dia mantendo a ordem', () => {
    const g = groupByDay(
      [{ d: '2026-10-14T14:00:00-03:00' }, { d: '2026-10-14T09:00:00-03:00' }, { d: '2026-10-13T20:00:00-03:00' }, { d: null }],
      (x) => x.d,
      NOW,
    );
    expect(g.map((x) => [x.label, x.items.length])).toEqual([['Hoje', 2], ['Ontem', 1], ['Sem data', 1]]);
  });
  it('hoje e esta semana (segunda a domingo)', () => {
    expect(isToday('2026-10-14T01:00:00-03:00', NOW)).toBe(true);
    expect(isThisWeek('2026-10-12T00:10:00-03:00', NOW)).toBe(true); // segunda
    expect(isThisWeek('2026-10-18T23:00:00-03:00', NOW)).toBe(true); // domingo
    expect(isThisWeek('2026-10-11T23:00:00-03:00', NOW)).toBe(false); // domingo passado
  });
});

describe('somas sem total parcial', () => {
  it('sumAll: um valor faltando → null', () => {
    expect(sumAll([9.6, 5.68])).toBe(15.28);
    expect(sumAll([9.6, null])).toBeNull();
    expect(sumAll([])).toBe(0);
  });
  it('windowCovered: lista inteira ou já passou da janela', () => {
    const inToday = (iso: string) => isToday(iso, NOW);
    expect(windowCovered(['2026-10-14T10:00:00-03:00'], false, inToday)).toBe(true);
    expect(windowCovered(['2026-10-14T10:00:00-03:00', '2026-10-13T10:00:00-03:00'], true, inToday)).toBe(true);
    expect(windowCovered(['2026-10-14T10:00:00-03:00'], true, inToday)).toBe(false);
    expect(windowCovered([], true, inToday)).toBe(false);
  });
  it('weekBars: só a semana, sem cancelados, melhor dia', () => {
    const w = weekBars([
      payout({ amount: 7.04, createdAt: '2026-10-12T10:00:00-03:00' }),
      payout({ amount: 12, createdAt: '2026-10-13T19:44:00-03:00' }),
      payout({ amount: 9.6, createdAt: '2026-10-14T14:32:00-03:00' }),
      payout({ amount: 3, status: 'cancelled', createdAt: '2026-10-14T09:00:00-03:00' }),
      payout({ amount: 20, createdAt: '2026-10-05T10:00:00-03:00' }),
    ], NOW);
    expect(w.total).toBe(28.64);
    expect(w.count).toBe(3);
    expect(w.bestDay).toBe('terça');
    expect(w.days.map((d) => d.label)).toEqual(['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom']);
    expect(w.days[1]).toEqual({ label: 'ter', total: 12, best: true });
  });
});

describe('K30: transferView único e fail closed', () => {
  it('rótulo e tom por status, sem otimismo para status desconhecido', () => {
    expect(transferView('done')).toMatchObject({ label: 'Na conta', tone: 'ok' });
    expect(transferView('pending')).toMatchObject({ label: 'A caminho', tone: 'info' });
    expect(transferView('failed_final')).toMatchObject({ label: 'Atrasado', tone: 'warn' });
    expect(transferView('zzz')).toMatchObject({ label: 'Em conferência', tone: 'neutral' });
    expect(transferView('')).toMatchObject({ label: 'Em conferência', tone: 'neutral' });
    expect(moneyBadge(transfer({ status: 'zzz' }))).toEqual({ label: 'Em conferência', tone: 'neutral' });
    // failed_final e uncertain não viram "pago" nem "Na conta"
    for (const s of ['failed_final', 'uncertain']) expect(transferView(s).label).not.toBe('Na conta');
  });
});

describe('payout dividido por saque', () => {
  it('soma em centavos todas as partes do mesmo deliveryId, sem cancelados', () => {
    const parts = [payout({ amount: 0.1 }), payout({ amount: 0.2 }), payout({ amount: 5, status: 'cancelled' })];
    expect(sumPayoutParts(parts)).toEqual({ amount: 0.3, status: 'pending' });
  });
  it('status misto não afirma "Liberado"', () => {
    const r = sumPayoutParts([payout({ status: 'released', amount: 4 }), payout({ status: 'paid', amount: 5 })])!;
    expect(r.amount).toBe(9);
    expect(r.status).toBe('');
    expect(moneyBadge({ ...payout({ amount: 9 }), status: r.status })).toEqual({ label: 'Em conferência', tone: 'neutral' });
  });
  it('sem partes ou valor estranho → null', () => {
    expect(sumPayoutParts([])).toBeNull();
    expect(sumPayoutParts([payout({ status: 'cancelled' })])).toBeNull();
  });
  it('moneyFor com vários registros do mesmo deliveryId devolve a soma, badge só se status igual', () => {
    const idx = indexMoney([
      payout({ _id: 'a', deliveryId: 'd9', amount: 4, status: 'released' }),
      payout({ _id: 'b', deliveryId: 'd9', amount: 5, status: 'paid' }),
    ]);
    const m = moneyFor(idx, { _id: 'd9' })!;
    expect(m.amount).toBe(9);
    expect(moneyBadge(m).label).not.toBe('Liberado');
  });
});

describe('weekBars com repasse dividido por saque', () => {
  it('original e pedaço do saque nesta semana: 1 corrida e o valor total no dia do original', () => {
    const w = weekBars([
      payout({ _id: 'a', deliveryId: 'd1', amount: 0.1, createdAt: '2026-10-12T10:00:00-03:00' }),
      payout({ _id: 'b', deliveryId: 'd1', amount: 0.2, createdAt: '2026-10-14T09:00:00-03:00' }),
      payout({ _id: 'c', deliveryId: 'd1', amount: 9, status: 'cancelled', createdAt: '2026-10-13T09:00:00-03:00' }),
    ], NOW);
    expect(w.count).toBe(1);
    expect(w.total).toBe(0.3);
    expect(w.days[0].total).toBe(0.3);
    expect(w.days[2].total).toBe(0);
  });
  it('original na semana passada + pedaço nesta: não entra nesta semana', () => {
    const w = weekBars([
      payout({ _id: 'a', deliveryId: 'd2', amount: 5, createdAt: '2026-10-05T10:00:00-03:00' }),
      payout({ _id: 'b', deliveryId: 'd2', amount: 4, createdAt: '2026-10-14T09:00:00-03:00' }),
    ], NOW);
    expect(w.count).toBe(0);
    expect(w.total).toBe(0);
  });
  it('registros sem deliveryId continuam individuais', () => {
    const w = weekBars([payout({ _id: 'a', amount: 1 }), payout({ _id: 'b', amount: 2 })], NOW);
    expect(w.count).toBe(2);
    expect(w.total).toBe(3);
  });
});

describe('moneyFor e cancelados', () => {
  it('registro de outra entrega (deliveryId d1) não casa pelo pedido', () => {
    const idx = indexMoney([payout({ _id: 'p', deliveryId: 'd1', orderId: 'o1', amount: 3 })]);
    expect(moneyFor(idx, { _id: 'dx', orderId: 'o1' })).toBeNull();
  });
  it('todas as partes canceladas: Cancelado para 1 ou N', () => {
    const one = moneyFor(indexMoney([payout({ _id: 'a', deliveryId: 'd', status: 'cancelled' })]), { _id: 'd' })!;
    const many = moneyFor(indexMoney([payout({ _id: 'a', deliveryId: 'd', status: 'cancelled' }), payout({ _id: 'b', deliveryId: 'd', status: 'cancelled' })]), { _id: 'd' })!;
    expect(moneyBadge(one).label).toBe('Cancelado');
    expect(moneyBadge(many).label).toBe('Cancelado');
  });
});

describe('detail do Pix', () => {
  it('texto por status', () => {
    expect(transferView('failed').detail).toBe('A loja vai tentar de novo.');
    expect(transferView('uncertain').detail).toBe('Em conferência pela DROP.');
    expect(transferView('failed_final').detail).toBe('As tentativas acabaram — a DROP está cuidando do seu repasse.');
    expect(transferView('pending').detail).toBe('A caminho da sua conta.');
    expect(transferView('requested').detail).toBe('A caminho da sua conta.');
    expect(transferView('done').detail).toBe('');
    expect(transferView('zzz').detail).toBe('Em conferência.');
  });
});
