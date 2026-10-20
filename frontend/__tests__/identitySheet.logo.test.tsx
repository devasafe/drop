// frontend/__tests__/identitySheet.logo.test.tsx
/** Frase e logo: o logo passa pelo recorte 1:1 (400 × 400) antes de subir; logo pequeno é recusado. */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../components/ui/Toast';
import { IdentitySheet } from '../components/seller/loja/IdentitySheet';
import api from '../lib/api';
import { mockCanvas, mockImageSize, imageFile } from './helpers/imageMocks';

jest.mock('../lib/api', () => ({ __esModule: true, default: { defaults: { baseURL: 'http://x/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn() } }));

const onSaved = jest.fn();
const renderSheet = () => render(
  <ToastProvider>
    <IdentitySheet open onClose={jest.fn()} storeId="s1" logoUrl={null} tagline="Som" storeName="Eletro" onSaved={onSaved} />
  </ToastProvider>,
);

beforeEach(() => {
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

test('logo passa por "Enquadrar logo" e sobe em 400 × 400', async () => {
  mockImageSize(1000, 800);
  const { drawImage } = mockCanvas();
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: { logoUrl: '/l.jpg' } } });
  renderSheet();
  fireEvent.change(screen.getByLabelText('Escolher o logo da loja'), { target: { files: [imageFile('logo.png')] } });
  expect(await screen.findByText('Enquadrar logo')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Usar foto' }));
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/s1/logo', expect.any(FormData)));
  expect(drawImage.mock.calls[0].slice(-2)).toEqual([400, 400]);
  await waitFor(() => expect(onSaved).toHaveBeenCalled());
});

test('logo menor que 400 × 400: mostra a mensagem e não envia', async () => {
  mockImageSize(300, 300);
  renderSheet();
  fireEvent.change(screen.getByLabelText('Escolher o logo da loja'), { target: { files: [imageFile('logo.png')] } });
  expect(await screen.findByText('Imagem pequena demais: precisa de pelo menos 400 × 400 px (a sua tem 300 × 300).')).toBeInTheDocument();
  expect(screen.queryByText('Enquadrar logo')).not.toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});
