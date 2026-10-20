import { imageSize } from 'image-size';

/**
 * Padrão de tamanho por área — espelho de `frontend/lib/imageSpecs.ts` (fotos de produto ficam só no
 * front). O front já recorta na proporção e exporta no tamanho exato; aqui a regra é conferida de novo
 * antes do upload, para quem chama a API direto.
 */
export const IMAGE_SPECS = {
  cover: { ratio: '3:1', width: 1200, height: 400 },
  featuredBanner: { ratio: '2:1', width: 1200, height: 600 },
  promoBanner: { ratio: '2:1', width: 1200, height: 600 },
  logo: { ratio: '1:1', width: 400, height: 400 },
  avatar: { ratio: '1:1', width: 400, height: 400 },
} as const;

export type ImageSpecKey = keyof typeof IMAGE_SPECS;

/** Folga na proporção (±2%), para o arredondamento do recorte. */
const RATIO_TOLERANCE = 0.02;

/**
 * Confere tamanho mínimo e proporção da imagem. Devolve `null` se está dentro do padrão da área ou a
 * mensagem de erro (buffer ilegível também é recusado).
 */
export function checkImageSpec(buffer: Buffer, key: ImageSpecKey): string | null {
  const spec = IMAGE_SPECS[key];
  const message = `A imagem precisa ter pelo menos ${spec.width} × ${spec.height} px, na proporção ${spec.ratio}.`;
  let width: number | undefined;
  let height: number | undefined;
  try {
    const size = imageSize(buffer);
    // EXIF 5–8: a foto é exibida girada 90°, então largura e altura trocam.
    const rotated = (size.orientation ?? 1) >= 5;
    width = rotated ? size.height : size.width;
    height = rotated ? size.width : size.height;
  } catch {
    return message;
  }
  if (!width || !height) return message;
  if (width < spec.width || height < spec.height) return message;
  const expected = spec.width / spec.height;
  if (Math.abs(width / height - expected) / expected > RATIO_TOLERANCE) return message;
  return null;
}
