/**
 * Padrão de tamanho das imagens por área — fonte única no front, espelhada em `src/utils/imageSpecs.ts`
 * (o backend não tem `product`). Toda área passa pelo recorte na proporção (`ratio` = largura/altura) e
 * sai exatamente em `width × height`; imagem menor que isso é recusada antes do recorte.
 */
export interface ImageSpec {
  ratio: number;
  width: number;
  height: number;
  /** Nome da área no título do recorte ("Enquadrar <label>"). */
  label: string;
}

export const IMAGE_SPECS = {
  cover: { ratio: 3, width: 1200, height: 400, label: 'capa' },
  featuredBanner: { ratio: 2, width: 1200, height: 600, label: 'banner da Home' },
  promoBanner: { ratio: 2, width: 1200, height: 600, label: 'banner' },
  logo: { ratio: 1, width: 400, height: 400, label: 'logo' },
  product: { ratio: 1, width: 800, height: 800, label: 'foto do produto' },
  avatar: { ratio: 1, width: 400, height: 400, label: 'foto de perfil' },
} satisfies Record<string, ImageSpec>;

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
export const IMAGE_ACCEPT = 'image/jpeg,image/png,image/webp';
export const IMAGE_TYPES = IMAGE_ACCEPT.split(',');

/** "1200 × 400 px · JPG, PNG ou WebP · até 5 MB" */
export function specHint(spec: Pick<ImageSpec, 'width' | 'height'>): string {
  return `${spec.width} × ${spec.height} px · JPG, PNG ou WebP · até 5 MB`;
}

/** Mensagem de recusa se a imagem é menor que a área, ou `null`. A proporção fica a cargo do recorte. */
export function checkMinSize(width: number, height: number, spec: Pick<ImageSpec, 'width' | 'height'>): string | null {
  if (width >= spec.width && height >= spec.height) return null;
  return `Imagem pequena demais: precisa de pelo menos ${spec.width} × ${spec.height} px (a sua tem ${width} × ${height}).`;
}
