/**
 * Funções de sanitização de inputs para o frontend.
 * Previne XSS e erros de parsing em dados vindos de usuário ou APIs externas.
 */

/**
 * Converte um valor para coordenada geográfica válida.
 * Retorna null se o valor for inválido, NaN, Infinity ou fora do range.
 */
export function safeCoord(val: unknown): number | null {
  const n = parseFloat(String(val));
  if (isNaN(n) || !isFinite(n)) return null;
  if (n < -180 || n > 180) return null;
  return n;
}

/**
 * Valida um par latitude/longitude.
 * Latitude: -90 a 90 | Longitude: -180 a 180
 */
export function safeLatLng(lat: unknown, lng: unknown): { lat: number; lng: number } | null {
  const parsedLat = parseFloat(String(lat));
  const parsedLng = parseFloat(String(lng));

  if (isNaN(parsedLat) || !isFinite(parsedLat) || parsedLat < -90 || parsedLat > 90) return null;
  if (isNaN(parsedLng) || !isFinite(parsedLng) || parsedLng < -180 || parsedLng > 180) return null;

  return { lat: parsedLat, lng: parsedLng };
}

/**
 * Sanitiza string removendo caracteres de controle.
 * Útil antes de renderizar conteúdo em HTML.
 */
export function sanitizeString(val: unknown): string {
  if (typeof val !== 'string') return '';
  return val.replace(/[\x00-\x1F\x7F]/g, '').trim();
}
