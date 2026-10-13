import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import CreateStore from '../pages/seller/create-store';
import api from '../lib/api';

const mockPush = jest.fn();
const mockReplace = jest.fn();
let mockMode = 'custodia';
let mockPin = true;
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: mockReplace, query: { onboarding: '1' }, pathname: '/seller/create-store' }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: { activeRole: 'lojista', role: 'lojista' }, loading: false }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: mockMode, directCardEnabled: false, loading: false }) }));
// O mapa real é do Google; aqui o pino "cai" no endereço assim que a rua e a cidade existem.
jest.mock('../components/MapPicker', () => ({
  __esModule: true,
  default: ({ onChange, addressForm }: any) => {
    const React = require('react');
    React.useEffect(() => { if (mockPin && addressForm?.street && addressForm?.city) onChange('-23.55', '-46.66'); }, [addressForm?.street, addressForm?.city]);
    return <div data-testid="mapa" />;
  },
}));
jest.mock('next/dynamic', () => () => require('../components/MapPicker').default);
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), put: jest.fn() } }));

const notFound = () => Promise.reject(Object.assign(new Error('404'), { response: { status: 404 } }));
const viaCep = (body: any) => { (global as any).fetch = jest.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve(body) })); };

beforeEach(() => {
  jest.clearAllMocks();
  mockMode = 'custodia';
  mockPin = true;
  (api.get as jest.Mock).mockImplementation(() => notFound());
  (api.post as jest.Mock).mockResolvedValue({ data: { _id: 's1' } });
  viaCep({ logradouro: 'Rua Augusta', bairro: 'Consolação', localidade: 'São Paulo', uf: 'SP' });
});

const set = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });

test('topo com voltar para o checklist Abrir a loja', async () => {
  render(<CreateStore />);
  expect(await screen.findByLabelText('Nome da loja')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  expect(mockPush).toHaveBeenCalledWith('/seller/abrir');
});

test('CEP completa o endereço, sem latitude/longitude à mão, e cria a loja', async () => {
  render(<CreateStore />);
  await screen.findByLabelText('Nome da loja');
  set('Nome da loja', 'Eletro Center');
  set('CNPJ', '12345678000190');
  set('CEP', '01305100');
  set('Número', '1200');
  expect(await screen.findByText('Rua Augusta · Consolação · São Paulo/SP')).toBeInTheDocument();
  expect(screen.queryByLabelText('Latitude')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Longitude')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Continuar para documentos' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores', expect.objectContaining({
    name: 'Eletro Center', cnpj: '12.345.678/0001-90', street: 'Rua Augusta', number: '1200', neighborhood: 'Consolação',
    city: 'São Paulo', state: 'SP', zip: '01305-100', latitude: '-23.55', longitude: '-46.66',
  })));
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/seller/abrir'));
});

test('CEP não encontrado: avisa e mostra os campos do endereço', async () => {
  viaCep({ erro: true });
  render(<CreateStore />);
  await screen.findByLabelText('Nome da loja');
  set('CEP', '99999999');
  expect(await screen.findByText('Não achamos esse CEP. Digite o endereço.')).toBeInTheDocument();
  expect(screen.getByLabelText('Rua')).toBeInTheDocument();
  expect(screen.getByLabelText('Cidade')).toBeInTheDocument();
});

test('sem o ponto no mapa não cria a loja (fail closed)', async () => {
  mockPin = false;
  render(<CreateStore />);
  await screen.findByLabelText('Nome da loja');
  set('Nome da loja', 'Eletro Center');
  set('CNPJ', '12345678000190');
  set('CEP', '01305100');
  set('Número', '1200');
  await screen.findByText('Rua Augusta · Consolação · São Paulo/SP');
  fireEvent.click(screen.getByRole('button', { name: 'Continuar para documentos' }));
  expect(await screen.findByText('Não achamos o ponto da loja no mapa. Confira o endereço ou arraste o pino.')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test('CNPJ obrigatório na custódia e opcional no modo direto', async () => {
  render(<CreateStore />);
  await screen.findByLabelText('Nome da loja');
  set('Nome da loja', 'Eletro Center');
  set('CEP', '01305100');
  set('Número', '1200');
  await screen.findByText('Rua Augusta · Consolação · São Paulo/SP');
  fireEvent.click(screen.getByRole('button', { name: 'Continuar para documentos' }));
  expect(await screen.findByText('Preencha todos os campos obrigatórios.')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test('modo direto: cria sem CNPJ', async () => {
  mockMode = 'direto';
  render(<CreateStore />);
  expect(await screen.findByLabelText('CNPJ (opcional)')).toBeInTheDocument();
  set('Nome da loja', 'Eletro Center');
  set('CEP', '01305100');
  set('Número', '1200');
  await screen.findByText('Rua Augusta · Consolação · São Paulo/SP');
  fireEvent.click(screen.getByRole('button', { name: 'Criar a loja' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores', expect.not.objectContaining({ cnpj: expect.anything() })));
});

test('com a loja já criada, não abre o cadastro de novo: volta ao checklist na etapa da loja', async () => {
  (api.get as jest.Mock).mockResolvedValue({ data: { store: { _id: 's1', name: 'Eletro Center' } } });
  render(<CreateStore />);
  await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/seller/abrir?etapa=loja'));
  expect(screen.queryByLabelText('Nome da loja')).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});
