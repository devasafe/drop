import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DadosLojaStep } from '../DadosLojaStep';
import api from '../../../../lib/api';

jest.mock('next/dynamic', () => () => () => <div data-testid="mapa" />);
jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { post: jest.fn(), put: jest.fn() } }));

const store = {
  _id: 's1', name: 'Eletro Center', cnpj: '12345678000190', street: 'Rua Augusta', number: '1200',
  neighborhood: 'Consolação', city: 'São Paulo', state: 'SP', zip: '01305100', latitude: '-23.55', longitude: '-46.66',
};

beforeEach(() => { jest.clearAllMocks(); (api.put as jest.Mock).mockResolvedValue({ data: {} }); });

test('loja já criada: abre em modo edição, preenchido, e salva com PUT (nunca cria de novo)', async () => {
  const onDone = jest.fn();
  render(<DadosLojaStep store={store} cnpjRequired onDone={onDone} />);
  expect((screen.getByLabelText('Nome da loja') as HTMLInputElement).value).toBe('Eletro Center');
  expect(screen.getByText('Rua Augusta · Consolação · São Paulo/SP')).toBeInTheDocument();
  expect(screen.getByText('Mudar o endereço ou o CNPJ pede nova verificação da loja.')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Nome da loja'), { target: { value: 'Eletro Center 2' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar dados da loja' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/s1', expect.objectContaining({
    name: 'Eletro Center 2', cnpj: '12345678000190', street: 'Rua Augusta', latitude: '-23.55', longitude: '-46.66',
  })));
  expect(api.post).not.toHaveBeenCalled();
  await waitFor(() => expect(onDone).toHaveBeenCalled());
});

test('editar só o nome não muda o endereço salvo: zip em dígitos e demais campos iguais aos da loja', async () => {
  render(<DadosLojaStep store={store} cnpjRequired onDone={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('Nome da loja'), { target: { value: 'Outro nome' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar dados da loja' }));
  await waitFor(() => expect(api.put).toHaveBeenCalled());
  const body = (api.put as jest.Mock).mock.calls[0][1];
  expect(body.zip).toBe('01305100');
  for (const k of ['street', 'number', 'neighborhood', 'city', 'state'] as const) expect(body[k]).toBe((store as any)[k]);
  expect(body.cnpj).toBe('12345678000190');
});

test('erro do servidor na edição aparece e não avança', async () => {
  (api.put as jest.Mock).mockRejectedValue({ response: { status: 409, data: { error: 'O CNPJ não pode ser alterado após ser aprovado. Entre em contato com o suporte.' } } });
  const onDone = jest.fn();
  render(<DadosLojaStep store={store} cnpjRequired onDone={onDone} />);
  fireEvent.click(screen.getByRole('button', { name: 'Salvar dados da loja' }));
  expect(await screen.findByText('O CNPJ não pode ser alterado após ser aprovado. Entre em contato com o suporte.')).toBeInTheDocument();
  expect(onDone).not.toHaveBeenCalled();
});
