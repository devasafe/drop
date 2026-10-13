import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { RecebimentoForm } from '../RecebimentoForm';
import api from '../../../lib/api';

jest.mock('../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const noKey = { target: 'store', accountStatus: 'none', hasPixKey: false, hasAddress: true };

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: noKey });
  (api.post as jest.Mock).mockResolvedValue({ data: { asaas: { status: 'active', hasPix: true } } });
});

test('loja na custódia: salva a chave, relê o status e avisa o checklist', async () => {
  const onSaved = jest.fn();
  render(<RecebimentoForm direct={false} store onSaved={onSaved} />);
  const field = await screen.findByPlaceholderText('CPF, e-mail, telefone ou chave aleatória');
  expect(screen.getByText('Quanto e quando')).toBeInTheDocument();
  fireEvent.change(field, { target: { value: 'ana@loja.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ativar recebimento' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/onboarding/receiver', { pixKey: 'ana@loja.com' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
  expect((api.get as jest.Mock).mock.calls.filter((c) => c[0] === '/onboarding/status').length).toBe(2);
});

test('erro ao ativar não avisa o checklist', async () => {
  (api.post as jest.Mock).mockResolvedValue({ data: { asaas: { status: 'error', hasPix: false, lastError: 'Chave inválida' } } });
  const onSaved = jest.fn();
  render(<RecebimentoForm direct={false} store onSaved={onSaved} />);
  fireEvent.change(await screen.findByPlaceholderText('CPF, e-mail, telefone ou chave aleatória'), { target: { value: 'x@y.com' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ativar recebimento' }));
  expect(await screen.findByText('Não foi possível ativar: Chave inválida')).toBeInTheDocument();
  expect(onSaved).not.toHaveBeenCalled();
});

test('chave com * nunca vai ao servidor', async () => {
  render(<RecebimentoForm direct={false} store />);
  fireEvent.change(await screen.findByPlaceholderText('CPF, e-mail, telefone ou chave aleatória'), { target: { value: '***.456.789-**' } });
  fireEvent.click(screen.getByRole('button', { name: 'Ativar recebimento' }));
  expect(await screen.findByText('Digite a chave inteira. A chave mascarada não serve para salvar.')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test('motoboy: sem o bloco da loja', async () => {
  render(<RecebimentoForm direct={false} store={false} />);
  await screen.findByPlaceholderText('CPF, e-mail, telefone ou chave aleatória');
  expect(screen.queryByText('Quanto e quando')).not.toBeInTheDocument();
});
