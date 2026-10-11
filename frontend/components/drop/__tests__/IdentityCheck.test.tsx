import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../../../lib/api';
import { IdentityCheck } from '../IdentityCheck';

jest.mock('../../../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
const get = api.get as jest.Mock; const post = api.post as jest.Mock; const patch = api.patch as jest.Mock;

function backend(ver: any, me: any = { cpf: '' }) {
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/verification/me' ? { verification: ver } : me }));
}
beforeEach(() => {
  get.mockReset(); post.mockReset(); patch.mockReset();
  post.mockResolvedValue({ data: {} }); patch.mockResolvedValue({ data: {} });
});

test('e-mail pendente: pede o código ali mesmo', async () => {
  backend({ email: { status: 'pending' }, document: { status: 'none' } });
  render(<IdentityCheck />);
  fireEvent.click(await screen.findByRole('button', { name: 'Enviar código' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/verification/email/resend'));
  fireEvent.change(screen.getByLabelText('Código do e-mail'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/verification/email/verify', { code: '123456' }));
});

test('e-mail feito aparece confirmado; CPF inválido trava o envio', async () => {
  backend({ email: { status: 'verified' }, document: { status: 'none' } });
  render(<IdentityCheck />);
  expect(await screen.findByText('E-mail confirmado')).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('CPF'), { target: { value: '123.456.789-00' } });
  expect(screen.getByText('CPF inválido')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Enviar para análise' })).toBeDisabled();
});

test('CPF válido + frente e verso: grava o CPF e envia o documento', async () => {
  backend({ email: { status: 'verified' }, document: { status: 'none' } });
  render(<IdentityCheck />);
  fireEvent.change(await screen.findByLabelText('CPF'), { target: { value: '529.982.247-25' } });
  expect(screen.getByText('CPF válido')).toBeInTheDocument();
  const file = new File(['x'], 'doc.jpg', { type: 'image/jpeg' });
  fireEvent.change(screen.getByLabelText('Frente'), { target: { files: [file] } });
  fireEvent.change(screen.getByLabelText('Verso'), { target: { files: [file] } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar para análise' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/user/me', { cpf: '52998224725' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/verification/document', expect.any(FormData), expect.anything()));
  expect(await screen.findByText('Documento em análise')).toBeInTheDocument();
});

test('em análise: sem formulário; recusado: motivo e "Enviar de novo"', async () => {
  backend({ email: { status: 'verified' }, document: { status: 'pending' } });
  const { unmount } = render(<IdentityCheck />);
  expect(await screen.findByText('Documento em análise')).toBeInTheDocument();
  expect(screen.queryByLabelText('CPF')).toBeNull();
  unmount();
  backend({ email: { status: 'verified' }, document: { status: 'rejected', rejectionReason: 'Foto ilegível' } });
  render(<IdentityCheck />);
  expect(await screen.findByText('Foto ilegível')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Enviar de novo' })).toBeInTheDocument();
});
