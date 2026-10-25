import { customerOrderStatus, orderTimelineSteps } from '../customerOrder';
import { orderStatusView } from '../../components/drop/OrderStatusBadge';

/** Pedido sem motoboy e entrega interrompida (DS v2: "Pedido · sem motoboy" e "Pedido · entrega não concluída"). */
const base = { _id: 'abc123def456', status: 'aguardando_motoboy', paymentStatus: 'paid', deliveryFee: 7.4, deliveryId: 'd1', createdAt: '2026-10-10T14:02:00', acceptedAt: '2026-10-10T14:03:00' };
const st = (steps: any[]) => steps.map((s) => [s.label, s.state]);

describe('sem motoboy por enquanto', () => {
  it('pool expirou e o cliente ainda não decidiu', () => {
    expect(customerOrderStatus({ ...base, awaitingCustomerPoolDecision: true }, { status: 'pending' })).toBe('no_courier');
    expect(orderStatusView('no_courier').label).toBe('Sem motoboy por enquanto');
  });
  it('um motoboy aceitou antes da decisão: segue o fluxo normal', () => {
    expect(customerOrderStatus({ ...base, awaitingCustomerPoolDecision: true }, { status: 'assigned' })).toBe('preparing');
  });
  it('a linha do tempo continua em "Procurando entregador"', () => {
    expect(st(orderTimelineSteps({ ...base, awaitingCustomerPoolDecision: true }, { status: 'pending' }))[3]).toEqual(['Procurando entregador', 'current']);
  });
});

describe('entrega interrompida (pacote voltando para a loja)', () => {
  const returning = { status: 'picked', statusDevolucao: 'aguardando_confirmacao', pickedAt: '2026-10-10T14:21:00', motoboyObj: { name: 'Carlos Silva' } };

  it('não diz mais "Saiu para entrega"', () => {
    expect(customerOrderStatus({ ...base, status: 'enviado' }, returning)).toBe('returning');
    expect(orderStatusView('returning').label).toBe('Entrega interrompida');
  });
  it('cancelado vence a devolução (cliente pediu reembolso ou o admin cancelou)', () => {
    expect(customerOrderStatus({ ...base, status: 'cancelado' }, returning)).toBe('cancelled');
  });
  it('devolução confirmada com nova entrega: volta a procurar entregador', () => {
    expect(customerOrderStatus({ ...base }, { status: 'pending', statusDevolucao: 'confirmado' })).toBe('finding_courier');
  });

  it('linha do tempo: retirou, interrompeu, voltando para a loja, decisão', () => {
    const steps = orderTimelineSteps({ ...base, status: 'enviado' }, returning);
    expect(st(steps)).toEqual([
      ['Pedido feito', 'done'], ['Pagamento confirmado', 'done'], ['Loja aceitou', 'done'],
      ['Carlos retirou na loja', 'done'], ['Entrega interrompida', 'error'],
      ['Voltando para a loja', 'current'], ['Nova entrega ou reembolso', 'upcoming'],
    ]);
    expect(steps[3].time).toBe('14:21');
    expect(steps[5].detail).toBe('a loja confirma com um código');
  });
  it('depois de escolher nova entrega, o último passo diz isso', () => {
    const steps = orderTimelineSteps({ ...base, status: 'enviado' }, { ...returning, pendingReturnAction: 'reassign' });
    expect(steps[6]).toMatchObject({ label: 'Nova entrega', state: 'upcoming' });
  });
});
