// Pedido do usuário (22/10): o que foi enviado e está "em análise" fica amarelo; o aprovado, verde.
// Os CSS modules viram o nome da classe no jest (next/jest), então a classe é o nome do token.
import { render, screen } from '@testing-library/react';
import api from '../lib/api';
import { STEP_ICON_CLASS } from '../components/seller/abrir/stepView';

jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/' }) }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
const get = api.get as jest.Mock;

import { DocumentosStep } from '../components/seller/abrir/DocumentosStep';
import { VerificacaoStep } from '../components/motoboy/cadastro/VerificacaoStep';

beforeEach(() => jest.clearAllMocks());

test('Abrir a loja: etapa em análise amarela, feita verde', () => {
  expect(STEP_ICON_CLASS.review).toBe('icoWarn');
  expect(STEP_ICON_CLASS.done).toBe('icoOk');
});

test('documentos da loja: ícone do item em análise amarelo, aprovado verde, nada azul', async () => {
  get.mockResolvedValue({ data: { isVerified: false, missing: [], facial: { status: 'approved' }, cnpj: { status: 'pending', razaoSocial: 'ELETRO CENTER LTDA', situacao: 'ATIVA' }, address: { status: 'pending' } } });
  const { container } = render(<DocumentosStep storeId="s1" storeCnpj="12345678000190" onChanged={jest.fn()} onEditStore={jest.fn()} />);
  expect(await screen.findByText('Aprovada')).toBeInTheDocument();
  expect(container.querySelectorAll('.icoWarn').length).toBe(1); // o comprovante (o CNPJ em análise usa o quadro .docWait)
  expect(container.querySelectorAll('.icoOk').length).toBe(1);
  expect(container.querySelector('.icoInfo')).toBeNull();
  expect(container.querySelector('.docWait')).not.toBeNull();
});

test('verificação do motoboy: selo "Em análise" amarelo e "Feito" verde', async () => {
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/verification/me'
    ? { verification: { email: { status: 'verified' }, document: { status: 'pending' } } }
    : url === '/verification/motoboy/me' ? { verified: false, facial: { status: 'approved' }, courier: { status: 'none' } } : { cpf: '' } }));
  render(<VerificacaoStep onChanged={jest.fn()} />);
  expect(await screen.findByText('Em análise')).toHaveClass('tagWarn');
  expect(screen.getAllByText('Feito')[0]).toHaveClass('tagOk');
});
// O resumo do motoboy em análise (tone warn) está em lib/__tests__/motoboyCadastro.test.ts.
