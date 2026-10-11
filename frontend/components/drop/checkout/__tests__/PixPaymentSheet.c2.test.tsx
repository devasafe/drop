import { render, screen } from '@testing-library/react';
import { PixPaymentSheet } from '../PixPaymentSheet';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => new Promise(() => {})) } }));

const pix = { orderId: 'xyzabc4821', qrCodeImage: 'img', qrCodePayload: 'copia-cola', serverNow: new Date().toISOString() } as any;

it('cartão do mock: pedido e loja, valor, QR e depois o botão de copiar', () => {
  render(<PixPaymentSheet pix={pix} amount={244} storeName="Eletro Center" onPaid={() => {}} onClose={() => {}} />);
  expect(screen.getByText('Pedido #BC4821 · Eletro Center')).toBeInTheDocument(); // shortOrderCode: os 6 últimos, em maiúsculas
  const qr = screen.getByAltText('QR Code PIX');
  const copiar = screen.getByRole('button', { name: /Copiar código Pix/ });
  expect(qr.compareDocumentPosition(copiar) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(screen.getByText('Aguardando pagamento')).toBeInTheDocument();
  expect(screen.getByText('Confirmamos sozinhos, pode trocar de app e voltar.')).toBeInTheDocument();
});

it('loja recebe: bloco do recebedor com o nome que o banco mostra', () => {
  render(<PixPaymentSheet pix={pix} amount={277.2} paymentProvider="asaas_loja" recipientName="Eletro Center" storeName="Eletro Center" onPaid={() => {}} onClose={() => {}} />);
  const bloco = screen.getByRole('region', { name: 'Quem recebe' });
  expect(bloco).toHaveTextContent('No app do banco vai aparecer');
  expect(bloco).toHaveTextContent('Eletro Center');
  expect(bloco).toHaveTextContent('É a própria loja recebendo, pelo Asaas dela.');
});
