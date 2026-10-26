import { adminReturnRideStatus } from '../adminOps';

/** Caso B: a corrida de devolução na lista "Pedidos ao vivo" (o pedido já está entregue). */
test.each([
  ['pending', 'Devolução · procurando motoboy', 'warn'],
  ['assigned', 'Devolução · indo ao cliente', 'info'],
  ['picked', 'Devolução · levando à loja', 'info'],
])('%s → %s', (status, label, tone) => {
  expect(adminReturnRideStatus(status)).toEqual({ label, tone });
});
