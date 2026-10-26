import { render, screen, act } from '@testing-library/react';
import api from '../../../../lib/api';
import { PixPaymentSheet, parsePixDate } from '../PixPaymentSheet';

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

// Bug de 26/10: o Asaas manda "AAAA-MM-DD HH:MM:SS" sem fuso (horário de São Paulo). Lido como
// horário do aparelho (ou NaN no Safari), a contagem saía errada. Agora vale como -03:00.
it('prazo no formato do Asaas (sem fuso) vale como horário de São Paulo', () => {
  get.mockReturnValue(new Promise(() => {}));
  jest.setSystemTime(new Date('2026-10-26T18:00:00Z')); // 15:00 em São Paulo
  render(<PixPaymentSheet pix={{ orderId: 'o1', qrCodePayload: 'abc', expiresAt: '2026-10-26 15:30:00', serverNow: '2026-10-26T18:00:00Z' }} onPaid={jest.fn()} onClose={jest.fn()} />);
  expect(screen.getByText('Expira em 30:00')).toBeInTheDocument();
});

it('parsePixDate: ISO com fuso como veio; formato do Asaas como -03:00', () => {
  expect(parsePixDate('2026-10-26T18:30:00.000Z')).toBe(Date.UTC(2026, 9, 26, 18, 30));
  expect(parsePixDate('2026-10-26 15:30:00')).toBe(Date.UTC(2026, 9, 26, 18, 30));
  expect(parsePixDate('2026-10-26 15:30')).toBe(Date.UTC(2026, 9, 26, 18, 30));
  expect(Number.isNaN(parsePixDate(undefined))).toBe(true);
});
