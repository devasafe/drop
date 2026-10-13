import { render, screen, fireEvent } from '@testing-library/react';
import MotoboyTransfersCard from '../MotoboyTransfersCard';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn() } }));
const get = api.get as jest.Mock;
const row = (id: string, status: string, lastError: string | null) => ({ id, orderId: 'ordXXX' + id, motoboyName: 'Carlos', status, amount: 12, lastError, pixKeyMasked: '***.412.***-07', attempts: 2, nextAttemptAt: null, firstFailedAt: '2026-10-12T14:32:00Z' });

beforeEach(() => {
  jest.clearAllMocks();
  get.mockResolvedValue({ data: { success: true, data: [row('a1', 'failed', 'saldo insuficiente'), row('a2', 'done', null), row('a3', 'uncertain', 'UNCERTAIN')], nextCursor: null } });
});

test('com onOpen, só os Pix parados ganham "Ver o que fazer" e o clique entrega a linha', async () => {
  const onOpen = jest.fn();
  render(<MotoboyTransfersCard storeId="s1" onOpen={onOpen} />);
  await screen.findAllByText(/Carlos/);
  const buttons = screen.getAllByRole('button', { name: 'Ver o que fazer' });
  expect(buttons).toHaveLength(2);
  fireEvent.click(buttons[0]);
  expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: 'a1', status: 'failed' }));
});

test('sem onOpen, o card fica como era (sem botão novo)', async () => {
  render(<MotoboyTransfersCard storeId="s1" />);
  await screen.findAllByText(/Carlos/);
  expect(screen.queryByRole('button', { name: 'Ver o que fazer' })).not.toBeInTheDocument();
  expect(screen.getByText('A loja não tem saldo no Asaas para esta transferência')).toBeInTheDocument();
});

test('sem style inline no componente', () => {
  const src = require('fs').readFileSync(require('path').join(__dirname, '..', 'MotoboyTransfersCard.tsx'), 'utf8');
  expect(src).not.toMatch(/style=\{\{/);
});
