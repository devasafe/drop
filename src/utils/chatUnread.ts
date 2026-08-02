/**
 * Não-lidas DO usuário numa conversa. `unreadCount` é `[p1, p2]`; o índice do
 * usuário é 0 se ele é o participant1, senão 1. Evita o bug de contar a
 * própria mensagem enviada (que fica não-lida pro OUTRO) como não-lida pra si.
 */
export function unreadForUser(
  unreadCount: number[] | null | undefined,
  participant1UserId: string | number | null | undefined,
  userId: string | number | null | undefined,
): number {
  const arr = Array.isArray(unreadCount) ? unreadCount : [0, 0];
  const idx = String(participant1UserId) === String(userId) ? 0 : 1;
  return Number(arr[idx]) || 0;
}
