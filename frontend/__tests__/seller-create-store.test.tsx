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
const mockPanelRefresh = jest.fn(() => Promise.resolve());
// O painel da loja (/seller/*) é montado uma vez no _app; aqui ele está 'dentro do painel'.
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({
  ...jest.requireActual('../components/seller/panel/SellerPanelProvider'),
  useSellerPanel: () => ({ inPanel: true, refresh: mockPanelRefresh }),
}));
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

// fix/criar-loja-painel: o painel lia /stores/dashboard uma vez (sem loja) e não era relido depois de
// criar. O checklist abria o cadastro de novo e a 2ª tentativa dava "User already has a store".
async function criarLojaDireto() {
  mockMode = 'direto';
  render(<CreateStore />);
  await screen.findByLabelText('Nome da loja');
  set('Nome da loja', 'Teste');
  set('CEP', '01305100');
  set('Número', '41');
  await screen.findByText('Rua Augusta · Consolação · São Paulo/SP');
  fireEvent.click(screen.getByRole('button', { name: 'Criar a loja' }));
}

test('depois de criar, relê o painel ANTES de voltar ao checklist', async () => {
  const ordem: string[] = [];
  mockPanelRefresh.mockImplementation(() => { ordem.push('refresh'); return Promise.resolve(); });
  mockPush.mockImplementation((url: string) => { ordem.push(`push ${url}`); });
  await criarLojaDireto();
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/seller/abrir'));
  expect(ordem).toEqual(['refresh', 'push /seller/abrir']);
});

test('loja já existe (409 STORE_EXISTS): conta como etapa feita, sem erro na tela', async () => {
  (api.post as jest.Mock).mockRejectedValue({ response: { status: 409, data: { error: 'Você já tem uma loja.', code: 'STORE_EXISTS' } } });
  await criarLojaDireto();
  await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/seller/abrir'));
  expect(mockPanelRefresh).toHaveBeenCalled();
  expect(screen.queryByText('Você já tem uma loja.')).toBeNull();
});
