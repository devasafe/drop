/**
 * Configurações centralizadas do frontend.
 * Todas as URLs e variáveis de ambiente ficam aqui — nunca hardcoded nos componentes.
 */

// URL base do servidor (sem /api) - detecta hostname em runtime
const getApiUrl = () => {
  if (typeof window === 'undefined') {
    // Server-side (build-time)
    return 'https://xdxrxoxpx.onrender.com';
  }
  
  // Client-side - verifica o hostname
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Development local
    return 'http://localhost:4000';
  }
  
  // Production
  return 'https://xdxrxoxpx.onrender.com';
};

export const API_URL = getApiUrl();
export const API_BASE = `${API_URL}/api`;

/**
 * Converte um path de upload (ex: /uploads/foto.jpg) para URL absoluta.
 * Se já for URL completa, retorna sem alteração.
 */
export function imageUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('http://') || path.startsWith('https://')) return path;
  if (path.startsWith('/uploads/')) return `${API_URL}${path}`;
  return path;
}
