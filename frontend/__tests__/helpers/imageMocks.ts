/**
 * O jsdom não decodifica imagem nem desenha em canvas. `mockImageSize` troca o `Image` global por um que
 * "carrega" com o tamanho pedido; `mockCanvas` faz o canvas devolver um JPEG falso.
 */
export function mockImageSize(width: number, height: number) {
  class FakeImage {
    onload: (() => void) | null = null;
    onerror: (() => void) | null = null;
    naturalWidth = width;
    naturalHeight = height;
    width = width;
    height = height;
    private _src = '';
    get src() { return this._src; }
    set src(v: string) {
      this._src = v;
      setTimeout(() => this.onload?.(), 0);
    }
  }
  (global as any).Image = FakeImage;
}

export function mockCanvas() {
  const drawImage = jest.fn();
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation((() => ({ drawImage })) as any);
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => 'data:image/jpeg;base64,/9j/AA==');
  return { drawImage };
}

/** Um arquivo de imagem qualquer (o conteúdo não importa: o tamanho vem de `mockImageSize`). */
export const imageFile = (name = 'foto.png', type = 'image/png') => new File(['x'], name, { type });
