/**
 * O jsdom não decodifica imagem nem desenha em canvas. `mockImageSize` troca o `Image` global por um que
 * "carrega" com o tamanho pedido; `mockCanvas` faz o canvas devolver um JPEG falso.
 * O `Image` original volta depois de cada teste (afterEach registrado ao importar este helper).
 */
const OriginalImage = (global as any).Image;
afterEach(() => { (global as any).Image = OriginalImage; });

type Outcome = { width: number; height: number; delay?: number } | 'error';

/** `Image` falso: o resultado (tamanho e atraso, ou erro de decodificação) depende do `src`. */
export function mockImageBySrc(outcome: (src: string) => Outcome) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = 0;
    naturalHeight = 0;
    width = 0;
    height = 0;
    private _src = '';
    get src() { return this._src; }
    set src(v: string) {
      this._src = v;
      const r = outcome(v);
      if (r === 'error') { setTimeout(() => this.onerror?.(), 0); return; }
      this.naturalWidth = r.width;
      this.naturalHeight = r.height;
      this.width = r.width;
      this.height = r.height;
      setTimeout(() => this.onload?.(), r.delay ?? 0);
    }
  }
  (global as any).Image = FakeImage;
}

export const mockImageSize = (width: number, height: number) => mockImageBySrc(() => ({ width, height }));

/** Arquivo que o navegador não consegue decodificar. */
export const mockImageError = () => mockImageBySrc(() => 'error');

export function mockCanvas() {
  const drawImage = jest.fn();
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({ drawImage })) as any);
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => 'data:image/jpeg;base64,/9j/AA==');
  return { drawImage };
}

/** Um arquivo de imagem (o tamanho vem do mock; `content` diferencia o data URL de cada arquivo). */
export const imageFile = (name = 'foto.png', type = 'image/png', content = 'x') => new File([content], name, { type });

/** O data URL que o FileReader gera para `imageFile(…, content)`. */
export const dataUrlOf = (content: string, type = 'image/png') => `data:${type};base64,${btoa(content)}`;
