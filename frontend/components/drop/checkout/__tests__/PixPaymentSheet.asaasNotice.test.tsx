import { render, screen } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import api from '../../../../lib/api';
import { PixPaymentSheet } from '../PixPaymentSheet';

jest.mock('../../../../lib/api');
const mockedApi = api as jest.Mocked<typeof api>;

const pix = { qrCodeImage: 'base64img', qrCodePayload: 'copia-cola', orderId: 'o1' };

beforeEach(() => {
  mockedApi.get.mockResolvedValue({ data: { paid: false } } as unknown as AxiosResponse);
});
afterEach(() => jest.clearAllMocks());

test('pedido direto: identifica o Asaas e o recebedor', () => {
  render(<PixPaymentSheet pix={pix} paymentProvider="asaas_loja" recipientName="Pizzaria do Zé" onPaid={() => {}} onClose={() => {}} />);
  expect(screen.getByText('Pix processado pelo Asaas. Recebedor: Pizzaria do Zé')).toBeInTheDocument();
});

test('pedido de custódia: sem o aviso', () => {
  render(<PixPaymentSheet pix={pix} paymentProvider="asaas" recipientName="Pizzaria do Zé" onPaid={() => {}} onClose={() => {}} />);
  expect(screen.queryByText(/Pix processado pelo Asaas/)).not.toBeInTheDocument();
});

test('sem provedor informado: sem o aviso', () => {
  render(<PixPaymentSheet pix={pix} onPaid={() => {}} onClose={() => {}} />);
  expect(screen.queryByText(/Pix processado pelo Asaas/)).not.toBeInTheDocument();
});
