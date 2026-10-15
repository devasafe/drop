import fs from 'fs';
import path from 'path';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../../../../lib/api';
import { cssViolations } from '../../../../__tests__/helpers/dsTokens';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));
import { ProblemSheet, PROBLEM_OPTIONS } from '../ProblemSheet';
const post = api.post as jest.Mock;

const base = { open: true, onClose: jest.fn(), deliveryId: 'd1', orderCode: '004821', onCustomerAbsent: jest.fn(), onDone: jest.fn() };

beforeEach(() => { jest.clearAllMocks(); post.mockResolvedValue({ status: 200, data: { success: true, status: 'pending' } }); });

test('na retirada: Loja demorando, Não consigo ir, Problema com a moto e Outro motivo (sem "Cliente não atende")', () => {
  render(<ProblemSheet {...base} stage="retirar" />);
  expect(screen.getByText('O que aconteceu?')).toBeInTheDocument();
  expect(screen.getByText('Pedido #004821')).toBeInTheDocument();
  for (const l of ['Loja demorando', 'Não consigo ir', 'Problema com a moto', 'Outro motivo']) expect(screen.getByRole('button', { name: new RegExp(l) })).toBeInTheDocument();
  expect(screen.queryByText('Cliente não atende')).not.toBeInTheDocument();
});

test('devolver na retirada: payload igual ao do modal antigo e onDone sem devolução pendente', async () => {
  render(<ProblemSheet {...base} stage="retirar" />);
  fireEvent.click(screen.getByRole('button', { name: /Não consigo ir/ }));
  expect(screen.getByText(/A corrida volta para outros entregadores/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Devolver corrida' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/deliveries/d1/reject', { reason: 'Não consigo chegar ao local', action: 'reassign', reasonCode: 'delivery_failed' }));
  expect(base.onDone).toHaveBeenCalledWith({ pending: false, pinDevolucao: null });
});

test('na entrega, 202 devolve o código de devolução', async () => {
  post.mockResolvedValue({ status: 202, data: { success: true, pinDevolucao: '631500', isPending: true } });
  render(<ProblemSheet {...base} stage="entregar" />);
  fireEvent.click(screen.getByRole('button', { name: /Endereço errado ou não encontro/ }));
  expect(screen.getByText(/Você leva o pacote de volta à loja/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Devolver corrida' }));
  await waitFor(() => expect(post).toHaveBeenCalledWith('/deliveries/d1/reject', { reason: 'Endereço incorreto ou não encontrado', action: 'reassign', reasonCode: 'address_invalid' }));
  expect(base.onDone).toHaveBeenCalledWith({ pending: true, pinDevolucao: '631500' });
});

test('"Cliente não atende" leva para a espera, sem chamar rota', () => {
  render(<ProblemSheet {...base} stage="entregar" />);
  fireEvent.click(screen.getByRole('button', { name: /Cliente não atende/ }));
  expect(base.onCustomerAbsent).toHaveBeenCalled();
  expect(post).not.toHaveBeenCalled();
});

test('Outro motivo exige o texto e envia o texto como reason', async () => {
  render(<ProblemSheet {...base} stage="entregar" />);
  fireEvent.click(screen.getByRole('button', { name: /Outro motivo/ }));
  const btn = screen.getByRole('button', { name: 'Devolver corrida' });
  expect(btn).toBeDisabled();
  fireEvent.change(screen.getByLabelText('O que aconteceu?'), { target: { value: 'Pneu furou' } });
  fireEvent.click(btn);
  await waitFor(() => expect(post).toHaveBeenCalledWith('/deliveries/d1/reject', { reason: 'Pneu furou', action: 'reassign', reasonCode: 'other' }));
});

test('erro do servidor aparece e nada muda', async () => {
  post.mockRejectedValue({ response: { status: 400, data: { error: 'Entrega não pode ser rejeitada no estado: delivered' } } });
  render(<ProblemSheet {...base} stage="retirar" />);
  fireEvent.click(screen.getByRole('button', { name: /Problema com a moto/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Devolver corrida' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Entrega não pode ser rejeitada no estado: delivered');
  expect(base.onDone).not.toHaveBeenCalled();
});

test('toque duplo manda um pedido só', async () => {
  let resolve: (v: any) => void = () => undefined;
  post.mockImplementation(() => new Promise((r) => { resolve = r; }));
  render(<ProblemSheet {...base} stage="retirar" />);
  fireEvent.click(screen.getByRole('button', { name: /Loja demorando/ }));
  const btn = screen.getByRole('button', { name: 'Devolver corrida' });
  fireEvent.click(btn);
  fireEvent.click(btn);
  resolve({ status: 200, data: {} });
  await waitFor(() => expect(base.onDone).toHaveBeenCalled());
  expect(post).toHaveBeenCalledTimes(1);
});

test('initialKey abre direto na confirmação (Devolver corrida da retirada atrasada)', () => {
  render(<ProblemSheet {...base} stage="retirar" initialKey="loja_demorando" />);
  expect(screen.getByRole('button', { name: 'Devolver corrida' })).toBeEnabled();
  expect(screen.getByText('Motivo: Loja demorando')).toBeInTheDocument();
});

test('códigos são só os que o backend já recebe hoje', () => {
  const codes = new Set([...PROBLEM_OPTIONS.retirar, ...PROBLEM_OPTIONS.entregar].map((o) => o.code).filter(Boolean));
  expect([...codes].sort()).toEqual(['address_invalid', 'delivery_failed', 'motoboy_unavailable', 'other']);
});

test('CSS só com tokens', () => {
  expect(cssViolations(fs.readFileSync(path.join(__dirname, '..', 'ProblemSheet.module.css'), 'utf8'))).toEqual([]);
});

test('"Falar com o suporte" leva para Ajuda e suporte do motoboy', () => {
  render(<ProblemSheet {...base} stage="retirar" />);
  expect(screen.getByRole('link', { name: 'Falar com o suporte' })).toHaveAttribute('href', '/motoboy/perfil/ajuda');
});
