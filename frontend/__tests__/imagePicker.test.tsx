// frontend/__tests__/imagePicker.test.tsx
/**
 * useImagePicker + ImageCropSheet: escolhe a imagem, recusa a pequena (sem recortar nem enviar),
 * abre o enquadrador travado na proporção e entrega o arquivo recortado no tamanho exato da área.
 */
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useImagePicker } from '../components/image/useImagePicker';
import { IMAGE_SPECS } from '../lib/imageSpecs';
import { mockCanvas, mockImageSize, mockImageError, mockImageBySrc, imageFile, dataUrlOf } from './helpers/imageMocks';

const onReady = jest.fn();

function Harness() {
  const picker = useImagePicker(IMAGE_SPECS.cover, onReady);
  return (
    <div>
      <label>
        Trocar capa
        <input {...picker.inputProps} aria-label="Escolher a capa" />
      </label>
      {picker.error && <p role="alert">{picker.error}</p>}
      {picker.sheet}
    </div>
  );
}

const choose = (file: File) => fireEvent.change(screen.getByLabelText('Escolher a capa'), { target: { files: [file] } });

beforeEach(() => {
  onReady.mockClear();
  jest.restoreAllMocks();
});

test('imagem menor que a área: mostra a mensagem, não abre o recorte e não chama onReady', async () => {
  mockImageSize(800, 300);
  render(<Harness />);
  choose(imageFile());
  expect(await screen.findByRole('alert')).toHaveTextContent('Imagem pequena demais: precisa de pelo menos 1200 × 400 px (a sua tem 800 × 300).');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(onReady).not.toHaveBeenCalled();
});

test('tipo fora de JPG/PNG/WebP ou acima de 5 MB: recusa antes de ler', async () => {
  mockImageSize(2000, 1000);
  render(<Harness />);
  choose(imageFile('anim.gif', 'image/gif'));
  expect(await screen.findByRole('alert')).toHaveTextContent('Use uma imagem JPG, PNG ou WebP.');
  const big = imageFile();
  Object.defineProperty(big, 'size', { value: 6 * 1024 * 1024 });
  choose(big);
  expect(await screen.findByRole('alert')).toHaveTextContent('A imagem pode ter até 5 MB.');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('imagem válida abre o Sheet "Enquadrar capa"; Cancelar fecha sem chamar onReady', async () => {
  mockImageSize(1600, 900);
  render(<Harness />);
  choose(imageFile());
  const dialog = await screen.findByRole('dialog');
  expect(dialog).toHaveTextContent('Enquadrar capa');
  fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(onReady).not.toHaveBeenCalled();
});

test('"Usar foto" entrega um JPEG recortado no tamanho exato da área', async () => {
  mockImageSize(1600, 900);
  const { drawImage } = mockCanvas();
  render(<Harness />);
  choose(imageFile());
  await screen.findByRole('dialog');
  fireEvent.click(screen.getByRole('button', { name: 'Usar foto' }));
  await waitFor(() => expect(onReady).toHaveBeenCalledTimes(1));
  const file: File = onReady.mock.calls[0][0];
  expect(file).toBeInstanceOf(File);
  expect(file.type).toBe('image/jpeg');
  // Recorte inicial centrado e o maior possível em 3:1: 1600 × 533 a partir de y = 183,5.
  const [, sx, sy, sw, sh, dx, dy, dw, dh] = drawImage.mock.calls[0];
  expect([dx, dy, dw, dh]).toEqual([0, 0, 1200, 400]);
  expect(sx).toBeCloseTo(0);
  expect(sw).toBeCloseTo(1600);
  expect(sw / sh).toBeCloseTo(3);
  expect(sy + sh / 2).toBeCloseTo(450);
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
});

test('arquivo que não decodifica: "Não deu para ler a imagem", sem recorte', async () => {
  mockImageError();
  render(<Harness />);
  choose(imageFile());
  expect(await screen.findByRole('alert')).toHaveTextContent('Não deu para ler a imagem. Tente outra.');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});

test('duas escolhas seguidas: a primeira, que termina de carregar depois, é descartada', async () => {
  // A grande demora a carregar; a pequena (escolhida depois) responde antes.
  mockImageBySrc((src) => (src === dataUrlOf('grande')
    ? { width: 2400, height: 800, delay: 30 }
    : { width: 300, height: 100 }));
  render(<Harness />);
  choose(imageFile('grande.png', 'image/png', 'grande'));
  choose(imageFile('pequena.png', 'image/png', 'pequena'));
  expect(await screen.findByRole('alert')).toHaveTextContent('a sua tem 300 × 100');
  await new Promise((r) => setTimeout(r, 80));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toBeInTheDocument();
});
