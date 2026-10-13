import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PickupPinEntry, PIN_LENGTH } from '../PickupPinEntry';
import api from '../../../../lib/api';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, post: jest.fn() } }));
const post = api.post as jest.Mock;
const type = (v: string) => fireEvent.change(screen.getByLabelText(/PIN de 5 dígitos/), { target: { value: v } });

let logs: jest.SpyInstance[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => {
  // nunca logar o PIN
  for (const s of logs) {
    for (const call of s.mock.calls) expect(JSON.stringify(call)).not.toMatch(/4821[0-9]/);
    s.mockRestore();
  }
});

test('só envia com o PIN completo, uma vez, com o payload da tela antiga', async () => {
  post.mockResolvedValue({ data: {} });
  const onValidated = jest.fn();
  render(<PickupPinEntry deliveryId="d1" onValidated={onValidated} />);
  expect(PIN_LENGTH).toBe(5);
  type('4821');
  expect(post).not.toHaveBeenCalled();
  type('48213');
  await waitFor(() => expect(post).toHaveBeenCalledWith('/deliveries/d1/validar-pin-retirada', { pinRetirada: '48213' }));
  expect(await screen.findByText('Retirada confirmada')).toBeInTheDocument();
  expect(onValidated).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledTimes(1);
});

test('PIN errado: avisa, não reenvia o mesmo PIN e envia de novo quando o PIN muda', async () => {
  post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'PIN de retirada inválido' } } });
  render(<PickupPinEntry deliveryId="d1" onValidated={jest.fn()} />);
  type('48213');
  expect(await screen.findByText('PIN não confere. Peça de novo ao motoboy.')).toBeInTheDocument();
  type('4821');
  type('48213');
  await new Promise((r) => setTimeout(r, 0));
  expect(post).toHaveBeenCalledTimes(1);
  post.mockResolvedValueOnce({ data: {} });
  type('48214');
  await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
  expect(post).toHaveBeenLastCalledWith('/deliveries/d1/validar-pin-retirada', { pinRetirada: '48214' });
});

test('bloqueio por tentativas (429) mostra a mensagem do servidor', async () => {
  post.mockRejectedValue({ response: { status: 429, data: { error: 'Muitas tentativas de PIN. Tente novamente em 9 min.', code: 'PIN_LOCKED' } } });
  render(<PickupPinEntry deliveryId="d1" onValidated={jest.fn()} />);
  type('48213');
  expect(await screen.findByText('Muitas tentativas de PIN. Tente novamente em 9 min.')).toBeInTheDocument();
});

test('aceita só dígitos', () => {
  render(<PickupPinEntry deliveryId="d1" onValidated={jest.fn()} />);
  type('4a8-2');
  expect(screen.getByLabelText(/PIN de 5 dígitos/)).toHaveValue('482');
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'PickupPinEntry.module.css'), 'utf8'))).toEqual([]);
});
