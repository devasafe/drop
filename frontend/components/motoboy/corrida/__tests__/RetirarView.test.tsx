import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent } from '@testing-library/react';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

jest.mock('../../../map/RouteThumbnail', () => ({
  __esModule: true,
  RouteThumbnail: (p: any) => <button type="button" data-testid="mapa" data-height={p.height} onClick={p.onExpand} />,
  default: () => null,
}));
import { RetirarView } from '../RetirarView';

const T0 = new Date('2026-10-14T14:20:00Z').getTime();
const ride = {
  _id: 'd1', orderId: 'ord0000004821', status: 'assigned', pinRetirada: '48213', assignedAt: new Date(T0).toISOString(),
  storeLatitude: -23.56, storeLongitude: -46.68, deliveryLat: -23.55, deliveryLng: -46.69,
  storeAddress: 'R. dos Pinheiros, 870, Pinheiros, São Paulo',
  storeObj: { _id: 's1', name: 'Eletro Center', telefone: '(11) 3333-4444' },
  order: { products: [{ productName: 'Fone', quantity: 1 }, { productName: 'Cabo USB-C', quantity: 1 }] },
};
const handlers = () => ({ onChat: jest.fn(), onProblem: jest.fn(), onReturn: jest.fn() });

test('retirar: mapa 180, loja, PIN em destaque, itens e problema', () => {
  const h = handlers();
  render(<RetirarView ride={ride} now={T0 + 2 * 60_000} self={null} {...h} />);
  expect(screen.getByTestId('mapa')).toHaveAttribute('data-height', '180');
  expect(screen.getByText('Eletro Center')).toBeInTheDocument();
  expect(screen.getByText('Mostre este código na loja')).toBeInTheDocument();
  expect(screen.getByTestId('pin-retirada')).toHaveTextContent('48213');
  expect(screen.getByText('Aguardando a loja validar')).toBeInTheDocument();
  expect(screen.getByText('Quando a loja digitar o código, esta tela muda sozinha para a entrega.')).toBeInTheDocument();
  expect(screen.getByText('O que você vai levar')).toBeInTheDocument();
  expect(screen.getByText('Pedido #004821')).toBeInTheDocument();
  expect(screen.getByText('2 itens (Fone e Cabo USB-C)')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Abrir no mapa/ })).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=-23.56,-46.68&travelmode=driving');
  expect(screen.getByRole('link', { name: 'Ligar para a loja' })).toHaveAttribute('href', 'tel:1133334444');
  fireEvent.click(screen.getByRole('button', { name: 'Mensagem para a loja' }));
  expect(h.onChat).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Tive um problema na retirada' }));
  expect(h.onProblem).toHaveBeenCalled();
});

test('tocar no mapa chama onOpenNav', () => {
  const onOpenNav = jest.fn();
  render(<RetirarView ride={ride} now={T0 + 60_000} self={null} {...handlers()} onOpenNav={onOpenNav} />);
  fireEvent.click(screen.getByTestId('mapa'));
  expect(onOpenNav).toHaveBeenCalledTimes(1);
});

test('retirada atrasada (10 min ou mais): alerta, relógio e Devolver corrida', () => {
  const h = handlers();
  render(<RetirarView ride={ride} now={T0 + 12 * 60_000 + 4_000} self={null} {...h} />);
  expect(screen.getByText('A retirada já leva 12 min')).toBeInTheDocument();
  expect(screen.getByText('Aguardando a loja · 12:04')).toBeInTheDocument();
  expect(screen.getByTestId('pin-retirada')).toHaveTextContent('48213');
  expect(screen.queryByTestId('mapa')).not.toBeInTheDocument();
  expect(screen.getByText('Se não der para esperar')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Suporte' })).toHaveAttribute('href', '/motoboy/perfil/ajuda');
  fireEvent.click(screen.getByRole('button', { name: 'Devolver corrida' }));
  expect(h.onReturn).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Tive um problema na retirada' })).not.toBeInTheDocument();
});

test('9 min ainda não é atraso', () => {
  render(<RetirarView ride={ride} now={T0 + 9 * 60_000 + 59_000} self={null} {...handlers()} />);
  expect(screen.queryByText(/A retirada já leva/)).not.toBeInTheDocument();
});

test('sem telefone da loja não mostra ligar; sem assignedAt não há atraso', () => {
  render(<RetirarView ride={{ ...ride, assignedAt: null, storeObj: { ...ride.storeObj, telefone: '-' } }} now={T0 + 60 * 60_000} self={null} {...handlers()} />);
  expect(screen.queryByRole('link', { name: 'Ligar para a loja' })).not.toBeInTheDocument();
  expect(screen.queryByText(/A retirada já leva/)).not.toBeInTheDocument();
});

test('CSS da corrida só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'Corrida.module.css'), 'utf8'))).toEqual([]);
});
