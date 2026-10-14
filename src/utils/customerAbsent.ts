/**
 * Espera mínima do "cliente ausente" (spec D2 5.1, item 3). Fonte única para a rota
 * POST /deliveries/:id/cliente-ausente e para o GET /deliveries/:id (cronômetro da tela).
 * A regra não muda: espera mínima a partir da retirada. Só a fonte da hora ficou correta.
 */
export const DEFAULT_CUSTOMER_ABSENT_WAIT_MIN = 15;

type DateLike = Date | string;

export function customerAbsentWaitMinutes(cfg: { customerAbsentWaitMin?: number | null } | null | undefined): number {
  return cfg?.customerAbsentWaitMin ?? DEFAULT_CUSTOMER_ABSENT_WAIT_MIN;
}

/**
 * Início da espera: a retirada (`pickedAt`, gravada pelo PIN da loja desde a C2). Entregas
 * retiradas antes da C2 não têm `pickedAt`: aí vale o `updatedAt`, como era antes.
 * Usar só o `updatedAt` reiniciava a espera a cada escrita na entrega (ex.: PIN errado).
 */
export function customerAbsentWaitStart(d: { pickedAt?: DateLike | null; updatedAt: DateLike }): Date {
  return new Date(d.pickedAt ?? d.updatedAt);
}

/** Quando "Encerrar como ausente" libera; `null` se a entrega não está em trânsito (picked). */
export function customerAbsentAvailableAt(
  d: { status: string; pickedAt?: DateLike | null; updatedAt: DateLike },
  waitMin: number,
): Date | null {
  if (d.status !== 'picked') return null;
  return new Date(customerAbsentWaitStart(d).getTime() + waitMin * 60_000);
}
