import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../../../lib/api';
import { PersonalData } from '../PersonalData';

const push = jest.fn();
jest.mock('next/router', () => ({ useRouter: () => ({ push }) }));
jest.mock('../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), patch: jest.fn(), post: jest.fn() } }));
const get = api.get as jest.Mock; const patch = api.patch as jest.Mock;

const me = { name: 'Ana Souza', email: 'ana@email.com', telefone: '11987654321', cpf: '52998224725', createdAt: '2026-03-14T10:00:00', verification: { email: { status: 'verified' }, document: { status: 'approved' } } };
beforeEach(() => { get.mockReset(); patch.mockReset(); push.mockClear(); get.mockResolvedValue({ data: me }); patch.mockResolvedValue({ data: {} }); });

test('linhas com os dados, selos e CPF mascarado', async () => {
  render(<PersonalData />);
  expect(await screen.findByText('Ana Souza')).toBeInTheDocument();
  expect(screen.getByText('Confirmado')).toBeInTheDocument();
  expect(screen.getByText('529.***.***-25')).toBeInTheDocument();
  expect(screen.getByText('Verificado')).toBeInTheDocument();
  expect(screen.getByText(/março de 2026/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Editar CPF' })).toBeNull();
});

test('editar um campo só: abre o sheet, salva e atualiza a linha', async () => {
  render(<PersonalData />);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar nome' }));
  fireEvent.change(screen.getByLabelText('Nome'), { target: { value: 'Ana M. Souza' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/user/me', { name: 'Ana M. Souza' }));
  expect(await screen.findByText('Ana M. Souza')).toBeInTheDocument();
});

test('CPF recusado pelo servidor mostra a mensagem dele', async () => {
  get.mockResolvedValue({ data: { ...me, cpf: '', verification: { email: { status: 'verified' }, document: { status: 'pending' } } } });
  patch.mockRejectedValue({ response: { data: { error: 'CPF inválido' } } });
  render(<PersonalData />);
  fireEvent.click(await screen.findByRole('button', { name: 'Editar CPF' }));
  fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '529.982.247-25' } });
  fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
  expect(await screen.findByText('CPF inválido')).toBeInTheDocument();
});

test('"Trocar senha" leva ao fluxo de nova senha', async () => {
  render(<PersonalData />);
  fireEvent.click(await screen.findByRole('button', { name: /Trocar senha/ }));
  expect(push).toHaveBeenCalledWith('/esqueci-senha?next=%2Fconta%3Fsecao%3Ddados');
});
