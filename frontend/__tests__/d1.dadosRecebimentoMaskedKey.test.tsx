import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';

jest.mock('next/router', () => ({
  useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/dados-recebimento' }),
}));
jest.mock('../contexts/AuthContext', () => ({
  useAuth: () => ({ user: { _id: 'u1', activeRole: 'lojista', role: 'lojista' }, loading: false }),
}));
jest.mock('../hooks/useSaasConfig', () => ({ useSaasConfig: () => ({ settlementMode: 'custodia' }) }));
jest.mock('../components/OnboardingProgress', () => ({ __esModule: true, default: () => null }));
jest.mock('../components/OnboardingFooter', () => ({ __esModule: true, default: () => null }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn() } }));

import api from '../lib/api';
import DadosRecebimento from '../pages/dados-recebimento';

const MASKED = '***.456.789-**';

beforeEach(() => {
  jest.clearAllMocks();
  (api.get as jest.Mock).mockImplementation((url: string) =>
    url === '/onboarding/status'
      ? Promise.resolve({ data: { target: 'store', accountStatus: 'error', hasPixKey: true, hasAddress: true, pixKey: MASKED, lastError: 'Chave não encontrada' } })
      : Promise.resolve({ data: {} }),
  );
  (api.post as jest.Mock).mockResolvedValue({ data: { asaas: { status: 'pending', hasPix: true } } });
});

test('mostra a chave cadastrada do jeito que o servidor mandou (mascarada)', async () => {
  render(<DadosRecebimento />);
  const shown = (await screen.findByLabelText('Chave PIX cadastrada')) as HTMLInputElement;
  expect(shown.value).toBe(MASKED);
});

test('ao alterar, o campo da chave começa vazio', async () => {
  render(<DadosRecebimento />);
  fireEvent.click(await screen.findByRole('button', { name: 'Alterar chave PIX' }));
  const input = screen.getByPlaceholderText('CPF, e-mail, telefone ou chave aleatória') as HTMLInputElement;
  expect(input.value).toBe('');
});

test('enviar sem digitar não manda a chave mascarada ao servidor', async () => {
  render(<DadosRecebimento />);
  fireEvent.click(await screen.findByRole('button', { name: 'Alterar chave PIX' }));
  fireEvent.click(screen.getByRole('button', { name: 'Ativar recebimento' }));
  expect(await screen.findByText('Informe sua chave PIX.')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});
