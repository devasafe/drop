// frontend/__tests__/motoboy.cadastro.verificacao.test.tsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../lib/api';

jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), post: jest.fn(), patch: jest.fn() } }));
const get = api.get as jest.Mock; const post = api.post as jest.Mock; const patch = api.patch as jest.Mock;
import { VerificacaoStep } from '../components/motoboy/cadastro/VerificacaoStep';

let ver: any; let mb: any; let me: any;
beforeEach(() => {
  jest.clearAllMocks();
  ver = { verification: { email: { status: 'verified' }, document: { status: 'pending' } } };
  mb = { verified: false, facial: { status: 'rejected', rejectionReason: 'rosto com sombra' }, courier: { status: 'none' } };
  me = { email: 'carlos@x.com', cpf: '38741255607', rg: '' };
  get.mockImplementation((url: string) => Promise.resolve({ data: url === '/verification/me' ? ver : url === '/verification/motoboy/me' ? mb : me }));
  post.mockResolvedValue({ data: {} });
  patch.mockResolvedValue({ data: {} });
});
const img = (name: string, size = 1000) => { const f = new File(['x'], name, { type: 'image/jpeg' }); Object.defineProperty(f, 'size', { value: size }); return f; };

test('lista com os selos e a recusada aberta primeiro, com o motivo', async () => {
  render(<VerificacaoStep onChanged={jest.fn()} />);
  expect(await screen.findByText('Recusada: rosto com sombra')).toBeInTheDocument();
  expect(screen.getByText('Feito')).toBeInTheDocument();
  expect(screen.getByText('Em análise')).toBeInTheDocument();
  expect(screen.getByText('Refazer')).toBeInTheDocument();
  expect(screen.getByText('Falta enviar')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Enviar selfie' })).toBeInTheDocument();
});

test('selfie: envia a foto e avisa a página', async () => {
  const onChanged = jest.fn();
  render(<VerificacaoStep onChanged={onChanged} />);
  await screen.findByRole('button', { name: 'Enviar selfie' });
  fireEvent.change(screen.getByLabelText('Selfie'), { target: { files: [img('eu.jpg')] } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar selfie' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/verification/facial', expect.any(FormData), expect.anything()));
  await waitFor(() => expect(onChanged).toHaveBeenCalled());
  expect(await screen.findByText('Selfie enviada para análise.')).toBeInTheDocument();
});

test('foto acima de 5 MB é recusada antes do envio', async () => {
  render(<VerificacaoStep onChanged={jest.fn()} />);
  await screen.findByRole('button', { name: 'Enviar selfie' });
  fireEvent.change(screen.getByLabelText('Selfie'), { target: { files: [img('grande.jpg', 6 * 1024 * 1024)] } });
  expect(screen.getByText('Foto muito grande. Tire de novo com menos de 5 MB.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Enviar selfie' })).toBeDisabled();
});

test('CNH e placa: 1º envio exige as duas fotos e diz o que falta', async () => {
  mb = { verified: false, facial: { status: 'approved' }, courier: { status: 'none' } };
  render(<VerificacaoStep onChanged={jest.fn()} />);
  const send = await screen.findByRole('button', { name: 'Enviar CNH e placa' });
  fireEvent.change(screen.getByLabelText('Número de registro da CNH'), { target: { value: '04738821905' } });
  fireEvent.change(screen.getByLabelText('Placa da moto'), { target: { value: 'FKR2D19' } });
  fireEvent.change(screen.getByLabelText('Foto da CNH'), { target: { files: [img('cnh.jpg')] } });
  expect(screen.getByText('Falta a foto da placa')).toBeInTheDocument();
  expect(send).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Foto da placa'), { target: { files: [img('placa.jpg')] } });
  expect(send).toBeEnabled();
  fireEvent.click(send);
  await waitFor(() => expect(post).toHaveBeenCalledWith('/verification/motoboy', expect.any(FormData), expect.anything()));
  const fd: FormData = post.mock.calls[0][1];
  expect(fd.get('plate')).toBe('FKR2D19');
  expect(fd.get('cnhPhoto')).toBeTruthy();
  expect(fd.get('platePhoto')).toBeTruthy();
});

test('erro do servidor no envio aparece e não avisa a página', async () => {
  post.mockRejectedValue({ response: { data: { error: 'Esta placa já está cadastrada em outro motoboy' } } });
  mb = { verified: false, facial: { status: 'approved' }, courier: { status: 'none' } };
  const onChanged = jest.fn();
  render(<VerificacaoStep onChanged={onChanged} />);
  await screen.findByRole('button', { name: 'Enviar CNH e placa' });
  fireEvent.change(screen.getByLabelText('Número de registro da CNH'), { target: { value: '04738821905' } });
  fireEvent.change(screen.getByLabelText('Placa da moto'), { target: { value: 'FKR2D19' } });
  fireEvent.change(screen.getByLabelText('Foto da CNH'), { target: { files: [img('cnh.jpg')] } });
  fireEvent.change(screen.getByLabelText('Foto da placa'), { target: { files: [img('placa.jpg')] } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar CNH e placa' }));
  expect(await screen.findByText('Esta placa já está cadastrada em outro motoboy')).toBeInTheDocument();
  expect(onChanged).not.toHaveBeenCalled();
});

test('e-mail: manda o código e confirma com 6 dígitos', async () => {
  ver = { verification: { email: { status: 'pending' }, document: { status: 'approved' } } };
  mb = { verified: false, facial: { status: 'approved' }, courier: { status: 'approved' } };
  render(<VerificacaoStep onChanged={jest.fn()} />);
  fireEvent.click(await screen.findByRole('button', { name: 'Enviar código' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/verification/email/resend'));
  const confirm = await screen.findByRole('button', { name: 'Confirmar e-mail' });
  expect(confirm).toBeDisabled();
  fireEvent.change(screen.getByLabelText('Código'), { target: { value: '123456' } });
  fireEvent.click(confirm);
  await waitFor(() => expect(post).toHaveBeenCalledWith('/verification/email/verify', { code: '123456' }));
});

test('documento sem número no cadastro: grava o CPF antes de enviar', async () => {
  ver = { verification: { email: { status: 'verified' }, document: { status: 'none' } } };
  mb = { verified: false, facial: { status: 'approved' }, courier: { status: 'approved' } };
  me = { email: 'carlos@x.com', cpf: '', rg: '' };
  render(<VerificacaoStep onChanged={jest.fn()} />);
  await screen.findByRole('button', { name: 'Enviar documento' });
  fireEvent.change(screen.getByLabelText('Número do CPF'), { target: { value: '38741255607' } });
  fireEvent.change(screen.getByLabelText('Frente do documento'), { target: { files: [img('f.jpg')] } });
  fireEvent.change(screen.getByLabelText('Verso do documento'), { target: { files: [img('v.jpg')] } });
  fireEvent.click(screen.getByRole('button', { name: 'Enviar documento' }));
  await waitFor(() => expect(patch).toHaveBeenCalledWith('/user/me', { cpf: '38741255607' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/verification/document', expect.any(FormData), expect.anything()));
});

test('leitura falhou: erro com "Tentar de novo" e nenhum formulário', async () => {
  get.mockRejectedValue(new Error('rede'));
  render(<VerificacaoStep onChanged={jest.fn()} />);
  expect(await screen.findByText('Não carregamos sua verificação')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Enviar/ })).toBeNull();
});
