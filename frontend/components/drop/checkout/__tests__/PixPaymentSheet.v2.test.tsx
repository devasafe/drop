import fs from 'fs';
import path from 'path';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { PixPaymentSheet } from '../PixPaymentSheet';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn(() => new Promise(() => {})) } }));

beforeEach(() => { jest.useFakeTimers(); jest.setSystemTime(new Date('2026-10-10T14:00:00Z')); });
afterEach(() => jest.useRealTimers());

it('valor, contagem regressiva e passos', () => {
  render(<PixPaymentSheet pix={{ orderId: 'o1', qrCodePayload: 'abc', expiresAt: '2026-10-10T14:28:41Z' }} amount={244} storeName="Eletro Center" onPaid={jest.fn()} onClose={jest.fn()} />);
  expect(screen.getByText('R$ 244,00')).toBeInTheDocument();
  expect(screen.getByText('Expira em 28:41')).toBeInTheDocument();
  expect(screen.getByText('Abra o app do seu banco e escolha Pix')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /Copiar código Pix/ })).toBeInTheDocument();
});

it('faltando menos de 5 min fica em destaque; expirado diz que nada foi cobrado', () => {
  const onClose = jest.fn();
  render(<PixPaymentSheet pix={{ orderId: 'o1', qrCodePayload: 'abc', expiresAt: '2026-10-10T14:04:00Z' }} onPaid={jest.fn()} onClose={onClose} />);
  expect(screen.getByText('Expira em 04:00').className).toMatch(/urgent/);
  act(() => { jest.advanceTimersByTime(4 * 60 * 1000 + 1000); });
  expect(screen.getByText('O Pix expirou, nada foi cobrado.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver pedido' }));
  expect(onClose).toHaveBeenCalled();
});

it('CSS em tokens; o QR usa --color-qr-bg', () => {
  const css = fs.readFileSync(path.join(__dirname, '..', 'PixPaymentSheet.module.css'), 'utf8');
  expect(cssViolations(css)).toEqual([]);
  expect(css).toMatch(/background:\s*var\(--color-qr-bg\)/);
});
