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

  it('activeOrderView: os 5 passos são Criado/Pago/Aceito/A caminho/Entregue', () => {
    const labels = activeOrderView({ status: 'criado' }).steps.map((s) => s.label);
    expect(labels).toEqual(['Criado', 'Pago', 'Aceito', 'A caminho', 'Entregue']);
  });

  it('activeOrderView: criado → só "Criado" concluído', () => {
    const v = activeOrderView({ status: 'criado' });
    expect(v.statusLabel).toBe('Aguardando confirmação');
    expect(v.steps.map((s) => s.done)).toEqual([true, false, false, false, false]);
    expect(v.progress).toBeCloseTo(0.2);
  });

  it('activeOrderView: aguardando_motoboy → até "Aceito" concluído', () => {
    const v = activeOrderView({ status: 'aguardando_motoboy' });
    expect(v.statusLabel).toBe('Buscando entregador');
    expect(v.steps.map((s) => s.done)).toEqual([true, true, true, false, false]);
  });

  it('activeOrderView: enviado → até "A caminho" concluído, "Entregue" não', () => {
    const v = activeOrderView({ status: 'enviado' });
    expect(v.statusLabel).toBe('A caminho');
    expect(v.steps.map((s) => s.done)).toEqual([true, true, true, true, false]);
    expect(v.progress).toBeCloseTo(0.8);
  });
});
