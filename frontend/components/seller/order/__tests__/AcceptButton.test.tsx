import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, act, waitFor } from '@testing-library/react';
import { AcceptButton, ACCEPT_CONFIRM_MS } from '../AcceptButton';
import api from '../../../../lib/api';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, post: jest.fn() } }));
const post = api.post as jest.Mock;

beforeEach(() => { jest.clearAllMocks(); });
afterEach(() => { jest.useRealTimers(); });

const arm = () => {
  fireEvent.click(screen.getByRole('button', { name: /aceitar pedido/i }));
  fireEvent.click(screen.getByRole('button', { name: /toque de novo/i }));
};

test('primeiro toque só arma; o segundo, dentro de 3 s, envia o mesmo payload da tela antiga', async () => {
  post.mockResolvedValue({ data: { requiresDelivery: true } });
  const onAccepted = jest.fn();
  render(<AcceptButton orderId="o1" distance={2.4} onAccepted={onAccepted} />);
  fireEvent.click(screen.getByRole('button', { name: /aceitar pedido/i }));
  expect(post).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: /toque de novo para aceitar/i }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/orders/o1/accept', { distance: 2.4 }));
  expect(post).toHaveBeenCalledTimes(1);
  await waitFor(() => expect(onAccepted).toHaveBeenCalledWith({ requiresDelivery: true }));
});

test('depois de 3 s o botão desarma e um toque sozinho não aceita', () => {
  jest.useFakeTimers();
  render(<AcceptButton orderId="o1" distance={0} onAccepted={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /aceitar pedido/i }));
  act(() => { jest.advanceTimersByTime(ACCEPT_CONFIRM_MS); });
  expect(screen.getByRole('button', { name: /aceitar pedido/i })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: /aceitar pedido/i }));
  expect(post).not.toHaveBeenCalled();
  expect(ACCEPT_CONFIRM_MS).toBe(3000);
});

test('400 + recarga mostrando que não aguarda mais aceite: "Já aceito"', async () => {
  post.mockRejectedValue({ response: { status: 400, data: { error: 'Pedido não está aguardando aceite' } } });
  const reload = jest.fn().mockResolvedValue(false);
  render(<AcceptButton orderId="o1" distance={0} onAccepted={jest.fn()} onAlreadyHandled={reload} />);
  arm();
  expect(await screen.findByText('Já aceito')).toBeInTheDocument();
  expect(reload).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledTimes(1);
});

test('400 + recarga mostrando que ainda aguarda: mensagem do servidor', async () => {
  post.mockRejectedValue({ response: { status: 400, data: { error: 'Distância inválida' } } });
  const reload = jest.fn().mockResolvedValue(true);
  render(<AcceptButton orderId="o1" distance={0} onAccepted={jest.fn()} onAlreadyHandled={reload} />);
  arm();
  expect(await screen.findByText('Distância inválida')).toBeInTheDocument();
  expect(screen.queryByText('Já aceito')).not.toBeInTheDocument();
  expect(reload).toHaveBeenCalledTimes(1);
});

test('STORE_TRANSFER_PENDING mostra a mensagem do servidor e não recarrega', async () => {
  post.mockRejectedValue({ response: { status: 409, data: { error: 'Há repasse Pix a motoboy pendente há muito tempo.', code: 'STORE_TRANSFER_PENDING' } } });
  const reload = jest.fn().mockResolvedValue(false);
  render(<AcceptButton orderId="o1" distance={0} onAccepted={jest.fn()} onAlreadyHandled={reload} />);
  arm();
  expect(await screen.findByText('Há repasse Pix a motoboy pendente há muito tempo.')).toBeInTheDocument();
  expect(screen.queryByText('Já aceito')).not.toBeInTheDocument();
  expect(reload).not.toHaveBeenCalled();
});

test('não usa window.confirm', () => {
  const spy = jest.spyOn(window, 'confirm').mockImplementation(() => true);
  render(<AcceptButton orderId="o1" distance={0} onAccepted={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: /aceitar pedido/i }));
  expect(spy).not.toHaveBeenCalled();
  spy.mockRestore();
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'AcceptButton.module.css'), 'utf8'))).toEqual([]);
});
