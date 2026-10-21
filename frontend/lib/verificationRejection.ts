/**
 * Texto do item de verificação recusado nas telas da pessoa (D3b-2b, ruling 3).
 * - Com `resendRequested`, o DROP pediu reenvio e o texto é "Reenvie: …".
 * - Sem ele, é "Recusado: …" ("Recusada" no motoboy, como hoje). Nos dois casos a pessoa pode mandar de novo.
 * O motivo (`rejectionReason`) já vem pronto do servidor: "Rótulo" ou "Rótulo: mensagem".
 */
export interface RejectionLineOptions { word?: 'Recusado' | 'Recusada'; fallback: string }

export function rejectionLine(
  reason: string | null | undefined,
  resend: boolean | null | undefined,
  opts: RejectionLineOptions,
): string {
  const text = (reason ?? '').trim() || opts.fallback;
  return resend === true ? `Reenvie: ${text}` : `${opts.word ?? 'Recusado'}: ${text}`;
}
