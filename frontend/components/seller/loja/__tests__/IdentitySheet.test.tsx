import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ToastProvider } from '../../../ui/Toast';
import { IdentitySheet, uploadStoreImage } from '../IdentitySheet';
import api from '../../../../lib/api';

jest.mock('../../../../lib/api', () => ({ __esModule: true, default: { post: jest.fn(), put: jest.fn() } }));

const renderSheet = (over: any = {}) => {
  const props = { open: true, onClose: jest.fn(), storeId: 's1', tagline: 'Som e carga', onSaved: jest.fn(), ...over };
  render(<ToastProvider><IdentitySheet {...props} /></ToastProvider>);
  return props;
};

beforeEach(() => jest.clearAllMocks());

test('salvar a frase manda PUT /stores/:id com a frase sem espaços nas pontas', async () => {
  (api.put as jest.Mock).mockResolvedValue({ data: { success: true } });
  const p = renderSheet();
  fireEvent.change(screen.getByLabelText('Frase da loja'), { target: { value: '  Som, carga e proteção  ' } });
  fireEvent.click(screen.getByText('Salvar frase'));
  await waitFor(() => expect(api.put).toHaveBeenCalledWith('/stores/s1', { tagline: 'Som, carga e proteção' }));
  expect(p.onSaved).toHaveBeenCalled();
  expect(p.onClose).toHaveBeenCalled();
});

test('frase com mais de 80 caracteres: erro e botão desligado', () => {
  renderSheet();
  fireEvent.change(screen.getByLabelText('Frase da loja'), { target: { value: 'x'.repeat(81) } });
  expect(screen.getByText('Use até 80 caracteres.')).toBeInTheDocument();
  expect(screen.getByText('Salvar frase').closest('button')).toBeDisabled();
});

test('logo sobe em POST /stores/:id/logo no campo logo', async () => {
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: { logoUrl: 'https://res.cloudinary.com/x/logo.png' } } });
  const p = renderSheet();
  const file = new File(['x'], 'logo.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Escolher o logo da loja'), { target: { files: [file] } });
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/stores/s1/logo', expect.any(FormData)));
  const fd = (api.post as jest.Mock).mock.calls[0][1] as FormData;
  expect(fd.get('logo')).toBe(file);
  await waitFor(() => expect(p.onSaved).toHaveBeenCalled());
});

test('erro do servidor ao enviar o logo aparece na tela', async () => {
  (api.post as jest.Mock).mockRejectedValue({ response: { status: 400, data: { error: 'Imagem inválida' } } });
  const p = renderSheet();
  fireEvent.change(screen.getByLabelText('Escolher o logo da loja'), { target: { files: [new File(['x'], 'l.png', { type: 'image/png' })] } });
  expect(await screen.findByText('Imagem inválida')).toBeInTheDocument();
  expect(p.onSaved).not.toHaveBeenCalled();
});

test('logo acima de 5 MB não sobe', () => {
  renderSheet();
  const big = new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'logo.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Escolher o logo da loja'), { target: { files: [big] } });
  expect(screen.getByText('A imagem pode ter até 5 MB.')).toBeInTheDocument();
  expect(api.post).not.toHaveBeenCalled();
});

test('uploadStoreImage: capa vai em /stores/banner?type=cover no campo banner e devolve a url', async () => {
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, type: 'cover', url: 'https://x/capa.png' } });
  const file = new File(['x'], 'c.png', { type: 'image/png' });
  await expect(uploadStoreImage('s1', 'cover', file)).resolves.toBe('https://x/capa.png');
  expect(api.post).toHaveBeenCalledWith('/stores/banner?type=cover', expect.any(FormData));
  expect(((api.post as jest.Mock).mock.calls[0][1] as FormData).get('banner')).toBe(file);
});

test('uploadStoreImage: logo devolve logoUrl', async () => {
  (api.post as jest.Mock).mockResolvedValue({ data: { success: true, data: { logoUrl: 'https://res.cloudinary.com/x/l.png' } } });
  await expect(uploadStoreImage('s1', 'logo', new File(['x'], 'l.png', { type: 'image/png' }))).resolves.toBe('https://res.cloudinary.com/x/l.png');
});
