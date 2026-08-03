import { isActiveOrder, pickActiveOrders, activeOrderView } from '../activeOrder';

describe('activeOrder', () => {
  it('isActiveOrder inclui criado e exclui terminais', () => {
    expect(isActiveOrder('criado')).toBe(true);
    expect(isActiveOrder('pago')).toBe(true);
    expect(isActiveOrder('enviado')).toBe(true);
    expect(isActiveOrder('entregue')).toBe(false);
    expect(isActiveOrder('cancelado')).toBe(false);
    expect(isActiveOrder('rejeitado')).toBe(false);
  });

  it('pickActiveOrders filtra ativos e ordena mais recente primeiro', () => {
    const orders = [
      { _id: 'a', status: 'pago', createdAt: '2026-08-01T10:00:00' },
      { _id: 'b', status: 'entregue', createdAt: '2026-08-03T10:00:00' },
      { _id: 'c', status: 'enviado', createdAt: '2026-08-02T10:00:00' },
    ];
    expect(pickActiveOrders(orders).map((o) => o._id)).toEqual(['c', 'a']);
  });

  it('activeOrderView: criado marca "Recebido" (não "Confirmado")', () => {
    const v = activeOrderView({ status: 'criado' });
    expect(v.statusLabel).toBe('Aguardando confirmação');
    expect(v.steps[0]).toEqual({ label: 'Recebido', done: true });
    expect(v.steps[1].done).toBe(false);
    expect(v.steps[2].done).toBe(false);
  });

  it('activeOrderView: enviado marca todos os steps done e label "A caminho"', () => {
    const v = activeOrderView({ status: 'enviado' });
    expect(v.statusLabel).toBe('A caminho');
    expect(v.steps.map((s) => s.done)).toEqual([true, true, true]);
    expect(v.steps[0].label).toBe('Confirmado');
  });

  it('activeOrderView: aguardando_motoboy → Preparando done, A caminho não', () => {
    const v = activeOrderView({ status: 'aguardando_motoboy' });
    expect(v.statusLabel).toBe('Buscando entregador');
    expect(v.steps.map((s) => s.done)).toEqual([true, true, false]);
  });
});
