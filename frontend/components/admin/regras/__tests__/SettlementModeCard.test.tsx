import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { SettlementModeCard } from '../SettlementModeCard';
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

test('mostra o modo atual e, ao pedir a troca, lista os riscos calculados no servidor', async () => {
  render(<SettlementModeCard mode="direto" onChanged={jest.fn()} />);
  expect(screen.getByText(/Atual:/)).toHaveTextContent('SaaS');
  fireEvent.click(screen.getByRole('button', { name: /Trocar para o modo app/ }));
  await waitFor(() => expect(api.get).toHaveBeenCalledWith('/admin/switches/settlement-preview', { params: { to: 'custodia' } }));
  expect(await screen.findByText('3 loja(s) sem subconta de custódia')).toBeInTheDocument();
  expect(screen.getByText('Planos e comissões voltam a valer')).toBeInTheDocument();
  expect(screen.getByRole('dialog', { name: 'Trocar para o modo app?' })).toBeInTheDocument();
});

test('o botão de confirmar só libera com a frase exata e envia a frase', async () => {
  const onChanged = jest.fn();
  render(<SettlementModeCard mode="direto" onChanged={onChanged} />);
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
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
});

test('com bloqueio, não há campo nem botão de confirmação: mostra o motivo', async () => {
  (api.get as jest.Mock).mockResolvedValue({ data: { ...preview, blockers: ['PAYMENT_GATEWAY precisa estar em asaas'] } });
  render(<SettlementModeCard mode="direto" onChanged={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Trocar para o modo app/ }));
  expect(await screen.findByText('PAYMENT_GATEWAY precisa estar em asaas')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Confirmar troca' })).not.toBeInTheDocument();
  expect(screen.queryByLabelText(/Digite/)).not.toBeInTheDocument();
});

test('erro do servidor na troca aparece dentro da sheet e o modo não muda', async () => {
  const onChanged = jest.fn();
  (api.put as jest.Mock).mockRejectedValue({ response: { status: 409, data: { error: 'Troca de modo bloqueada', code: 'SETTLEMENT_BLOCKED' } } });
  render(<SettlementModeCard mode="direto" onChanged={onChanged} />);
  fireEvent.click(screen.getByRole('button', { name: /Trocar para o modo app/ }));
  fireEvent.change(await screen.findByLabelText(/Digite TROCAR PARA APP/), { target: { value: 'TROCAR PARA APP' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar troca' }));
  const dialog = screen.getByRole('dialog');
  expect(await within(dialog).findByRole('alert')).toHaveTextContent('Troca de modo bloqueada');
  expect(onChanged).not.toHaveBeenCalled();
});

test('falha ao calcular os riscos: mensagem na sheet, sem confirmar', async () => {
  (api.get as jest.Mock).mockRejectedValue({ response: { status: 500, data: { error: 'Erro ao calcular os riscos da troca' } } });
  render(<SettlementModeCard mode="custodia" onChanged={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Trocar para o modo SaaS/ }));
  expect(await screen.findByText('Erro ao calcular os riscos da troca')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Confirmar troca' })).not.toBeInTheDocument();
});

test('assinaturas não canceladas no Asaas viram aviso depois da troca', async () => {
  (api.put as jest.Mock).mockResolvedValue({ data: { settlementMode: 'custodia', saasBillingWarnings: [{ storeId: 's1', error: 'x' }, { storeId: 's2', error: 'y' }] } });
  render(<SettlementModeCard mode="direto" onChanged={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /Trocar para o modo app/ }));
  fireEvent.change(await screen.findByLabelText(/Digite TROCAR PARA APP/), { target: { value: 'TROCAR PARA APP' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar troca' }));
  expect(await screen.findByText('2 assinatura(s) não cancelada(s) no Asaas')).toBeInTheDocument();
});
