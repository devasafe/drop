/**
 * Avisos da home (22/10, segurança): link e imagem do banner, que aparece na home pública.
 * Com a gestão aberta a banner:manage, o servidor recusa o que viraria XSS (javascript:, data:, //host…).
 * frontend/lib/safeLink.ts repete a regra do link antes do href (defesa para o que já está gravado).
 */
import { AppError } from './AppError';

export const BANNER_LINK_MAX = 2048;
/** Host do `secure_url` que uploadToCloudinary devolve. */
export const BANNER_IMAGE_HOST = 'res.cloudinary.com';

const INTERNAL_PATH = /^\/(?![/\\])[^\s\\]*$/;
const ABSOLUTE_HTTP = /^https?:\/\/[^\s\\]+$/i;

export const invalidLink = () =>
  new AppError('Link inválido: use um endereço que comece com https:// ou /.', 400, true, 'INVALID_LINK');
export const invalidImage = () =>
  new AppError('Imagem inválida: envie a imagem pelo upload do aviso.', 400, true, 'INVALID_IMAGE');

/** Link do banner: vazio → null; caminho interno ou http(s) absoluto → o texto sem espaços nas pontas. */
export function parseBannerLink(raw: unknown): string | null {
  if (raw === null || raw === undefined) return null;
  if (typeof raw !== 'string') throw invalidLink();
  const text = raw.trim();
  if (text === '') return null;
  if (text.length > BANNER_LINK_MAX) throw invalidLink();
  if (INTERNAL_PATH.test(text)) return text;
  if (!ABSOLUTE_HTTP.test(text)) throw invalidLink();
  try {
    const url = new URL(text);
    if ((url.protocol !== 'https:' && url.protocol !== 'http:') || !url.hostname) throw invalidLink();
  } catch {
    throw invalidLink();
  }
  return text;
}

/** Imagem do banner: só https do Cloudinary. */
export function parseBannerImage(raw: unknown): string {
  if (typeof raw !== 'string') throw invalidImage();
  const text = raw.trim();
  let url: URL;
  try {
    url = new URL(text);
  } catch {
    throw invalidImage();
  }
  if (url.protocol !== 'https:' || url.hostname !== BANNER_IMAGE_HOST || text.length > BANNER_LINK_MAX) throw invalidImage();
  return text;
}
