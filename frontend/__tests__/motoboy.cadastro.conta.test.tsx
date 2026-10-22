// frontend/__tests__/motoboy.cadastro.conta.test.tsx
import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import api from '../lib/api';
import { cssViolations } from './helpers/dsTokens';

const mockPush = jest.fn();
const login = jest.fn(async () => ({}));
let mockSaas: any = { settlementMode: 'custodia', loading: false, error: false };
jest.mock('next/router', () => ({ useRouter: () => ({ push: mockPush, replace: jest.fn(), query: {}, pathname: '/motoboy/cadastro' }) }));
jest.mock('../contexts/AuthContext', () => ({ useAuth: () => ({ user: null, loading: false, login }) }));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => mockSaas }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock; const post = api.post as jest.Mock;
import { ContaStep } from '../components/motoboy/cadastro/ContaStep';

const CFG = {
  motoboyCutPerDelivery: 5, motoboyCutPerKm: 1, motoboyCommissionPercent: 20, motoboyShareDirect: 100,
  motoboyMinimumWithdraw: 20, customerAbsentWaitMin: 10, lateCancellationMotoboyShare: 50, transferBlockHours: 24,
};
beforeEach(() => {
  jest.clearAllMocks();
  mockSaas = { settlementMode: 'custodia', loading: false, error: false };
  get.mockResolvedValue({ data: CFG });
});

/** Deixa a leitura da config assentar (evita atualização fora do act). */
const settle = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

function preencher() {
  fireEvent.change(screen.getByLabelText('Nome completo'), { target: { value: 'Carlos Lima' } });
  fireEvent.change(screen.getByLabelText('E-mail'), { target: { value: 'carlos@x.com' } });
  fireEvent.change(screen.getByLabelText('Celular (WhatsApp)'), { target: { value: '11987342210' } });
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'abcdefgh12' } });
}

// Ajuste (fix/motoboy-sem-ganhos): os 5 testes de "Quanto você ganha" saíram. O bloco foi tirado da
// etapa 1 a pedido do usuário (os valores vão mudar quando o motoboy passar a pagar porcentagem).
test('etapa 1 sem "Quanto você ganha": nenhum valor nem percentual, e não lê a config', async () => {
  render(<ContaStep />);
  await settle();
  expect(screen.queryByText('Quanto você ganha')).toBeNull();
  expect(screen.queryByLabelText('Quanto você ganha')).toBeNull();
  expect(screen.queryByText(/R\$/)).toBeNull();
  expect(screen.queryByText(/%/)).toBeNull();
  expect(get).not.toHaveBeenCalledWith('/settings/platform-config');
});

test('cria a conta com o papel fixo e entra (a página abre a Verificação)', async () => {
  post.mockResolvedValue({ data: { id: 'u9' } });
  render(<ContaStep />);
  await settle();
  preencher();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta e continuar' }));
  await waitFor(() => expect(login).toHaveBeenCalledWith('carlos@x.com', 'abcdefgh12'));
  expect(post.mock.calls[0][0]).toBe('/auth/register');
  expect(post.mock.calls[0][1]).toMatchObject({ name: 'Carlos Lima', email: 'carlos@x.com', telefone: '11987342210', role: 'motoboy' });
  expect(mockPush).not.toHaveBeenCalled();
});

test('sem aceite ou senha curta: diz o que falta e não chama a API', async () => {
  render(<ContaStep />);
  await settle();
  preencher();
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta e continuar' }));
  expect(screen.getByText('Aceite os Termos de Uso e a Política de Privacidade para continuar.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.change(screen.getByLabelText('Senha'), { target: { value: 'curta' } });
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta e continuar' }));
  expect(screen.getByText('A senha precisa de 8 caracteres ou mais.')).toBeInTheDocument();
  expect(post).not.toHaveBeenCalled();
});

test('e-mail já usado: oferece entrar voltando ao cadastro', async () => {
  post.mockRejectedValue({ response: { status: 409, data: { error: 'User already exists' } } });
  render(<ContaStep />);
  await settle();
  preencher();
  fireEvent.click(screen.getByRole('checkbox'));
  fireEvent.click(screen.getByRole('button', { name: 'Criar conta e continuar' }));
  expect(await screen.findByText('Esse e-mail já tem conta.')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Entrar' }));
  expect(mockPush).toHaveBeenCalledWith('/login?next=%2Fmotoboy%2Fcadastro');
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'components/motoboy/cadastro/Cadastro.module.css'), 'utf8'))).toEqual([]);
});