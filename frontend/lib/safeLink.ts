/**
 * Link do banner da home (22/10, segurança): a mesma regra de src/utils/bannerLinks.ts. Só caminho interno
 * ("/…", nunca "//…") ou http(s) absoluto, até 2048 caracteres; o resto não vira href (defesa para banners
 * gravados antes da validação no servidor).
 */
const LINK_MAX = 2048;
const INTERNAL_PATH = /^\/(?![/\\])[^\s\\]*$/;
const ABSOLUTE_HTTP = /^https?:\/\/[^\s\\]+$/i;

export function safeBannerHref(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const text = raw.trim();
  if (!text || text.length > LINK_MAX) return undefined;
  if (INTERNAL_PATH.test(text)) return text;
  if (!ABSOLUTE_HTTP.test(text)) return undefined;
  try {
    const url = new URL(text);
    return (url.protocol === 'https:' || url.protocol === 'http:') && url.hostname ? text : undefined;
  } catch {
    return undefined;
  }
}
