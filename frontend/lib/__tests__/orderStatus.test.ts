import { orderStatusLabel, orderStatusTone } from '../orderStatus';

describe('orderStatus', () => {
  it('rótulos legíveis pt-BR', () => {
    expect(orderStatusLabel('aguardando_motoboy')).toBe('Aguardando motoboy');
    expect(orderStatusLabel('entregue')).toBe('Entregue');
    expect(orderStatusLabel('delivered')).toBe('Entregue');
    expect(orderStatusLabel('cancelado')).toBe('Cancelado');
    expect(orderStatusLabel('criado')).toBe('Aguardando aceite');
  });
  it('status desconhecido → devolve o próprio status', () => {
    expect(orderStatusLabel('zzz_novo')).toBe('zzz_novo');
  });
  it('tom por estado', () => {
    expect(orderStatusTone('criado')).toBe('pending');
    expect(orderStatusTone('aguardando_motoboy')).toBe('active');
    expect(orderStatusTone('entregue')).toBe('done');
    expect(orderStatusTone('rejeitado')).toBe('cancelled');
    expect(orderStatusTone('zzz')).toBe('pending');
  });
});
