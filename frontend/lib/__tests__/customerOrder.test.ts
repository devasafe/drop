import { customerOrderStatus, orderTimelineSteps, isPlan1Order, shortOrderCode } from '../customerOrder';

const base = { _id: 'abc123def456', status: 'pago', paymentStatus: 'paid', deliveryFee: 7.4, deliveryId: 'd1', createdAt: '2026-10-10T14:02:00', acceptedAt: '2026-10-10T14:03:00' };

describe('customerOrderStatus', () => {
  it.each([
    [{ status: 'criado', paymentStatus: 'pending' }, undefined, 'awaiting_payment'],
    [{ status: 'criado', paymentStatus: 'paid' }, undefined, 'awaiting_store'],
    [base, { status: 'pending' }, 'finding_courier'],
    [base, { status: 'assigned' }, 'preparing'],
    [base, { status: 'picked' }, 'out_for_delivery'],
    [base, { status: 'delivered' }, 'delivered'],
    [base, { status: 'cancelled' }, 'problem'],
    [{ ...base, status: 'cancelado' }, { status: 'picked' }, 'cancelled'],
    [{ ...base, status: 'rejeitado' }, undefined, 'cancelled'],
    [{ status: 'pago', deliveryFee: 0, paymentProvider: 'asaas' }, undefined, 'in_progress'],
    [{ status: 'pago', deliveryFee: 7.4 }, undefined, 'preparing'],
  ])('%p + %p → %s', (order, delivery, expected) => {
    expect(customerOrderStatus(order, delivery)).toBe(expected);
  });
});

describe('orderTimelineSteps', () => {
  const st = (steps: any[]) => steps.map((s) => [s.label, s.state]);
  it('saiu para entrega: hora real onde existe e entregador no detalhe', () => {
    const steps = orderTimelineSteps(base, { status: 'picked', motoboyObj: { name: 'Carlos Silva', plate: 'ABC1D23' } });
    expect(st(steps)).toEqual([
      ['Pedido feito', 'done'], ['Pagamento confirmado', 'done'], ['Loja aceitou', 'done'],
      ['Entregador a caminho da loja', 'done'], ['Saiu para entrega', 'current'], ['Entregue', 'upcoming'],
    ]);
    expect(steps[0].time).toBe('14:02');
    expect(steps[2].time).toBe('14:03');
    expect(steps[3].detail).toBe('Carlos Silva · ABC1D23');
    expect(steps[4].time).toBeUndefined();
  });
  it('procurando entregador', () => {
    expect(st(orderTimelineSteps(base, { status: 'pending' }))[3]).toEqual(['Procurando entregador', 'current']);
  });
  it('Plano 1: combinar a entrega com a loja', () => {
    expect(st(orderTimelineSteps({ ...base, deliveryFee: 0, deliveryId: null }))).toEqual([
      ['Pedido feito', 'done'], ['Pagamento confirmado', 'done'], ['Loja aceitou', 'done'],
      ['Combine a entrega com a loja', 'current'], ['Recebido', 'upcoming'],
    ]);
  });
  it('cancelado depois do aceite termina em erro com a hora', () => {
    const steps = orderTimelineSteps({ ...base, status: 'cancelado', cancelledAt: '2026-10-10T14:10:00' }, { status: 'cancelled' });
    expect(steps[steps.length - 1]).toMatchObject({ label: 'Cancelado', state: 'error', time: '14:10' });
    expect(st(steps).slice(0, 3).every(([, s]) => s === 'done')).toBe(true);
  });
  it('recusado pela loja', () => {
    const steps = orderTimelineSteps({ ...base, status: 'rejeitado', acceptedAt: null });
    expect(steps[steps.length - 1]).toMatchObject({ label: 'Recusado pela loja', state: 'error' });
  });
  it('cancelado e estornado mantém "Pagamento confirmado" concluído', () => {
    const steps = orderTimelineSteps({ _id: 'x', status: 'cancelado', paymentStatus: 'refunded', deliveryFee: 7.4 });
    expect(st(steps)).toEqual([['Pedido feito', 'done'], ['Pagamento confirmado', 'done'], ['Cancelado', 'error']]);
  });
  it('aguardando pagamento: o passo atual não diz "confirmado"', () => {
    const steps = orderTimelineSteps({ _id: 'x', status: 'criado', paymentStatus: 'pending', deliveryFee: 7.4, deliveryId: 'd1' });
    expect(st(steps)[1]).toEqual(['Aguardando pagamento', 'current']);
    expect(steps.some((s) => s.label === 'Pagamento confirmado')).toBe(false);
  });
  it('data inválida não vira "Invalid Date": a hora é omitida', () => {
    const steps = orderTimelineSteps({ ...base, createdAt: 'lixo', acceptedAt: 'nada' });
    expect(steps[0].time).toBeUndefined();
    expect(steps[2].time).toBeUndefined();
  });
  it('entregue: tudo feito', () => {
    expect(orderTimelineSteps({ ...base, status: 'entregue' }, { status: 'delivered' }).every((s) => s.state === 'done')).toBe(true);
  });
  it('isPlan1Order e código curto', () => {
    expect(isPlan1Order({ deliveryFee: 0 })).toBe(true);
    expect(isPlan1Order({ deliveryFee: 0, paymentProvider: 'asaas_loja' })).toBe(false);
    expect(shortOrderCode('abc123def456')).toBe('DEF456');
  });
});
