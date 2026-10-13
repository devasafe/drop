import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ReturnConfirm } from '../ReturnConfirm';
import api from '../../../../lib/api';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, post: jest.fn() } }));
const post = api.post as jest.Mock;
beforeEach(() => jest.clearAllMocks());

test('botão só liga com 6 dígitos e envia pinDevolucao', async () => {
  post.mockResolvedValue({ data: { success: true } });
  const onDone = jest.fn();
  render(<ReturnConfirm deliveryId="d9" onDone={onDone} />);
  const btn = screen.getByRole('button', { name: 'Confirmar devolução' });
  fireEvent.change(screen.getByLabelText('PIN de devolução (6 dígitos)'), { target: { value: '12345' } });
  expect(btn).toBeDisabled();
  fireEvent.change(screen.getByLabelText('PIN de devolução (6 dígitos)'), { target: { value: '123456' } });
  fireEvent.click(btn);
  await waitFor(() => expect(post).toHaveBeenCalledWith('/deliveries/d9/confirm-return', { pinDevolucao: '123456' }));
  await waitFor(() => expect(onDone).toHaveBeenCalled());
});

test('PIN inválido mostra aviso legível', async () => {
  post.mockRejectedValue({ response: { status: 400, data: { error: 'PIN de devolução inválido' } } });
  render(<ReturnConfirm deliveryId="d9" onDone={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('PIN de devolução (6 dígitos)'), { target: { value: '000000' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
  expect(await screen.findByText('PIN de devolução não confere. Confira com o motoboy.')).toBeInTheDocument();
});

test('envio único: clique duplo manda uma só requisição', async () => {
  let resolve!: (v: unknown) => void;
  post.mockReturnValue(new Promise((r) => { resolve = r; }));
  render(<ReturnConfirm deliveryId="d9" onDone={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('PIN de devolução (6 dígitos)'), { target: { value: '123456' } });
  const btn = screen.getByRole('button', { name: /Confirmar devolução/ });
  fireEvent.click(btn);
  fireEvent.click(btn);
  expect(post).toHaveBeenCalledTimes(1);
  resolve({ data: {} });
  await waitFor(() => expect(screen.getByLabelText('PIN de devolução (6 dígitos)')).not.toBeDisabled());
});

test('erro do servidor aparece como mensagem', async () => {
  post.mockRejectedValue({ response: { status: 409, data: { error: 'Devolução já confirmada' } } });
  render(<ReturnConfirm deliveryId="d9" onDone={jest.fn()} />);
  fireEvent.change(screen.getByLabelText('PIN de devolução (6 dígitos)'), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: 'Confirmar devolução' }));
  expect(await screen.findByText('Devolução já confirmada')).toBeInTheDocument();
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'ReturnConfirm.module.css'), 'utf8'))).toEqual([]);
});
