// frontend/__tests__/imageCropLayout.test.tsx
/**
 * Enquadradores (ImageCropSheet e ImageCropUploader) com o ReactCrop simulado para ler as props:
 * - o limite de altura fica no próprio ReactCrop (className): o CSS da lib faz o wrapper e a <img>
 *   herdarem `max-height: inherit`, então um max-height na <img> nunca vale (o jsdom não faz layout,
 *   aqui só a estrutura é conferida);
 * - o piso do recorte (minWidth, em px na tela) acompanha a largura exibida da imagem.
 */
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ImageCropSheet } from '../components/image/ImageCropSheet';
import ImageCropUploader from '../components/ImageCropUploader';
import { IMAGE_SPECS } from '../lib/imageSpecs';
import { mockImageSize, imageFile } from './helpers/imageMocks';

let mockCropProps: any = null;
jest.mock('react-image-crop', () => {
  const actual = jest.requireActual('react-image-crop');
  return {
    __esModule: true,
    ...actual,
    default: (props: any) => {
      mockCropProps = props;
      return <div data-testid="react-crop" className={props.className}>{props.children}</div>;
    },
  };
});

// ResizeObserver controlado: `resize()` dispara os callbacks registrados.
let observers: Array<() => void> = [];
class FakeResizeObserver {
  constructor(private cb: () => void) {}
  observe() { observers.push(this.cb); }
  disconnect() { observers = observers.filter((c) => c !== this.cb); }
}
const resize = () => act(() => { observers.forEach((cb) => cb()); });

/** Simula a <img> exibida com `display` px de largura para uma foto de `natural` px. */
function showImage(img: HTMLImageElement, natural: number, display: number) {
  Object.defineProperty(img, 'naturalWidth', { configurable: true, value: natural });
  Object.defineProperty(img, 'clientWidth', { configurable: true, value: display });
}

beforeEach(() => {
  mockCropProps = null;
  observers = [];
  (global as any).ResizeObserver = FakeResizeObserver;
});
afterEach(() => { delete (global as any).ResizeObserver; });

const fakeLoaded = (w: number, h: number) => ({ naturalWidth: w, naturalHeight: h, width: w, height: h, src: 'data:image/png;base64,AA' }) as HTMLImageElement;

describe('ImageCropSheet', () => {
  it('o limite de altura vai no ReactCrop (className), não na <img>', () => {
    render(<ImageCropSheet image={fakeLoaded(1179, 2556)} spec={IMAGE_SPECS.avatar} onCancel={jest.fn()} onConfirm={jest.fn()} />);
    expect(screen.getByTestId('react-crop')).toHaveClass('crop');
    expect(screen.getByAltText('Imagem para enquadrar')).not.toHaveClass('img');
  });

  it('minWidth = largura de saída na escala exibida, e acompanha o redimensionamento', () => {
    render(<ImageCropSheet image={fakeLoaded(2400, 1200)} spec={IMAGE_SPECS.cover} onCancel={jest.fn()} onConfirm={jest.fn()} />);
    const img = screen.getByAltText('Imagem para enquadrar') as HTMLImageElement;
    showImage(img, 2400, 600);
    fireEvent.load(img);
    expect(mockCropProps.minWidth).toBe(300); // 1200 × 600 / 2400
    showImage(img, 2400, 320);
    resize();
    expect(mockCropProps.minWidth).toBe(160); // o celular girou: a imagem encolheu
  });
});

describe('ImageCropUploader', () => {
  it('mesmo limite de altura e mesmo piso de recorte do Sheet', async () => {
    mockImageSize(1600, 1600);
    const { container } = render(<ImageCropUploader aspectRatio={1} targetWidth={800} targetHeight={800} onFileCropped={jest.fn()} />);
    fireEvent.change(container.querySelector('input[type="file"]') as HTMLInputElement, { target: { files: [imageFile()] } });
    const crop = await screen.findByTestId('react-crop');
    expect(crop).toHaveClass('crop');
    const img = screen.getByAltText('Para recortar') as HTMLImageElement;
    showImage(img, 1600, 400);
    fireEvent.load(img);
    expect(mockCropProps.minWidth).toBe(200); // 800 × 400 / 1600
    showImage(img, 1600, 800);
    resize();
    expect(mockCropProps.minWidth).toBe(400);
  });
});
