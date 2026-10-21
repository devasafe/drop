/** Erros das ações do admin (spec D3a 6.1): a mensagem do servidor, nunca escondida; 403 com texto próprio. */

interface HttpLike {
  message?: string;
  response?: { status?: number; data?: { error?: unknown; message?: unknown; code?: unknown } };
}

/**
 * 403 que não é falta de permissão: regra de dinheiro com texto próprio do servidor (D3b-3, spec 4.5).
 * Só estes códigos; qualquer outro 403 (com ou sem código) continua "Você não tem permissão para isso".
 */
const FORBIDDEN_WITH_SERVER_TEXT = new Set(['CASHBOX_SELF_APPROVAL', 'STAFF_TARGET_FORBIDDEN', 'SELF_ACTION_FORBIDDEN']);

export function adminErrorMessage(err: unknown, fallback = 'Não deu certo. Tente de novo.'): string {
  const e = (err ?? {}) as HttpLike;
  const status = e.response?.status;
  const data = e.response?.data;
  const ruleCode = typeof data?.code === 'string' && FORBIDDEN_WITH_SERVER_TEXT.has(data.code);
  if (status === 403 && !ruleCode) return 'Você não tem permissão para isso';
  if (data && typeof data.error === 'string' && data.error) return data.error;
  if (data && typeof data.message === 'string' && data.message) return data.message;
  if (!e.response && e.message === 'Network Error') return 'Sem conexão com o servidor. Tente de novo.';
  return fallback;
}

export function isHttpStatus(err: unknown, status: number): boolean {
  return ((err ?? {}) as HttpLike).response?.status === status;
}

/** 409 com o código exato do servidor (ex.: "já feito"). Um 409 de outro código nunca conta. */
export function isConflictWithCode(err: unknown, code: string): boolean {
  const e = (err ?? {}) as HttpLike & { response?: { data?: { code?: unknown } } };
  return e.response?.status === 409 && e.response?.data?.code === code;
}
