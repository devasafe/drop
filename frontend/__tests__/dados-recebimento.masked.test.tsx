import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import DadosRecebimento from '../pages/dados-recebimento';
import api from '../lib/api';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/dados-recebimento' }) }));
// user estável: o efeito de carga depende de `user`, e um objeto novo a cada render o refaria em loop.
const mockAuth = { user: { activeRole: 'lojista', role: 'lojista' }, loading: false };
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia', directCardEnabled: false, loading: false }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

const status = { target: 'store', accountStatus: 'active', hasPixKey: true, hasAddress: true, pixKey: '***.456.789-**' };

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockResolvedValue({ data: status });
  (api.post as jest.Mock).mockResolvedValue({ data: { ok: true, target: 'store', asaas: { status: 'active', hasPix: true } } });
});

test('mostra a chave mascarada e "Alterar" abre o campo vazio; salva só a chave digitada', async () => {
  render(<DadosRecebimento />);
  expect(((await screen.findByLabelText('Chave PIX cadastrada')) as HTMLInputElement).value).toBe('***.456.789-**');
  fireEvent.click(screen.getByText('Alterar chave PIX'));
  const field = screen.getByPlaceholderText('CPF, e-mail, telefone ou chave aleatória') as HTMLInputElement;
  expect(field.value).toBe('');
  fireEvent.change(field, { target: { value: 'ana@loja.com' } });
  fireEvent.click(screen.getByText('Atualizar dados'));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/onboarding/receiver', expect.objectContaining({ pixKey: 'ana@loja.com' })));
  expect(JSON.stringify((api.post as jest.Mock).mock.calls)).not.toContain('*');
  await waitFor(() => expect((api.get as jest.Mock).mock.calls.filter((c) => c[0] === '/onboarding/status').length).toBe(2));
});

test('chave com * (a máscara) é recusada na tela', async () => {
  render(<DadosRecebimento />);
  fireEvent.click(await screen.findByText('Alterar chave PIX'));
  fireEvent.change(screen.getByPlaceholderText('CPF, e-mail, telefone ou chave aleatória'), { target: { value: '***.456.789-**' } });
  fireEvent.click(screen.getByText('Atualizar dados'));
  expect(await screen.findByText('Digite a chave inteira. A chave mascarada não serve para salvar.')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});
