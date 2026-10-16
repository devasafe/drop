/** Caracterização de /admin/broadcasts: GET, POST { title, body, targetRoles } e DELETE (CEO). */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { confirmIfAsked, renderAdminPage, stubNativeDialogs } from './helpers/adminPage';
import api from '../lib/api';
import AdminBroadcasts from '../pages/admin/broadcasts';

const mockRouter = { pathname: '/admin/broadcasts', asPath: '/admin/broadcasts', query: {}, push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const HISTORY = [{
  _id: 'b1', title: 'Frete grátis', body: 'No fim de semana', targetRoles: ['cliente'],
  deliveryCount: 3912, sentAt: '2026-10-02T12:00:00.000Z', createdBy: { name: 'Asafe' },
}];

beforeEach(() => {
  jest.clearAllMocks();
  stubNativeDialogs();
  (api.get as jest.Mock).mockResolvedValue({ data: { broadcasts: HISTORY } });
  (api.post as jest.Mock).mockResolvedValue({ data: { deliveryCount: 97 } });
  (api.delete as jest.Mock).mockResolvedValue({ data: { success: true } });
});

it('lê os enviados', async () => {
  renderAdminPage(<AdminBroadcasts />);
  await screen.findByText('Frete grátis');
  expect(api.get).toHaveBeenCalledWith('/broadcasts');
});

it('envia: POST /broadcasts com título, mensagem e grupos; relê os enviados', async () => {
  renderAdminPage(<AdminBroadcasts />);
  await screen.findByText('Frete grátis');
  fireEvent.change(screen.getByPlaceholderText(/^Ex: Promoção de Verão/), { target: { value: 'Pico de sexta' } });
  fireEvent.change(screen.getByPlaceholderText(/^Escreva aqui o conteúdo do anúncio/), { target: { value: 'Fica online' } });
  fireEvent.click(screen.getByRole('checkbox', { name: 'Clientes' }));
  fireEvent.click(screen.getByRole('checkbox', { name: 'Motoboys' }));
  fireEvent.click(screen.getByRole('button', { name: /^(Publicar Anúncio|Enviar agora)$/ }));
  await confirmIfAsked('Enviar agora');
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/broadcasts', {
    title: 'Pico de sexta', body: 'Fica online', targetRoles: ['cliente', 'motoboy'],
  }));
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
});

it('CEO apaga: DELETE /broadcasts/:id', async () => {
  renderAdminPage(<AdminBroadcasts />);
  await screen.findByText('Frete grátis');
  const btn = screen.queryByRole('button', { name: 'Apagar Frete grátis' }) ?? screen.getByRole('button', { name: '✕' });
  fireEvent.click(btn);
  await confirmIfAsked('Apagar');
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/broadcasts/b1'));
});
