import env from '../config/env';

/**
 * Prazo REAL do Pix de um pedido: criação + PIX_EXPIRATION_MINUTES (é quando o job expirePixOrders
 * cancela). O `expirationDate` do Asaas é o fim do dia, em texto sem fuso: não serve para a
 * contagem da tela (mostrava horas e, no Safari, nada).
 */
export function pixDeadline(createdAt: Date | string): string {
  const minutes = env.PIX_EXPIRATION_MINUTES || 30;
  return new Date(new Date(createdAt).getTime() + minutes * 60000).toISOString();
}

/** O Pix com o prazo do pedido e a hora do servidor (a tela corrige o relógio do aparelho). */
export function withPixDeadline<T extends object>(pix: T, createdAt: Date | string): T & { expiresAt: string; serverNow: string } {
  return { ...pix, expiresAt: pixDeadline(createdAt), serverNow: new Date().toISOString() };
}
