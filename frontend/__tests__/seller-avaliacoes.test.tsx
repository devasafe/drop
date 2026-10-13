// frontend/__tests__/seller-avaliacoes.test.tsx
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { ToastProvider } from '../components/ui/Toast';
import SellerAvaliacoes, { ratingStats } from '../pages/seller/avaliacoes';
import api from '../lib/api';

let mockPanel: any;
jest.mock('next/router', () => ({ useRouter: () => ({ push: jest.fn(), replace: jest.fn(), query: {}, pathname: '/seller/avaliacoes' }) }));
jest.mock('../components/ProtectedRoute', () => ({ __esModule: true, default: ({ children }: any) => <>{children}</> }));
jest.mock('../components/seller/panel/SellerShell', () => {
  const Shell = ({ title, actions, children }: any) => <div><h1>{title}</h1>{actions}{children}</div>;
  return { __esModule: true, default: Shell, SellerShell: Shell };
});
jest.mock('../components/seller/panel/SellerPanelProvider', () => ({ useSellerPanel: () => mockPanel }));
jest.mock('../lib/api', () => ({ __esModule: true, default: { get: jest.fn(), put: jest.fn() } }));

const now = new Date().toISOString();
const LIST = [
  { orderId: 'ord_abc1', storeRating: 3, storeComment: 'Demorou pra aceitar', createdAt: now, storeReply: null, storeRepliedAt: null },
  { orderId: 'ord_abc2', storeRating: 5, storeComment: 'Chegou em 20 minutos', createdAt: now, storeReply: 'Obrigado, Ana!', storeRepliedAt: now },
  { orderId: 'ord_abc3', storeRating: 5, storeComment: null, createdAt: now, storeReply: null, storeRepliedAt: null },
];
const renderPage = () => render(<ToastProvider><SellerAvaliacoes /></ToastProvider>);

beforeEach(() => {
  jest.clearAllMocks();
  mockPanel = { store: { _id: 's1', name: 'Eletro Center' }, orders: [], refresh: jest.fn(), newOrderCount: 0 };
  (api.get as jest.Mock).mockResolvedValue({ data: LIST });
});

test('resumo: média, contagem e filtros com a contagem sem resposta', async () => {
  renderPage();
  expect(await screen.findByText('4,3')).toBeInTheDocument();
  expect(screen.getByText('3 notas')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Sem resposta 2' })).toBeInTheDocument();
  expect(api.get).toHaveBeenCalledWith('/stores/s1/ratings');
});

test('responder publica com PUT e mostra a resposta com o nome da loja', async () => {
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true, data: { orderId: 'ord_abc1', storeReply: 'Valeu! Já ligamos o aviso.', storeRepliedAt: now } } });
  renderPage();
  const card = await screen.findByRole('article', { name: 'Avaliação do pedido #ABC1' });
  fireEvent.change(within(card).getByLabelText('Sua resposta'), { target: { value: '  Valeu! Já ligamos o aviso.  ' } });
  fireEvent.click(within(card).getByText('Responder'));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/s1/ratings/ord_abc1/reply', { text: 'Valeu! Já ligamos o aviso.' }));
  expect(await within(card).findByText('Valeu! Já ligamos o aviso.')).toBeInTheDocument();
  expect(within(card).getByText('Eletro Center')).toBeInTheDocument();
});

test('editar a resposta existente', async () => {
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true, data: { orderId: 'ord_abc2', storeReply: 'Obrigado de novo!', storeRepliedAt: now } } });
  renderPage();
  const card = await screen.findByRole('article', { name: 'Avaliação do pedido #ABC2' });
  fireEvent.click(within(card).getByText('Editar resposta'));
  const box = within(card).getByLabelText('Sua resposta') as HTMLTextAreaElement;
  expect(box.value).toBe('Obrigado, Ana!');
  fireEvent.change(box, { target: { value: 'Obrigado de novo!' } });
  fireEvent.click(within(card).getByText('Salvar resposta'));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/s1/ratings/ord_abc2/reply', { text: 'Obrigado de novo!' }));
});

test('resposta vazia ou com mais de 500 caracteres não sai', async () => {
  renderPage();
  const card = await screen.findByRole('article', { name: 'Avaliação do pedido #ABC1' });
  expect(within(card).getByText('Responder').closest('button')).toBeDisabled();
  fireEvent.change(within(card).getByLabelText('Sua resposta'), { target: { value: 'x'.repeat(501) } });
  expect(within(card).getByText('Responder').closest('button')).toBeDisabled();
});

test('filtro "Notas 1–3" mostra só as notas baixas', async () => {
  renderPage();
  await screen.findByText('4,3');
  fireEvent.click(screen.getByRole('button', { name: 'Notas 1–3' }));
  expect(screen.getByRole('article', { name: 'Avaliação do pedido #ABC1' })).toBeInTheDocument();
  expect(screen.queryByRole('article', { name: 'Avaliação do pedido #ABC2' })).not.toBeInTheDocument();
});

test('sem avaliações e erro', async () => {
  (api.get as jest.Mock).mockResolvedValueOnce({ data: [] });
  const { unmount } = renderPage();
  expect(await screen.findByText('As avaliações chegam depois das entregas')).toBeInTheDocument();
  unmount();
  (api.get as jest.Mock).mockRejectedValueOnce(new Error('rede')).mockResolvedValueOnce({ data: LIST });
  renderPage();
  fireEvent.click(await screen.findByText('Tentar de novo'));
  expect(await screen.findByText('4,3')).toBeInTheDocument();
});

test('ratingStats', () => {
  const s = ratingStats(LIST as any);
  expect(s.count).toBe(3);
  expect(s.dist).toEqual({ 5: 2, 4: 0, 3: 1, 2: 0, 1: 0 });
  expect(s.unanswered).toBe(2);
});
