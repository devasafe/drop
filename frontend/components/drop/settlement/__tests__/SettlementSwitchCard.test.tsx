import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettlementSwitchCard } from '../SettlementSwitchCard';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn() },
}));

const preview = {
  from: 'direto', to: 'custodia', confirmPhrase: 'TROCAR PARA APP', blockers: [],
  risks: ['3 loja(s) sem subconta de custódia', 'Planos e comissões voltam a valer'], counts: {},
};

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: preview });
  (api.put as jest.Mock).mockResolvedValue({ data: { settlementMode: 'custodia' } });
});

test('mostra o modo atual e, ao pedir a troca, lista os riscos', async () => {
  render(<SettlementSwitchCard mode="direto" onChanged={jest.fn()} />);
  expect(screen.getByText(/SaaS/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /Trocar para o modo app/ }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/admin/switches/settlement-preview', { params: { to: 'custodia' } }));
  expect(await screen.findByText('3 loja(s) sem subconta de custódia')).toBeInTheDocument();
  expect(screen.getByText('Planos e comissões voltam a valer')).toBeInTheDocument();
});

test('o botão de confirmar só libera com a frase exata e envia a frase', async () => {
  const onChanged = jest.fn();
  render(<SettlementSwitchCard mode="direto" onChanged={onChanged} />);
  fireEvent.click(screen.getByRole('button', { name: /Trocar para o modo app/ }));
  const input = await screen.findByLabelText(/Digite TROCAR PARA APP/);
  const confirm = screen.getByRole('button', { name: 'Confirmar troca' });
  expect(confirm).toBeDisabled();
  fireEvent.change(input, { target: { value: 'trocar para app' } });
  expect(confirm).toBeDisabled();
  fireEvent.change(input, { target: { value: 'TROCAR PARA APP' } });
  expect(confirm).toBeEnabled();
  fireEvent.click(confirm);
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/admin/switches', { settlementMode: 'custodia', confirmSettlement: 'TROCAR PARA APP' }));
  await waitFor(() => expect(onChanged).toHaveBeenCalledWith('custodia'));
});

test('com bloqueio, não há campo de confirmação: mostra o motivo', async () => {
  (api.get as jest.Mock).mockResolvedValue({ data: { ...preview, blockers: ['PAYMENT_GATEWAY precisa estar em asaas'] } });
  render(<SettlementSwitchCard mode="direto" onChanged={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Trocar para o modo app/ }));
  expect(await screen.findByText('PAYMENT_GATEWAY precisa estar em asaas')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Confirmar troca' })).not.toBeInTheDocument();
});
