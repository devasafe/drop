/**
 * D1 — esconde a chave Pix para exibição. A chave inteira só vive no banco e no envio
 * ao Asaas; a tela mostra o suficiente para o dono reconhecer a própria chave.
 */
type PixKind = 'CPF' | 'CNPJ' | 'EMAIL' | 'PHONE' | 'EVP';

const KINDS: readonly PixKind[] = ['CPF', 'CNPJ', 'EMAIL', 'PHONE', 'EVP'];

function normalizeKind(type?: string): PixKind | null {
  const t = String(type || '').trim().toUpperCase();
  return (KINDS as readonly string[]).includes(t) ? (t as PixKind) : null;
}

/** Mesma regra de `inferPixKeyType` do onboardingController: 11 dígitos sem "+" ou "(" = CPF. */
function inferKind(key: string): PixKind {
  if (key.includes('@')) return 'EMAIL';
  const digits = key.replace(/\D/g, '');
  const numeric = /^[\d.\-\/\s()+]+$/.test(key);
  if (numeric && digits.length === 11 && !key.startsWith('+') && !key.includes('(')) return 'CPF';
  if (numeric && digits.length === 14) return 'CNPJ';
  if (numeric && digits.length >= 10 && digits.length <= 13) return 'PHONE';
  return 'EVP';
}

function maskRandom(key: string): string {
  return key.length > 8 ? `${key.slice(0, 4)}…${key.slice(-4)}` : '****';
}

export function maskPixKey(key: string | null | undefined, type?: string): string | null {
  if (key == null) return null;
  const k = String(key).trim();
  if (!k) return null;
  const kind = normalizeKind(type) ?? inferKind(k);
  const d = k.replace(/\D/g, '');
  switch (kind) {
    case 'CPF':
      return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : maskRandom(k);
    case 'CNPJ':
      return d.length === 14 ? `**.***.${d.slice(5, 8)}/${d.slice(8, 12)}-**` : maskRandom(k);
    case 'EMAIL': {
      const at = k.lastIndexOf('@');
      return at >= 1 ? `${k[0]}***@${k.slice(at + 1)}` : maskRandom(k);
    }
    case 'PHONE':
      return d.length >= 10 ? `(**) *****-${d.slice(-4)}` : maskRandom(k);
    default:
      return maskRandom(k);
  }
}

/** A chave veio mascarada (copiada da tela)? Salvar isso quebraria o recebimento. */
export function looksMaskedPixKey(key: unknown): boolean {
  return typeof key === 'string' && /[*…]/.test(key);
}
