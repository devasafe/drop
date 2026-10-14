import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { post: jest.fn(), get: jest.fn() } }));
jest.mock('../../../map/RouteThumbnail', () => ({
  __esModule: true,
  RouteThumbnail: (p: any) => <button type="button" data-testid="mapa" data-height={p.height} onClick={p.onExpand} />,
  default: () => null,
}));
let mockOnline = true;
jest.mock('../../../../hooks/useOnline', () => ({ useOnline: () => mockOnline }));
import { EntregarView } from '../EntregarView';
const post = api.post as jest.Mock;

const ride = {
  _id: 'd1', orderId: 'o1', status: 'picked', customerAbsentWaitMin: 15,
  customerAddress: 'R. Harmonia, 412, ap. 52, Vila Madalena, São Paulo', deliveryLat: -23.55, deliveryLng: -46.69,
  customerObj: { _id: 'c1', name: 'Ana Souza', telefone: '11999990000' },
};
const h = () => ({ onChat: jest.fn(), onProblem: jest.fn(), onAbsent: jest.fn(), onFinished: jest.fn(), onReload: jest.fn() });
let logs: jest.SpyInstance[] = [];
beforeEach(() => {
  jest.clearAllMocks();
  post.mockReset();
  mockOnline = true;
  logs = (['log', 'info', 'warn', 'error', 'debug'] as const).map((m) => jest.spyOn(console, m).mockImplementation(() => undefined));
});
afterEach(() => logs.forEach((s) => s.mockRestore()));
const type = (v: string) => fireEvent.change(screen.getByLabelText('Código do cliente'), { target: { value: v } });
const finish = () => screen.getByRole('button', { name: 'Finalizar entrega' });

test('cliente, abrir no mapa, ligar e mensagem', () => {
  const x = h();
  render(<EntregarView ride={ride} self={null} {...x} />);
  expect(screen.getByTestId('mapa')).toHaveAttribute('data-height', '180');
  expect(screen.getByText('Ana Souza')).toBeInTheDocument();
  expect(screen.getByText(/R\. Harmonia, 412/)).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Abrir no mapa/ })).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=-23.55,-46.69&travelmode=driving');
  expect(screen.getByRole('link', { name: 'Ligar para o cliente' })).toHaveAttribute('href', 'tel:11999990000');
  fireEvent.click(screen.getByRole('button', { name: 'Mensagem para o cliente' }));
  expect(x.onChat).toHaveBeenCalled();
  expect(screen.getByText('Código que o cliente vai te dizer')).toBeInTheDocument();
});

test('tocar no mapa chama onOpenNav', () => {
  const onOpenNav = jest.fn();
  render(<EntregarView ride={ride} self={null} {...h()} onOpenNav={onOpenNav} />);
  fireEvent.click(screen.getByTestId('mapa'));
  expect(onOpenNav).toHaveBeenCalledTimes(1);
});

test('botão só liga com 5 dígitos e envia { pin } uma vez', async () => {
  const x = h();
  post.mockResolvedValue({ data: { success: true } });
  render(<EntregarView ride={ride} self={null} {...x} />);
  expect(finish()).toBeDisabled();
  type('7391');
  expect(finish()).toBeDisabled();
  type('73912');
  fireEvent.click(finish());
  fireEvent.click(finish());
  await waitFor(() => expect(x.onFinished).toHaveBeenCalled());
  expect(x.onFinished).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledTimes(1);
  expect(post).toHaveBeenCalledWith('/deliveries/d1/finalizar', { pin: '73912' });
});

test('só vai para "concluída" depois que o servidor confirma', async () => {
  const x = h();
  let resolve!: (v: any) => void;
  post.mockReturnValueOnce(new Promise((r) => { resolve = r; }));
  render(<EntregarView ride={ride} self={null} {...x} />);
  type('73912');
  fireEvent.click(finish());
  expect(finish()).toBeDisabled();
  expect(x.onFinished).not.toHaveBeenCalled();
  await act(async () => { resolve({ data: { success: true } }); });
  expect(x.onFinished).toHaveBeenCalledTimes(1);
});

