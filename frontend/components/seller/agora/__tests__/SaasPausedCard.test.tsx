import fs from 'fs';
import path from 'path';
import { render, screen, waitFor } from '@testing-library/react';
import { SaasPausedCard } from '../SaasPausedCard';
import api from '../../../../lib/api';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn() } }));
const get = api.get as jest.Mock;
const billing = (data: any) => get.mockResolvedValue({ data: { success: true, data } });

beforeEach(() => jest.clearAllMocks());

test('pausada: diz por quê, que os pedidos pagos seguem e oferece pagar pela fatura', async () => {
  billing({ status: 'paused', nextPayment: { dueDate: '2026-10-17T12:00:00.000Z', value: 149, invoiceUrl: 'https://pay/x', status: 'OVERDUE' } });
  const onStatus = jest.fn();
  render(<SaasPausedCard storeId="s1" onStatus={onStatus} />);
  expect(await screen.findByText('Sua loja está pausada')).toBeInTheDocument();
  expect(screen.getByText(/A mensalidade de 17\/10\/2026 não foi paga/)).toBeInTheDocument();
  expect(screen.getByText(/pedidos já pagos continuam/i)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Pagar R$ 149,00 e voltar' })).toHaveAttribute('href', 'https://pay/x');
  expect(get).toHaveBeenCalledWith('/stores/s1/saas-billing');
  expect(onStatus).toHaveBeenCalledWith('paused', true);
});

test('atrasada sem pausa: âmbar com a data de bloqueio do servidor', async () => {
  billing({ status: 'past_due', blockAt: '2026-10-22T12:00:00.000Z', nextPayment: { dueDate: '2026-10-17T12:00:00.000Z', value: 149, invoiceUrl: 'https://pay/x' } });
  render(<SaasPausedCard storeId="s1" />);
  expect(await screen.findByText('Mensalidade atrasada')).toBeInTheDocument();
  expect(screen.getByText('Pague até 22/10/2026 para a loja não ser pausada.')).toBeInTheDocument();
});

test('data no fuso de São Paulo: meia-noite de SP (03:00Z) não vira o dia anterior', async () => {
  billing({ status: 'past_due', blockAt: '2026-10-16T03:00:00.000Z', nextPayment: null });
  render(<SaasPausedCard storeId="s1" />);
  expect(await screen.findByText('Pague até 16/10/2026 para a loja não ser pausada.')).toBeInTheDocument();
});

test('em dia ou erro: não mostra nada', async () => {
  billing({ status: 'active' });
  const a = render(<SaasPausedCard storeId="s1" />);
  await waitFor(() => expect(get).toHaveBeenCalled());
  expect(a.container).toBeEmptyDOMElement();
  a.unmount();
  get.mockRejectedValue(new Error('x'));
  const onStatus = jest.fn();
  const b = render(<SaasPausedCard storeId="s1" onStatus={onStatus} />);
  await waitFor(() => expect(onStatus).toHaveBeenCalledWith(null, false));
  expect(b.container).toBeEmptyDOMElement();
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'SaasPausedCard.module.css'), 'utf8'))).toEqual([]);
});
