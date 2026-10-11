import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import api from '../lib/api';

const push = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ query: { id: 'abc4821' }, push, back: jest.fn() }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: { children: React.ReactNode }) => <>{children}</> }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;
import ReciboPage from '../pages/pedido/[id]/recibo';
import { pedidoReciboHref } from '../lib/routes';

const nota = { invoiceNumber: '000418', deliveryFee: '7.40', motoboyAmount: '5.92', appCommission: '1.48', commissionPercent: '20', motoboyName: 'Carlos A. Silva', motoboyCpf: '12345678909', customerName: 'Ana Souza', storeName: 'Eletro Center', customerAddress: 'Av. Paulista, 1578', distance: 2.4, pickedAt: '2026-10-10T14:21:00', deliveredAt: '2026-10-10T14:29:00' };

test('pedidoReciboHref', () => {
  expect(pedidoReciboHref('o1')).toBe('/pedido/o1/recibo');
});

test('nota da entrega com valores, divisão e horários; sem CPF', async () => {
  get.mockResolvedValue({ data: nota });
  render(<ReciboPage />);
  expect(await screen.findByText('Nota de serviço nº 000418')).toBeInTheDocument();
  expect(screen.getByText('Serviço de entrega do pedido #BC4821 · 2,4 km')).toBeInTheDocument(); // shortOrderCode: 6 últimos, maiúsculas
  expect(screen.getByText('Carlos A. Silva · motoboy autônomo')).toBeInTheDocument();
  expect(screen.getByText('Plataforma DROP (20%)')).toBeInTheDocument();
  expect(screen.getByText('R$ 5,92')).toBeInTheDocument();
  expect(screen.queryByText(/123\.?456/)).toBeNull();
  expect(get).toHaveBeenCalledWith('/invoices/by-order/abc4821');
});

test('"Pedir nota à loja" abre a conversa com a loja', async () => {
  get.mockResolvedValue({ data: nota });
  render(<ReciboPage />);
  fireEvent.click(await screen.findByRole('button', { name: 'Pedir nota à loja' }));
  expect(push).toHaveBeenCalledWith('/pedido/abc4821/conversa?com=loja');
});

test('sem nota (404): diz que ainda não há recibo', async () => {
  get.mockRejectedValue({ response: { status: 404 } });
  render(<ReciboPage />);
  expect(await screen.findByText('Ainda não há recibo para este pedido')).toBeInTheDocument();
});
