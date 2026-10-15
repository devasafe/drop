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

/** Para rotas em que o 409 quer dizer "esse item já foi feito" (a tela decide se é o caso). */
export function isAlreadyDoneConflict(err: unknown): boolean {
  return isHttpStatus(err, 409);
}
