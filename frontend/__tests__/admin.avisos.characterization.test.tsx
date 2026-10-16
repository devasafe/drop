/** Caracterização de /admin/avisos: banners (GET, upload, POST, PATCH ativo/ordem, DELETE). */
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { confirmIfAsked, renderAdminPage, stubNativeDialogs } from './helpers/adminPage';
import api from '../lib/api';
import AdminAvisos from '../pages/admin/avisos';

const mockRouter = { pathname: '/admin/avisos', asPath: '/admin/avisos', query: {}, push: jest.fn(), replace: jest.fn() };
jest.mock('next/router', () => ({ useRouter: () => mockRouter }));
jest.mock('../lib/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), patch: jest.fn(), delete: jest.fn() },
}));
jest.mock('../components/admin/AdminShell', () => require('./helpers/adminShellMock'));
const mockToast = jest.fn();
jest.mock('../components/ui/Toast', () => ({ useToast: () => ({ showToast: mockToast }) }));

const BANNERS = [
  { _id: 'b1', imageUrl: '/uploads/a.jpg', linkUrl: '/produtos', title: 'Semana Tech', active: true, sortOrder: 0 },
  { _id: 'b2', imageUrl: '/uploads/b.jpg', linkUrl: null, title: null, active: true, sortOrder: 1 },
];

beforeEach(() => {
  jest.clearAllMocks();
  stubNativeDialogs();
  (api.get as jest.Mock).mockResolvedValue({ data: BANNERS });
  (api.patch as jest.Mock).mockResolvedValue({ data: {} });
  (api.delete as jest.Mock).mockResolvedValue({ data: {} });
  (api.post as jest.Mock).mockImplementation((url: string) =>
    url === '/banners/upload' ? Promise.resolve({ data: { imageUrl: '/uploads/novo.jpg' } }) : Promise.resolve({ data: {} }),
  );
});

const loaded = () => screen.findAllByRole('button', { name: 'Descer' });

it('lê todos os avisos', async () => {
  renderAdminPage(<AdminAvisos />);
  await loaded();
  expect(api.get).toHaveBeenCalledWith('/banners/all');
});

it('liga/desliga: PATCH { active }', async () => {
  renderAdminPage(<AdminAvisos />);
  await loaded();
  const switches = screen.queryAllByRole('switch');
  fireEvent.click(switches.length ? switches[0] : screen.getAllByRole('button', { name: /^(Ativo|Inativo)$/ })[0]);
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/banners/b1', { active: false }));
});

it('descer: troca o sortOrder dos dois avisos e relê', async () => {
  renderAdminPage(<AdminAvisos />);
  fireEvent.click((await loaded())[0]);
  await waitFor(() => expect(api.patch).toHaveBeenCalledWith('/banners/b1', { sortOrder: 1 }));
  expect(api.patch).toHaveBeenCalledWith('/banners/b2', { sortOrder: 0 });
  await waitFor(() => expect(api.get).toHaveBeenCalledTimes(2));
});

it('remover: DELETE /banners/:id', async () => {
  renderAdminPage(<AdminAvisos />);
  await loaded();
  fireEvent.click(screen.getAllByRole('button', { name: 'Remover' })[0]);
  await confirmIfAsked('Remover');
  await waitFor(() => expect(api.delete).toHaveBeenCalledWith('/banners/b1'));
});

it('envia a imagem e publica com sortOrder = tamanho da lista', async () => {
  const { container } = renderAdminPage(<AdminAvisos />);
  await loaded();
  const file = new File(['x'], 'banner.jpg', { type: 'image/jpeg' });
  fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [file] } });
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/banners/upload', expect.any(FormData), { headers: { 'Content-Type': 'multipart/form-data' } }));
  fireEvent.click(await screen.findByRole('button', { name: 'Publicar aviso' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/banners', {
    imageUrl: '/uploads/novo.jpg', linkUrl: null, title: null, sortOrder: 2,
  }));
});
