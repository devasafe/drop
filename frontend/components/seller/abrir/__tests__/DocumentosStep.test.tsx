import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DocumentosStep } from '../DocumentosStep';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const ver = (over: any = {}) => ({
  isVerified: false, missing: [],
  facial: { status: 'none' }, cnpj: { status: 'none', razaoSocial: 'ELETRO CENTER LTDA', situacao: 'ATIVA' }, address: { status: 'none' },
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: ver() });
  (api.post as jest.Mock).mockResolvedValue({ data: { status: 'pending' } });
});

test('mostra o CNPJ da loja com a razão social e envia para análise', async () => {
  const onChanged = jest.fn();
  render(<DocumentosStep storeId="s1" storeCnpj="12345678000190" onChanged={onChanged} onEditStore={jest.fn()} />);
  expect(await screen.findByText('Encontrado: ELETRO CENTER LTDA')).toBeInTheDocument();
  expect((screen.getByLabelText('CNPJ da loja') as HTMLInputElement).value).toBe('12.345.678/0001-90');
  fireEvent.click(screen.getByRole('button', { name: 'Enviar CNPJ para análise' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/verification/store/s1/cnpj', {}));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(api.get).toHaveBeenCalledWith('/verification/store/s1');
});

test('sem CNPJ cadastrado: leva para Dados da loja em vez de pedir o CNPJ aqui', async () => {
  const onEditStore = jest.fn();
  render(<DocumentosStep storeId="s1" storeCnpj="" onChanged={jest.fn()} onEditStore={onEditStore} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Pôr o CNPJ em Dados da loja' }));
  expect(onEditStore).toHaveBeenCalled();
  expect(screen.queryByRole('button', { name: 'Enviar CNPJ para análise' })).not.toBeInTheDocument();
});

test('comprovante: escolher o arquivo e enviar com o campo comprovante', async () => {
  render(<DocumentosStep storeId="s1" storeCnpj="12345678000190" onChanged={jest.fn()} onEditStore={jest.fn()} />);
  const input = await screen.findByLabelText('Escolher o comprovante de endereço');
  const file = new File(['x'], 'luz.jpg', { type: 'image/jpeg' });
  fireEvent.change(input, { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar comprovante' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/verification/store/s1/address', expect.any(FormData), expect.anything()));
  const fd = (api.post as jest.Mock).mock.calls[0][1] as FormData;
  expect(fd.get('comprovante')).toBe(file);
});

test('itens em análise e aprovados não pedem envio de novo', async () => {
  (api.get as jest.Mock).mockResolvedValue({ data: ver({ facial: { status: 'approved' }, cnpj: { status: 'pending' }, address: { status: 'pending' } }) });
  render(<DocumentosStep storeId="s1" storeCnpj="12345678000190" onChanged={jest.fn()} onEditStore={jest.fn()} />);
  expect(await screen.findByText('Foto do seu rosto')).toBeInTheDocument();
  expect(screen.getByText('Aprovada')).toBeInTheDocument();
  expect(screen.getAllByText('Em análise').length).toBe(2);
  expect(screen.queryByRole('button', { name: /Enviar/ })).not.toBeInTheDocument();
});

test('falha ao carregar: "Tentar de novo"', async () => {
  (api.get as jest.Mock).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce({ data: ver() });
  render(<DocumentosStep storeId="s1" storeCnpj="12345678000190" onChanged={jest.fn()} onEditStore={jest.fn()} />);
  fireEvent.click(await screen.findByText('Tentar de novo'));
  expect(await screen.findByText('Encontrado: ELETRO CENTER LTDA')).toBeInTheDocument();
});
