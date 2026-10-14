import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { post: jest.fn() } }));
import { ClienteAusenteView } from '../ClienteAusenteView';
const post = api.post as jest.Mock;

const T0 = new Date('2026-10-14T14:20:00Z').getTime(); // retirada
const ride = {
  _id: 'd1', status: 'picked', pickedAt: new Date(T0).toISOString(), customerAbsentWaitMin: 15,
  customerAbsentAvailableAt: new Date(T0 + 15 * 60_000).toISOString(),
  customerObj: { _id: 'c1', name: 'Ana Souza', telefone: '11999990000' },
};
const h = () => ({ onChat: jest.fn(), onClosed: jest.fn(), onReload: jest.fn() });
beforeEach(() => jest.clearAllMocks());

test('em espera: 9:48 de 15:00 e botão travado com o tempo que falta', () => {
  render(<ClienteAusenteView ride={ride} now={T0 + 9 * 60_000 + 48_000} {...h()} />);
  expect(screen.getByText('Espera no local')).toBeInTheDocument();
  expect(screen.getByText('9:48')).toBeInTheDocument();
  expect(screen.getByText('de 15:00')).toBeInTheDocument();
  expect(screen.getByText('Depois de 15 min você pode encerrar como "cliente ausente".')).toBeInTheDocument();
  const btn = screen.getByRole('button', { name: 'Encerrar como ausente · em 5:12' });
  expect(btn).toBeDisabled();
  expect(screen.getByText('O botão libera quando a espera terminar')).toBeInTheDocument();
});

test('contato: ligar e mensagem', () => {
  const x = h();
  render(<ClienteAusenteView ride={ride} now={T0} {...x} />);
  expect(screen.getByRole('link', { name: /Ligar/ })).toHaveAttribute('href', 'tel:11999990000');
  fireEvent.click(screen.getByRole('button', { name: /Mandar mensagem/ }));
  expect(x.onChat).toHaveBeenCalled();
  expect(screen.getByText('O que acontece se encerrar')).toBeInTheDocument();
});

test('espera cumprida: um envio só (em voo e depois do sucesso) e devolve compensação e PIN', async () => {
  const x = h();
  let resolve!: (v: any) => void;
  post.mockReturnValue(new Promise((r) => { resolve = r; }));
  render(<ClienteAusenteView ride={ride} now={T0 + 15 * 60_000} {...x} />);
  const btn = screen.getByRole('button', { name: 'Encerrar como ausente' });
  fireEvent.click(btn);
  fireEvent.click(btn);
  expect(post).toHaveBeenCalledTimes(1);
  resolve({ data: { success: true, pinDevolucao: '631500', motoboyCompensation: 9.6 } });
  await waitFor(() => expect(x.onClosed).toHaveBeenCalledWith({ compensation: 9.6, pinDevolucao: '631500' }));
  fireEvent.click(screen.getByRole('button', { name: 'Encerrar como ausente' }));
  expect(post).toHaveBeenCalledTimes(1);
  expect(x.onClosed).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith('/deliveries/d1/cliente-ausente', {});
});

test('erro genérico: mensagem de reserva e botão reabilitado', async () => {
  const x = h();
  post.mockRejectedValue({ response: { status: 500, data: {} } });
  render(<ClienteAusenteView ride={ride} now={T0 + 15 * 60_000} {...x} />);
  fireEvent.click(screen.getByRole('button', { name: 'Encerrar como ausente' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para encerrar agora');
  expect(screen.getByRole('button', { name: 'Encerrar como ausente' })).toBeEnabled();
  expect(x.onClosed).not.toHaveBeenCalled();
});

test('400 de espera: usa o remainingMs do servidor e trava de novo', async () => {
  post.mockRejectedValue({ response: { status: 400, data: { error: 'Espera mínima de 15 min ainda não cumprida', waitMinutesRequired: 15, remainingMs: 60_000 } } });
  const now = T0 + 15 * 60_000;
  const spy = jest.spyOn(Date, 'now').mockReturnValue(now);
  const x = h();
  const { rerender } = render(<ClienteAusenteView ride={ride} now={now} {...x} />);
  fireEvent.click(screen.getByRole('button', { name: 'Encerrar como ausente' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Ainda faltam 1:00 de espera.');
  expect(post).toHaveBeenCalledTimes(1);
  expect(x.onClosed).not.toHaveBeenCalled();
  rerender(<ClienteAusenteView ride={ride} now={now} {...x} />);
  expect(screen.getByRole('button', { name: 'Encerrar como ausente · em 1:00' })).toBeDisabled();
  spy.mockRestore();
});

test('sem a hora do servidor: não deixa encerrar e oferece reler', () => {
  const x = h();
  render(<ClienteAusenteView ride={{ ...ride, customerAbsentAvailableAt: null }} now={T0 + 60 * 60_000} {...x} />);
  expect(screen.getByRole('button', { name: /Encerrar como ausente/ })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Tentar de novo' }));
  expect(x.onReload).toHaveBeenCalled();
});

test('409 relê a corrida e mostra a mensagem', async () => {
  const x = h();
  post.mockRejectedValue({ response: { status: 409, data: { error: 'Pedido já foi cancelado ou está em processamento' } } });
  render(<ClienteAusenteView ride={ride} now={T0 + 16 * 60_000} {...x} />);
  fireEvent.click(screen.getByRole('button', { name: 'Encerrar como ausente' }));
  await waitFor(() => expect(x.onReload).toHaveBeenCalled());
  expect(screen.getByRole('alert')).toHaveTextContent('Pedido já foi cancelado ou está em processamento');
});

test('400 de estado relê a corrida', async () => {
  const x = h();
  post.mockRejectedValue({ response: { status: 400, data: { error: 'Entrega não está em andamento', currentStatus: 'cancelled' } } });
  render(<ClienteAusenteView ride={ride} now={T0 + 16 * 60_000} {...x} />);
  fireEvent.click(screen.getByRole('button', { name: 'Encerrar como ausente' }));
  await waitFor(() => expect(x.onReload).toHaveBeenCalled());
});
