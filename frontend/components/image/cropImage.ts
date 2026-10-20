// @ts-ignore
import { centerCrop, makeAspectCrop, type PercentCrop } from 'react-image-crop';

export type { PercentCrop };

/** Recorte inicial: o maior retângulo na proporção `aspect`, centrado na imagem (em %). */
export function initialCrop(naturalWidth: number, naturalHeight: number, aspect: number): PercentCrop {
  const wider = naturalWidth / naturalHeight > aspect;
  return centerCrop(
    makeAspectCrop(wider ? { unit: '%', height: 100 } : { unit: '%', width: 100 }, aspect, naturalWidth, naturalHeight),
    naturalWidth,
    naturalHeight,
  ) as PercentCrop;
}

/**
 * Desenha o trecho `crop` (em % da imagem) num canvas de exatamente `width × height` e exporta JPEG 0.92.
 * Usa toDataURL (síncrono) em vez de toBlob (assíncrono), que falhava em silêncio em alguns navegadores.
 */
export function cropImage(
  image: HTMLImageElement,
  crop: PercentCrop,
  width: number,
  height: number,
): { file: File; dataUrl: string } {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas indisponível');
  const nw = image.naturalWidth;
  const nh = image.naturalHeight;
  ctx.drawImage(
    image,
    (crop.x / 100) * nw,
    (crop.y / 100) * nh,
    (crop.width / 100) * nw,
    (crop.height / 100) * nh,
    0,
    0,
    width,
    height,
  );
  const dataUrl = canvas.toDataURL('image/jpeg', 0.92);
  const bin = atob(dataUrl.split(',')[1]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { file: new File([bytes], 'imagem.jpg', { type: 'image/jpeg' }), dataUrl };
}
