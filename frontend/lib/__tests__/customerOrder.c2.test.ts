import { orderTimelineSteps } from '../customerOrder';

const order = { _id: 'o1', status: 'pago', paymentStatus: 'paid', deliveryId: 'd1', createdAt: '2026-10-10T14:02:00', acceptedAt: '2026-10-10T14:03:00' };
const hora = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

it('hora real de aceite do entregador, da retirada e da entrega', () => {
  const steps = orderTimelineSteps({ ...order, status: 'entregue' }, {
    status: 'delivered', motoboyObj: { name: 'Carlos' },
    assignedAt: '2026-10-10T14:10:00', pickedAt: '2026-10-10T14:21:00', deliveredAt: '2026-10-10T14:29:00',
  });
  const t = Object.fromEntries(steps.map((s) => [s.label, s.time]));
  expect(t['Entregador a caminho da loja']).toBe(hora('2026-10-10T14:10:00'));
  expect(t['Saiu para entrega']).toBe(hora('2026-10-10T14:21:00'));
  expect(t['Entregue']).toBe(hora('2026-10-10T14:29:00'));
});

it('sem as horas novas (pedido antigo), nada é inventado', () => {
  const steps = orderTimelineSteps(order, { status: 'picked', motoboyObj: { name: 'Carlos' } });
  expect(steps.find((s) => s.label === 'Saiu para entrega')?.time).toBeUndefined();
});
