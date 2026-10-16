/**
 * Erros do servidor nas telas de Dinheiro (D3a; também Lojas · Asaas, K18).
 * As rotas antigas respondem `{ error: 'texto' }`
 * (às vezes com `code` no topo); as do modo direto (AppError) respondem `{ success: false, error: { message, code } }`.
 * `adminErrorMessage` (P1.6) só lê o texto; aqui os dois formatos são lidos sem perder a mensagem nem o código.
 */
import { adminErrorMessage } from '../../../lib/adminErrors';

interface HttpLike {
  response?: { status?: number; data?: { error?: unknown; code?: unknown } };
}

const dataOf = (err: unknown) => ((err ?? {}) as HttpLike).response?.data;

/** Código estável do servidor ('WITHDRAWAL_NOT_PENDING', 'REFUND_ALREADY_DONE'…), ou null. */
export function serverErrorCode(err: unknown): string | null {
  const data = dataOf(err);
  if (!data) return null;
  if (typeof data.code === 'string' && data.code) return data.code;
  const nested = data.error as { code?: unknown } | undefined;
  return nested && typeof nested === 'object' && typeof nested.code === 'string' ? nested.code : null;
}

/** Mensagem do servidor nos dois formatos; 403 vira "Você não tem permissão para isso". */
export function serverErrorMessage(err: unknown, fallback?: string): string {
  if (((err ?? {}) as HttpLike).response?.status === 403) return adminErrorMessage(err, fallback);
  const nested = dataOf(err)?.error as { message?: unknown } | undefined;
  if (nested && typeof nested === 'object' && typeof nested.message === 'string' && nested.message) {
    return nested.message;
  }
  return adminErrorMessage(err, fallback);
}

/**
 * Para jogar dentro do `onClick` da AdminSheet: ela mostra `adminErrorMessage(err)`, que só lê `data.error`
 * em texto. Achata o erro sem perder o status nem o código.
 */
export function flattenServerError(
  err: unknown,
  fallback?: string,
): { response: { status?: number; data: { error: string; code?: string } } } {
  const status = ((err ?? {}) as HttpLike).response?.status;
  const code = serverErrorCode(err);
  return { response: { status, data: { error: serverErrorMessage(err, fallback), ...(code ? { code } : {}) } } };
}
