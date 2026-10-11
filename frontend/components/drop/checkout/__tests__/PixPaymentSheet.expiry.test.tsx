import { render, screen, act } from '@testing-library/react';
import api from '../../../../lib/api';
import { PixPaymentSheet } from '../PixPaymentSheet';

// Minor M2: a contagem do Pix usa o relógio do servidor e o fim do prazo não para a consulta.
jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn() } }));
const get = api.get as jest.Mock;

beforeEach(() => { jest.useFakeTimers(); get.mockReset(); });
afterEach(() => jest.useRealTimers());

it('aparelho 3 min adiantado: a contagem segue o horário do servidor (serverNow)', () => {
  get.mockReturnValue(new Promise(() => {}));
  jest.setSystemTime(new Date('2026-10-10T14:03:00Z'));
  render(<PixPaymentSheet pix={{ orderId: 'o1', qrCodePayload: 'abc', expiresAt: '2026-10-10T14:30:00Z', serverNow: '2026-10-10T14:00:00Z' }} onPaid={jest.fn()} onClose={jest.fn()} />);
  expect(screen.getByText('Expira em 30:00')).toBeInTheDocument();
});

it('no fim do prazo consulta o status na hora e continua consultando: pagamento tardio é confirmado', async () => {
  jest.setSystemTime(new Date('2026-10-10T14:00:00Z'));
  get.mockResolvedValue({ data: { paid: false, qrCodePayload: 'abc' } });
  const onPaid = jest.fn();
  render(<PixPaymentSheet pix={{ orderId: 'o1', qrCodePayload: 'abc', expiresAt: '2026-10-10T14:00:10Z' }} onPaid={onPaid} onClose={jest.fn()} />);
  await act(async () => { jest.advanceTimersByTime(8000); });
  const before = get.mock.calls.length;
  await act(async () => { jest.advanceTimersByTime(2500); }); // passa do prazo, antes do próximo ciclo de 4 s
  expect(screen.getByText('O Pix expirou, nada foi cobrado.')).toBeInTheDocument();
  expect(get.mock.calls.length).toBe(before + 1);
  get.mockResolvedValue({ data: { paid: true } });
  await act(async () => { jest.advanceTimersByTime(4000); });
  expect(screen.getByText('Pagamento confirmado')).toBeInTheDocument();
});
