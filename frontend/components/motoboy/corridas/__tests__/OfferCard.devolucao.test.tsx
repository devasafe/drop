import { render, screen } from '@testing-library/react';

jest.mock('../../../map/RouteThumbnail', () => ({ __esModule: true, RouteThumbnail: () => null, default: () => null }));
import { OfferCard } from '../OfferCard';

/** Oferta da corrida de devolução: etiqueta própria e as pernas no sentido certo (cliente → loja). */
test('devolução: etiqueta "Devolução", retirada na casa do cliente e entrega na loja', () => {
  const d = {
    _id: 'd9', orderId: 'ord0000004821', kind: 'devolucao', fee: 10, distance: 4,
    storeAddress: 'R. Aurora, 112, Vila Mariana', storeLatitude: -23.54, storeLongitude: -46.64,
    customerAddress: 'R. dos Pinheiros, 870, Pinheiros', customerLatitude: -23.56, customerLongitude: -46.69,
  };
  render(<OfferCard delivery={d} self={null} accepting={false} onAccept={jest.fn()} onSkip={jest.fn()} />);
  expect(screen.getByText('Devolução')).toBeInTheDocument();
  expect(screen.queryByText('Nova corrida')).not.toBeInTheDocument();
  expect(screen.getByText('Retirada com o cliente')).toBeInTheDocument();
  expect(screen.getByText('Levar à loja')).toBeInTheDocument();
});
