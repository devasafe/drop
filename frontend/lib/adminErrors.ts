/** Erros das ações do admin (spec D3a 6.1): a mensagem do servidor, nunca escondida; 403 com texto próprio. */

interface HttpLike {
  message?: string;
  response?: { status?: number; data?: { error?: unknown; message?: unknown } };
}

export function adminErrorMessage(err: unknown, fallback = 'Não deu certo. Tente de novo.'): string {
  const e = (err ?? {}) as HttpLike;
  const status = e.response?.status;
  if (status === 403) return 'Você não tem permissão para isso';
  const data = e.response?.data;
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
