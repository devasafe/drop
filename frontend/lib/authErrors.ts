export interface AuthErrorView { title: string; body?: string }

/** Erro do POST /auth/login → o que a tela diz (o que houve + como resolver). */
export function loginErrorMessage(err: unknown): AuthErrorView {
  const res = (err as { response?: { status?: number; data?: any } })?.response;
  if (!res) return { title: 'Sem conexão', body: 'Confira a internet e tente de novo.' };
  const d = res.data || {};
  if (res.status === 429) return { title: 'Muitas tentativas', body: typeof d.error === 'string' ? d.error : 'Espere 15 minutos e tente de novo.' };
  if (res.status === 403) return { title: 'Conta bloqueada', body: d.reason || 'Fale com o suporte.' };
  if (res.status === 401) {
    const left = typeof d.attemptsLeft === 'number' ? d.attemptsLeft : null;
    if (left !== null && left <= 5) {
      return { title: 'E-mail ou senha não conferem', body: `${left === 1 ? 'Falta 1 tentativa' : `Faltam ${left} tentativas`} antes de uma pausa de 15 min.` };
    }
    return { title: 'E-mail ou senha não conferem', body: 'Confira os dados e tente de novo.' };
  }
  return { title: 'Não conseguimos entrar agora', body: typeof d.error === 'string' ? d.error : 'Tente de novo em instantes.' };
}