test('PIN errado: caixas vermelhas, mensagem do servidor e o mesmo PIN não vai de novo', async () => {
  const x = h();
  post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'PIN inválido' } } });
  render(<EntregarView ride={ride} self={null} {...x} />);
  type('11111');
  fireEvent.click(finish());
  expect(await screen.findByRole('alert')).toHaveTextContent('PIN inválido');
  expect(screen.getByLabelText('Código do cliente')).toHaveAttribute('aria-invalid', 'true');
  expect(document.querySelectorAll('[data-pin-box][data-error="true"]')).toHaveLength(5);
  expect(screen.getByText('Peça o código de novo ao cliente.')).toBeInTheDocument();
  expect(finish()).toBeDisabled();
  type('1111');
  type('11111');
  expect(finish()).toBeDisabled();
  fireEvent.click(finish());
  expect(post).toHaveBeenCalledTimes(1);
  type('22222');
  expect(finish()).toBeEnabled();
  expect(x.onFinished).not.toHaveBeenCalled();
  for (const s of logs) for (const c of s.mock.calls) expect(JSON.stringify(c)).not.toMatch(/11111|22222/);
});

test('bloqueio 429: mostra o tempo do servidor e deixa reenviar o mesmo PIN', async () => {
  post.mockRejectedValueOnce({ response: { status: 429, data: { error: 'Muitas tentativas de PIN. Tente novamente em 12 min.', code: 'PIN_LOCKED' } } });
  render(<EntregarView ride={ride} self={null} {...h()} />);
  type('33333');
  fireEvent.click(finish());
  expect(await screen.findByRole('alert')).toHaveTextContent('Muitas tentativas de PIN. Tente novamente em 12 min.');
  expect(finish()).toBeEnabled();
});

test('409 relê a corrida', async () => {
  const x = h();
  post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Pedido cancelado; a entrega não pode ser finalizada', code: 'ORDER_CLOSED' } } });
  render(<EntregarView ride={ride} self={null} {...x} />);
  type('44444');
  fireEvent.click(finish());
  await waitFor(() => expect(x.onReload).toHaveBeenCalled());
  expect(screen.getByRole('alert')).toHaveTextContent('Pedido cancelado; a entrega não pode ser finalizada');
  expect(x.onFinished).not.toHaveBeenCalled();
});

test('409 "Already delivered" (resposta anterior perdida): conclui e relê, sem erro', async () => {
  const x = h();
  post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Already delivered' } } });
  render(<EntregarView ride={ride} self={null} {...x} />);
  type('44444');
  fireEvent.click(finish());
  await waitFor(() => expect(x.onFinished).toHaveBeenCalledTimes(1));
  expect(x.onReload).toHaveBeenCalled();
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});

test('falha de rede: mensagem e o mesmo PIN pode ir de novo', async () => {
  post.mockRejectedValueOnce(new Error('Network Error'));
  render(<EntregarView ride={ride} self={null} {...h()} />);
  type('66666');
  fireEvent.click(finish());
  expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para finalizar agora');
  expect(finish()).toBeEnabled();
});

test('sem internet: guarda o PIN e espera', () => {
  mockOnline = false;
  render(<EntregarView ride={ride} self={null} {...h()} />);
  type('55555');
  expect(finish()).toBeDisabled();
  expect(screen.getByLabelText('Código do cliente')).toHaveValue('55555');
  expect(screen.getByText('Sem conexão: o código fica guardado aqui e você finaliza quando a internet voltar.')).toBeInTheDocument();
});

test('"Cliente não atende?" com a espera do servidor e problema na entrega', () => {
  const x = h();
  render(<EntregarView ride={ride} self={null} {...x} />);
  expect(screen.getByText('Cliente não atende?')).toBeInTheDocument();
  expect(screen.getByText(/Aguarde 15 min no local/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Ver a espera' }));
  expect(x.onAbsent).toHaveBeenCalled();
  fireEvent.click(screen.getByRole('button', { name: 'Tive um problema na entrega' }));
  expect(x.onProblem).toHaveBeenCalled();
});

test('sem a espera do servidor, não inventa número', () => {
  render(<EntregarView ride={{ ...ride, customerAbsentWaitMin: undefined }} self={null} {...h()} />);
  expect(screen.queryByText(/Aguarde \d+ min/)).not.toBeInTheDocument();
  expect(screen.getByText(/Aguarde a espera mínima no local/)).toBeInTheDocument();
});
