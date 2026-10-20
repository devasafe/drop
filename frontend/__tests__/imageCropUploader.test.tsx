// frontend/__tests__/imageCropUploader.test.tsx
/** ImageCropUploader (fotos de produto): recusa imagem menor que o tamanho final e recorta com cropImage. */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import ImageCropUploader from '../components/ImageCropUploader';
import { mockCanvas, mockImageSize, imageFile } from './helpers/imageMocks';

const onFileCropped = jest.fn();
const renderUploader = () => {
  const { container } = render(
    <ImageCropUploader aspectRatio={1} targetWidth={800} targetHeight={800} label="Adicionar foto" onFileCropped={onFileCropped} />,
  );
  return container.querySelector('input[type="file"]') as HTMLInputElement;
};

beforeEach(() => {
  onFileCropped.mockClear();
  jest.restoreAllMocks();
});

test('foto menor que 800 × 800: mostra a mensagem e não abre o recorte', async () => {
  mockImageSize(600, 900);
  fireEvent.change(renderUploader(), { target: { files: [imageFile()] } });
  expect(await screen.findByRole('alert')).toHaveTextContent('Imagem pequena demais: precisa de pelo menos 800 × 800 px (a sua tem 600 × 900).');
  expect(screen.queryByRole('button', { name: 'Confirmar recorte' })).not.toBeInTheDocument();
  expect(onFileCropped).not.toHaveBeenCalled();
});

test('foto grande: recorte centrado sai em 800 × 800', async () => {
  mockImageSize(1600, 1000);
  const { drawImage } = mockCanvas();
  fireEvent.change(renderUploader(), { target: { files: [imageFile()] } });
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar recorte' }));
  await waitFor(() => expect(onFileCropped).toHaveBeenCalledTimes(1));
  expect(onFileCropped.mock.calls[0][0].type).toBe('image/jpeg');
  const [, sx, sy, sw, sh, , , dw, dh] = drawImage.mock.calls[0];
  expect([dw, dh]).toEqual([800, 800]);
  expect([sx, sy, sw, sh].map(Math.round)).toEqual([300, 0, 1000, 1000]);
});

test('falha do canvas ao confirmar: mostra o aviso e não entrega arquivo', async () => {
  mockImageSize(1600, 1000);
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => null) as any);
  fireEvent.change(renderUploader(), { target: { files: [imageFile()] } });
  fireEvent.click(await screen.findByRole('button', { name: 'Confirmar recorte' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para recortar a imagem. Tente outra.');
  expect(onFileCropped).not.toHaveBeenCalled();
});
