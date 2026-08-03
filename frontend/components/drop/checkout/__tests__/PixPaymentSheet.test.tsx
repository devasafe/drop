import { render, screen, waitFor, fireEvent, act } from '@testing-library/react';
import type { AxiosResponse } from 'axios';
import api from '../../../../lib/api';
import { PixPaymentSheet } from '../PixPaymentSheet';

jest.mock('../../../../lib/api');
const mockedApi = api as jest.Mocked<typeof api>;

const pix = {
  qrCodeImage: 'base64img',
  qrCodePayload: 'copia-cola',
  orderId: 'o1',
};

afterEach(() => {
  jest.clearAllMocks();
});

test('quando pago chama onPaid', async () => {
  jest.useFakeTimers();
  mockedApi.get.mockResolvedValue({ data: { paid: true } } as unknown as AxiosResponse);
  const onPaid = jest.fn();
  render(<PixPaymentSheet pix={pix} onPaid={onPaid} onClose={() => {}} />);

  await waitFor(() => expect(screen.getByText(/pagamento confirmado/i)).toBeInTheDocument());

  await act(async () => {
    jest.advanceTimersByTime(1800);
  });

  expect(onPaid).toHaveBeenCalledWith('o1');
  jest.useRealTimers();
});

test('exibe QR code e código copia-e-cola enquanto aguarda', async () => {
  mockedApi.get.mockResolvedValue({ data: { paid: false } } as unknown as AxiosResponse);
  render(<PixPaymentSheet pix={pix} onPaid={() => {}} onClose={() => {}} />);

  expect(screen.getByAltText(/qr code pix/i)).toHaveAttribute('src', 'data:image/png;base64,base64img');
  expect(screen.getByText('copia-cola')).toBeInTheDocument();
  expect(screen.getByText(/aguardando pagamento/i)).toBeInTheDocument();
});

test('copiar código chama clipboard e mostra feedback', async () => {
  mockedApi.get.mockResolvedValue({ data: { paid: false } } as unknown as AxiosResponse);
  Object.assign(navigator, { clipboard: { writeText: jest.fn().mockResolvedValue(undefined) } });

  render(<PixPaymentSheet pix={pix} onPaid={() => {}} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: /copiar código/i }));

  expect(navigator.clipboard.writeText).toHaveBeenCalledWith('copia-cola');
  await waitFor(() => expect(screen.getByRole('button', { name: /copiado/i })).toBeInTheDocument());
});

test('desiste e mostra erro quando o QR nunca chega', async () => {
  jest.useFakeTimers();
  // Pedido sem QR inicial e o poll também nunca devolve QR (paid:false sempre).
  mockedApi.get.mockResolvedValue({ data: { paid: false } } as unknown as AxiosResponse);
  const onPaid = jest.fn();
  render(<PixPaymentSheet pix={{ orderId: 'o1' }} onPaid={onPaid} onClose={() => {}} />);

  // 1 check imediato + 5 intervalos de 4s cobrem as MAX_QR_ATTEMPTS tentativas.
  for (let i = 0; i < 5; i++) {
    await act(async () => { jest.advanceTimersByTime(4000); });
  }

  await waitFor(() => expect(screen.getByText(/não foi possível gerar o pix/i)).toBeInTheDocument());

  fireEvent.click(screen.getByRole('button', { name: /ver pedido e pagar/i }));
  expect(onPaid).toHaveBeenCalledWith('o1');
  jest.useRealTimers();
});

test('onClose é chamado ao fechar o sheet', async () => {
  mockedApi.get.mockResolvedValue({ data: { paid: false } } as unknown as AxiosResponse);
  const onClose = jest.fn();
  render(<PixPaymentSheet pix={pix} onPaid={() => {}} onClose={onClose} />);

  fireEvent.click(screen.getByRole('button', { name: /fechar/i }));
  expect(onClose).toHaveBeenCalled();
});
