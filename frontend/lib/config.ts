/**
 * Configurações centralizadas do frontend.
 * Todas as URLs e variáveis de ambiente ficam aqui — nunca hardcoded nos componentes.
 */

// URL base do servidor (sem /api) - detecta hostname em runtime
const getApiUrl = () => {
  if (typeof window === 'undefined') {
    // Server-side (build-time)
    return 'https://api.dropapp.com.br';
  }
  
  // Client-side - verifica o hostname
  const hostname = window.location.hostname;
  
  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    // Development local
    return 'http://localhost:4000';
  }
  
  // Production
  return 'https://api.dropapp.com.br';
};

export const API_URL = getApiUrl();
export const API_BASE = `${API_URL}/api`;

/**
 * Converte um path de upload (ex: /uploads/foto.jpg) para URL absoluta e, quando a
 * imagem está no Cloudinary, injeta otimização de entrega:
 *   - f_auto  → formato moderno (webp/avif) automático
 *   - q_auto  → qualidade automática (menor peso, sem borrão perceptível)
 *   - w_<w>,c_limit → serve na largura pedida SEM upscale (c_limit nunca amplia
 *     além do original, evitando borrão de imagens pequenas)
 *
 * Passe `{ w }` com a largura de exibição (ex.: banner 1600, card 500) pra o
 * desktop receber a imagem nítida no tamanho certo, em vez de esticar a original.
 */
export function imageUrl(path: string | null | undefined, opts?: { w?: number }): string {
  if (!path) return '';
  let url = path;
  if (!(path.startsWith('http://') || path.startsWith('https://'))) {
    url = path.startsWith('/uploads/') ? `${API_URL}${path}` : path;
  }
  if (url.includes('res.cloudinary.com') && url.includes('/upload/') && !/\/upload\/[^/]*(f_auto|q_auto|w_\d|c_)/.test(url)) {
    const t = opts?.w ? `f_auto,q_auto,c_limit,w_${opts.w}` : 'f_auto,q_auto';
    url = url.replace('/upload/', `/upload/${t}/`);
  }
  return url;
}
